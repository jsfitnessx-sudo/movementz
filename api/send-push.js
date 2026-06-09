import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
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

async function canSendToRecipient(serviceClient, senderId, recipientId, type) {
  if (senderId === recipientId) return false;

  if (type === "message") {
    const { data: coachRows } = await serviceClient
      .from("coach_clients")
      .select("id")
      .eq("status", "active")
      .or(`and(coach_id.eq.${senderId},client_id.eq.${recipientId}),and(coach_id.eq.${recipientId},client_id.eq.${senderId})`)
      .limit(1);

    if (coachRows?.length) return true;

    const { data: mutualRows } = await serviceClient
      .from("mutual_connections")
      .select("id")
      .eq("status", "active")
      .or(`and(requester_id.eq.${senderId},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${senderId})`)
      .limit(1);

    return Boolean(mutualRows?.length);
  }

  return false;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    json(response, 501, { error: "Push notifications are not configured on the server yet." });
    return;
  }

  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    json(response, 401, { error: "Missing auth token." });
    return;
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const senderId = userData?.user?.id;

  if (userError || !senderId) {
    json(response, 401, { error: "You must be signed in." });
    return;
  }

  const recipientId = String(request.body?.recipientId || "");
  const title = String(request.body?.title || "Movementz update").slice(0, 120);
  const body = String(request.body?.body || "You have a new update.").slice(0, 240);
  const url = String(request.body?.url || "/").slice(0, 300);
  const type = String(request.body?.type || "message");

  const allowed = await canSendToRecipient(serviceClient, senderId, recipientId, type);
  if (!allowed) {
    json(response, 403, { error: "You cannot notify this user." });
    return;
  }

  const { data: subscriptions, error: subscriptionError } = await serviceClient
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", recipientId)
    .limit(10);

  if (subscriptionError) {
    json(response, 500, { error: subscriptionError.message });
    return;
  }

  let sent = 0;
  let failed = 0;
  const payload = JSON.stringify({ title, body, url, tag: type });

  await Promise.all((subscriptions || []).map(async (item) => {
    try {
      await webPush.sendNotification({
        endpoint: item.endpoint,
        keys: {
          p256dh: item.p256dh,
          auth: item.auth
        }
      }, payload);
      sent += 1;
    } catch (pushError) {
      failed += 1;
      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        await serviceClient.from("push_subscriptions").delete().eq("id", item.id);
      }
    }
  }));

  json(response, 200, { sent, failed });
}
