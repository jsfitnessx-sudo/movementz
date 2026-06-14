import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = new Set(["jsfitnessx@gmail.com"]);
const PAID_MONTHLY_LIMIT = 1;
const MAX_PROMPT_LENGTH = 700;

function cleanSupabaseUrl(url) {
  const clean = String(url || "")
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/auth\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  try {
    const parsed = new URL(clean);
    return parsed.origin;
  } catch {
    return clean;
  }
}

function json(response, status, payload) {
  response.status(status).json(payload);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function paidUntilIsCurrent(value) {
  if (!value) return true;
  const expiry = new Date(value).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

function isAdminAccount(profile, authUser) {
  return (
    profile?.role === "admin" ||
    profile?.access_tier === "admin" ||
    ADMIN_EMAILS.has(normalizeEmail(profile?.email)) ||
    ADMIN_EMAILS.has(normalizeEmail(authUser?.email))
  );
}

function isCoachAccount(profile) {
  const status = String(profile?.subscription_status || "").toLowerCase();
  return profile?.access_tier === "coach" || (profile?.role === "coach" && status !== "pending_coach");
}

function hasPaidAccess(profile) {
  if (!profile) return false;
  if (["admin", "coach", "client"].includes(profile.role)) return true;
  if (profile.admin_granted_paid_access) return true;
  if (["admin", "coach"].includes(profile.access_tier)) return true;
  return profile.access_tier === "paid" && paidUntilIsCurrent(profile.paid_access_until);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function extractOutputText(data) {
  if (data?.output_text) return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function normalizeWorkoutDraft(rawDraft) {
  const draft = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const exercises = Array.isArray(draft.exercises) ? draft.exercises : [];
  return {
    name: clampText(draft.name, 80) || "AI workout",
    duration_minutes: parseNumber(draft.duration_minutes, 45, 10, 120),
    notes: clampText(draft.notes, 800),
    warm_up: clampText(draft.warm_up, 700),
    exercises: exercises.slice(0, 12).map((exercise, index) => ({
      exercise_name: clampText(exercise.exercise_name, 80) || `Exercise ${index + 1}`,
      muscle_group: clampText(exercise.muscle_group, 32) || "Full Body",
      sets: parseNumber(exercise.sets, 3, 1, 8),
      rep_min: parseNumber(exercise.rep_min, 8, 1, 100),
      rep_max: parseNumber(exercise.rep_max, 12, 1, 100),
      rest_seconds: parseNumber(exercise.rest_seconds, 75, 0, 300),
      notes: clampText(exercise.notes, 240)
    })),
    cooldown: clampText(draft.cooldown, 500)
  };
}

async function getUsage(serviceClient, userId, periodMonth) {
  const { count, error } = await serviceClient
    .from("ai_workout_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("period_month", periodMonth);

  if (error) {
    throw new Error(
      error.message.includes("ai_workout_generations")
        ? "AI Builder usage tracking is missing. Run supabase/phase-44-ai-workout-builder.sql in Supabase."
        : `Could not check AI usage: ${error.message}`
    );
  }

  return count || 0;
}

async function generateWorkoutWithOpenAI({ prompt, filters, model }) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("AI Builder is not configured yet. Add OPENAI_API_KEY in Vercel.");
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["name", "duration_minutes", "warm_up", "exercises", "cooldown", "notes"],
    properties: {
      name: { type: "string" },
      duration_minutes: { type: "integer" },
      warm_up: { type: "string" },
      cooldown: { type: "string" },
      notes: { type: "string" },
      exercises: {
        type: "array",
        minItems: 3,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["exercise_name", "muscle_group", "sets", "rep_min", "rep_max", "rest_seconds", "notes"],
          properties: {
            exercise_name: { type: "string" },
            muscle_group: { type: "string" },
            sets: { type: "integer" },
            rep_min: { type: "integer" },
            rep_max: { type: "integer" },
            rest_seconds: { type: "integer" },
            notes: { type: "string" }
          }
        }
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 1800,
      temperature: 0.4,
      input: [
        {
          role: "system",
          content: "You create safe, practical fitness workouts as structured JSON. Do not include medical claims. Prefer common exercises, clear rest guidance, and concise coaching notes."
        },
        {
          role: "user",
          content: [
            `Request: ${prompt}`,
            `Duration: ${filters.duration || "Use request"}`,
            `Level: ${filters.level || "Use request"}`,
            `Equipment: ${filters.equipment || "Use request"}`,
            `Goal: ${filters.goal || "Use request"}`,
            `Body focus: ${filters.focus || "Use request"}`,
            "Create a strength-style workout suitable for saving as a Movementz workout template."
          ].join("\n")
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "movementz_ai_workout",
          strict: true,
          schema
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const code = data?.error?.code || "";
    const message = data?.error?.message || "";
    if (code === "insufficient_quota" || message.toLowerCase().includes("quota")) {
      throw new Error("AI Builder is connected, but the OpenAI API key has no available billing or credits. Add billing/credits in OpenAI Platform, then try again. This did not use the member's monthly AI workout.");
    }
    throw new Error(message || "AI workout generation failed.");
  }

  const outputText = extractOutputText(data);
  if (!outputText) throw new Error("AI returned an empty workout.");
  return normalizeWorkoutDraft(JSON.parse(outputText));
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    json(response, 501, { error: "AI Builder auth is not configured yet." });
    return;
  }

  const authHeader = request.headers.authorization || request.headers.Authorization || "";
  const token = String(authHeader).replace(/^Bearer\s+/i, "");
  if (!token) {
    json(response, 401, { error: "Missing auth token." });
    return;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  const authUser = userData?.user;

  if (userError || !authUser?.id) {
    json(response, 401, { error: `AI Builder auth failed: ${userError?.message || "no user found"}.` });
    return;
  }

  try {
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,email,role,access_tier,paid_access_until,admin_granted_paid_access,subscription_status")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      json(response, 500, { error: `Profile lookup failed: ${profileError.message}` });
      return;
    }

    const unlimited = isAdminAccount(profile, authUser) || isCoachAccount(profile);
    const eligible = unlimited || hasPaidAccess(profile);
    if (!eligible) {
      json(response, 403, { error: "AI Builder is available to paid users, coaches and admins." });
      return;
    }

    const periodMonth = monthKey();
    const used = await getUsage(serviceClient, authUser.id, periodMonth);
    const remaining = unlimited ? null : Math.max(0, PAID_MONTHLY_LIMIT - used);

    if (request.method === "GET") {
      json(response, 200, {
        eligible,
        unlimited,
        limit: unlimited ? null : PAID_MONTHLY_LIMIT,
        used,
        remaining,
        periodMonth
      });
      return;
    }

    if (!unlimited && used >= PAID_MONTHLY_LIMIT) {
      json(response, 429, {
        error: "You have used your AI workout for this month.",
        code: "monthly_ai_workout_limit",
        limit: PAID_MONTHLY_LIMIT,
        used,
        remaining: 0,
        periodMonth
      });
      return;
    }

    const prompt = clampText(request.body?.prompt, MAX_PROMPT_LENGTH);
    if (prompt.length < 10) {
      json(response, 400, { error: "Describe the workout you want in at least 10 characters." });
      return;
    }

    const filters = {
      duration: clampText(request.body?.duration, 24),
      level: clampText(request.body?.level, 40),
      equipment: clampText(request.body?.equipment, 80),
      goal: clampText(request.body?.goal, 60),
      focus: clampText(request.body?.focus, 60)
    };
    const model = process.env.OPENAI_WORKOUT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const workout = await generateWorkoutWithOpenAI({ prompt, filters, model });

    const { error: insertError } = await serviceClient
      .from("ai_workout_generations")
      .insert({
        user_id: authUser.id,
        period_month: periodMonth,
        prompt,
        model
      });

    if (insertError) {
      throw new Error(
        insertError.message.includes("ai_workout_generations")
          ? "AI Builder usage tracking is missing. Run supabase/phase-44-ai-workout-builder.sql in Supabase."
          : `Workout generated, but usage could not be saved: ${insertError.message}`
      );
    }

    json(response, 200, {
      workout,
      usage: {
        unlimited,
        limit: unlimited ? null : PAID_MONTHLY_LIMIT,
        used: used + 1,
        remaining: unlimited ? null : Math.max(0, PAID_MONTHLY_LIMIT - used - 1),
        periodMonth
      }
    });
  } catch (error) {
    json(response, 500, { error: error.message || "Could not generate AI workout." });
  }
}
