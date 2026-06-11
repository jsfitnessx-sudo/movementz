import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

const fallbackAffirmations = {
  Confidence: ["I can handle today with courage.", "I trust myself to take the next step.", "I am allowed to take up space."],
  Consistency: ["Small actions repeated become strength.", "I do not need perfect. I need present.", "I can keep promises to myself today."],
  "Self-worth": ["I am enough before I achieve anything.", "My value is not measured by one hard day.", "I deserve care, patience and respect."],
  Stress: ["I can slow down and still move forward.", "One breath, one choice, one step.", "I can respond calmly instead of rushing."],
  Grief: ["I can carry love and still keep living.", "My feelings can be real without taking over.", "I give myself permission to move gently."],
  Discipline: ["Discipline is choosing the future I said I wanted.", "I do the next right thing.", "My standards guide me when motivation is quiet."],
  Recovery: ["Rest is part of progress.", "My body grows when I respect it.", "Recovery is productive."]
};

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

const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@movementz.app";

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function json(response, status, payload) {
  response.status(status).json(payload);
}

function sydneyParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour === "24" ? "0" : byType.hour)
  };
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickAffirmation({ themes, customAffirmations, dateKey }) {
  const selected = themes?.length ? themes : ["Confidence"];
  const customPool = customAffirmations
    .filter((affirmation) => selected.includes(affirmation.theme))
    .map((affirmation) => affirmation.text)
    .filter(Boolean);
  const fallbackPool = selected.flatMap((theme) => fallbackAffirmations[theme] || []);
  const pool = customPool.length ? customPool : fallbackPool;
  const options = pool.length ? pool : fallbackAffirmations.Confidence;
  return options[hashText(`${dateKey}:${selected.join("|")}`) % options.length];
}

function latestThemesByUser(logs = []) {
  const map = new Map();
  for (const log of logs) {
    if (!map.has(log.user_id)) map.set(log.user_id, log.affirmation_themes || []);
  }
  return map;
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  if (!supabaseUrl || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    json(response, 501, { error: "Daily affirmation push is not configured." });
    return;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const cronSecret = process.env.CRON_SECRET || "";
  const requestSecret = request.headers["x-cron-secret"] || request.query?.secret || "";
  const isVercelCron = request.headers["x-vercel-cron"] === "1";
  const authHeader = request.headers.authorization || request.headers.Authorization || "";
  const token = String(authHeader).replace(/^Bearer\s+/i, "");
  let isAdminTrigger = false;

  if (token) {
    const { data: userData } = await serviceClient.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userId) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      isAdminTrigger = profile?.role === "admin";
    }
  }

  if (!isVercelCron && !isAdminTrigger && (!cronSecret || requestSecret !== cronSecret)) {
    json(response, 401, { error: "Unauthorized." });
    return;
  }

  const { dateKey, hour } = sydneyParts();
  const force = request.query?.force === "1" || isAdminTrigger;
  if (!force && hour !== 10 && hour !== 11) {
    json(response, 200, { skipped: true, reason: "Not Sydney 10am/11am cron window.", dateKey, hour });
    return;
  }

  const { data: subscriptions, error: subscriptionError } = await serviceClient
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (subscriptionError) {
    json(response, 500, { error: subscriptionError.message });
    return;
  }

  const subscriptionsByUser = new Map();
  for (const item of subscriptions || []) {
    if (!subscriptionsByUser.has(item.user_id)) subscriptionsByUser.set(item.user_id, []);
    if (subscriptionsByUser.get(item.user_id).length < 3) subscriptionsByUser.get(item.user_id).push(item);
  }

  const userIds = [...subscriptionsByUser.keys()];
  if (!userIds.length) {
    json(response, 200, { sentUsers: 0, sentDevices: 0, failedDevices: 0 });
    return;
  }

  const [logsResponse, affirmationsResponse] = await Promise.all([
    serviceClient
      .from("daily_mindset_logs")
      .select("user_id,affirmation_themes,log_date")
      .in("user_id", userIds)
      .order("log_date", { ascending: false })
      .limit(2000),
    serviceClient
      .from("mindset_affirmations")
      .select("theme,text")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(300)
  ]);

  if (logsResponse.error) {
    json(response, 500, { error: logsResponse.error.message });
    return;
  }
  if (affirmationsResponse.error) {
    json(response, 500, { error: affirmationsResponse.error.message });
    return;
  }

  const themesByUser = latestThemesByUser(logsResponse.data || []);
  const customAffirmations = affirmationsResponse.data || [];
  let sentUsers = 0;
  let sentDevices = 0;
  let failedDevices = 0;

  for (const userId of userIds) {
    const affirmation = pickAffirmation({
      themes: themesByUser.get(userId),
      customAffirmations,
      dateKey
    });

    const { data: createdSend, error: sendLogError } = await serviceClient
      .from("daily_affirmation_pushes")
      .insert({
        user_id: userId,
        affirmation_date: dateKey,
        affirmation_text: affirmation
      })
      .select("id")
      .single();

    if (sendLogError?.code === "23505") continue;
    if (sendLogError || !createdSend?.id) continue;

    await serviceClient.from("app_notifications").insert({
      recipient_id: userId,
      actor_id: null,
      notification_type: "reminder",
      title: "Daily affirmation",
      body: affirmation,
      link_tab: "mindset",
      link_payload: { dateKey, source: "daily_affirmation" }
    });

    const payload = JSON.stringify({
      title: "Daily affirmation",
      body: affirmation,
      url: "/?tab=mindset",
      tag: `daily-affirmation-${dateKey}`
    });

    let userDeviceSends = 0;
    await Promise.all((subscriptionsByUser.get(userId) || []).map(async (item) => {
      try {
        await webPush.sendNotification({
          endpoint: item.endpoint,
          keys: {
            p256dh: item.p256dh,
            auth: item.auth
          }
        }, payload);
        sentDevices += 1;
        userDeviceSends += 1;
      } catch (pushError) {
        failedDevices += 1;
        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          await serviceClient.from("push_subscriptions").delete().eq("id", item.id);
        }
      }
    }));

    await serviceClient
      .from("daily_affirmation_pushes")
      .update({ push_count: userDeviceSends, sent_at: new Date().toISOString() })
      .eq("id", createdSend.id);
    sentUsers += 1;
  }

  json(response, 200, { sentUsers, sentDevices, failedDevices, dateKey, hour });
}
