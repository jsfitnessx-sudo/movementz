import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = new Set(["jsfitnessx@gmail.com"]);
const MAX_TEXT = 1200;

function cleanSupabaseUrl(url) {
  const clean = String(url || "")
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/auth\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  try {
    return new URL(clean).origin;
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

function clampText(value, maxLength = MAX_TEXT) {
  return String(value || "").trim().slice(0, maxLength);
}

function isAdminAccount(profile, authUser) {
  return (
    profile?.role === "admin" ||
    profile?.access_tier === "admin" ||
    ADMIN_EMAILS.has(normalizeEmail(profile?.email)) ||
    ADMIN_EMAILS.has(normalizeEmail(authUser?.email))
  );
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

function brandContext(brandVoice = {}) {
  return [
    `App name: ${clampText(brandVoice.app_name, 80) || "MUVMENTZ"}`,
    `Offer: ${clampText(brandVoice.offer_summary)}`,
    `Audiences: ${clampText(brandVoice.target_audiences)}`,
    `Tone: ${clampText(brandVoice.tone_notes)}`,
    `Use: ${clampText(brandVoice.words_to_use, 400)}`,
    `Avoid: ${clampText(brandVoice.words_to_avoid, 400)}`,
    `Default CTA: ${clampText(brandVoice.default_cta, 200)}`
  ].join("\n");
}

async function callOpenAI({ input, schema, schemaName, maxOutputTokens = 1200 }) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("Growth Studio AI is not configured yet. Add OPENAI_API_KEY in Vercel.");
  const model = process.env.OPENAI_GROWTH_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxOutputTokens,
      temperature: 0.7,
      input,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Growth Studio generation failed.";
    throw new Error(message);
  }
  const outputText = extractOutputText(data);
  if (!outputText) throw new Error("AI returned an empty response.");
  return JSON.parse(outputText);
}

async function generateContent(body) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["hook", "caption", "reel_idea", "script", "hashtags", "cta"],
    properties: {
      hook: { type: "string" },
      caption: { type: "string" },
      reel_idea: { type: "string" },
      script: { type: "string" },
      hashtags: {
        type: "array",
        minItems: 5,
        maxItems: 10,
        items: { type: "string" }
      },
      cta: { type: "string" }
    }
  };
  return callOpenAI({
    schema,
    schemaName: "muvmentz_growth_content",
    input: [
      {
        role: "system",
        content: "You create direct, practical fitness-app marketing content for MUVMENTZ. Keep it human, specific and non-cringey. Do not make medical or guaranteed result claims."
      },
      {
        role: "user",
        content: [
          brandContext(body.brandVoice),
          `Topic: ${clampText(body.topic, 180)}`,
          `Audience: ${clampText(body.audience, 80)}`,
          `Tone: ${clampText(body.tone, 80)}`,
          `Platform: ${clampText(body.platform, 80)}`,
          `Notes: ${clampText(body.notes)}`
        ].join("\n")
      }
    ]
  });
}

async function generateLeadMessage(body, mode) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
      message: { type: "string" }
    }
  };
  const lead = body.lead || {};
  return callOpenAI({
    schema,
    schemaName: "muvmentz_growth_outreach",
    maxOutputTokens: 700,
    input: [
      {
        role: "system",
        content: "You write short outreach for MUVMENTZ. Be warm, specific, legal and not spammy. No scraping language, no false familiarity, no pressure."
      },
      {
        role: "user",
        content: [
          brandContext(body.brandVoice),
          `Mode: ${mode === "follow_up" ? "follow-up after no reply" : "first outreach"}`,
          `Lead name: ${clampText(lead.name, 120)}`,
          `Business: ${clampText(lead.business_name, 160)}`,
          `Type: ${clampText(lead.lead_type, 80)}`,
          `Email/social/website: ${[lead.email, lead.social_url, lead.website_url].filter(Boolean).join(" | ")}`,
          `Notes: ${clampText(lead.notes)}`
        ].join("\n")
      }
    ]
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    json(response, 501, { error: "Growth Studio auth is not configured yet." });
    return;
  }

  const token = String(request.headers.authorization || request.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    json(response, 401, { error: "Missing auth token." });
    return;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  const authUser = userData?.user;
  if (userError || !authUser?.id) {
    json(response, 401, { error: `Growth Studio auth failed: ${userError?.message || "no user found"}.` });
    return;
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,email,role,access_tier")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError) {
    json(response, 500, { error: `Profile lookup failed: ${profileError.message}` });
    return;
  }
  if (!isAdminAccount(profile, authUser)) {
    json(response, 403, { error: "Only admins can use Growth Studio AI." });
    return;
  }

  try {
    const type = clampText(request.body?.type, 40);
    if (type === "content") {
      json(response, 200, { content: await generateContent(request.body || {}) });
      return;
    }
    if (type === "outreach" || type === "follow_up") {
      json(response, 200, await generateLeadMessage(request.body || {}, type));
      return;
    }
    json(response, 400, { error: "Unknown Growth Studio generation type." });
  } catch (error) {
    json(response, 500, { error: error.message || "Could not generate Growth Studio copy." });
  }
}
