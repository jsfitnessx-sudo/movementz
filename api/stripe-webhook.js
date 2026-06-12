import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false
  }
};

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

async function readRawBody(request) {
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
  if (typeof request.rawBody === "string") return Buffer.from(request.rawBody);
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body);
  if (request.body && typeof request.body === "object") return Buffer.from(JSON.stringify(request.body));

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function verifyStripeSignature(payload, signatureHeader, secret) {
  const parts = String(signatureHeader || "").split(",").reduce((values, part) => {
    const [key, value] = part.split("=");
    if (key && value) values[key] = value;
    return values;
  }, {});
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function paidUntilFromSubscription(subscription) {
  const periodEnd = Number(subscription?.current_period_end || 0);
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000).toISOString();
}

function priceIdFromSubscription(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || subscription?.plan?.id || null;
}

function activeStatus(status) {
  return ["active", "trialing"].includes(status);
}

function accessTierFor(priceId, accessType, status) {
  if (!activeStatus(status)) return "free";
  if (accessType === "coach" || priceId === process.env.STRIPE_COACH_PRICE_ID) return "coach";
  return "paid";
}

async function updateProfileSubscription(serviceClient, values) {
  const {
    userId,
    customerId,
    subscriptionId,
    priceId,
    status,
    accessType,
    paidAccessUntil
  } = values;
  const update = {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    stripe_price_id: priceId || null,
    subscription_status: status || null,
    access_tier: accessTierFor(priceId, accessType, status),
    paid_access_until: paidAccessUntil || null,
    updated_at: new Date().toISOString()
  };

  let query = serviceClient.from("profiles").update(update);
  if (userId) query = query.eq("id", userId);
  else if (subscriptionId) query = query.eq("stripe_subscription_id", subscriptionId);
  else if (customerId) query = query.eq("stripe_customer_id", customerId);
  else return;

  await query;
}

async function updateProfileStatus(serviceClient, values) {
  const { customerId, subscriptionId, status } = values;
  const update = {
    subscription_status: status || null,
    updated_at: new Date().toISOString()
  };
  if (!activeStatus(status)) update.access_tier = "free";

  let query = serviceClient.from("profiles").update(update);
  if (subscriptionId) query = query.eq("stripe_subscription_id", subscriptionId);
  else if (customerId) query = query.eq("stripe_customer_id", customerId);
  else return;

  await query;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    json(response, 501, { error: "Stripe webhook is not configured yet." });
    return;
  }

  const payload = await readRawBody(request);
  const signatureHeader = request.headers["stripe-signature"] || request.headers["Stripe-Signature"];
  if (!verifyStripeSignature(payload, signatureHeader, webhookSecret)) {
    json(response, 400, { error: "Invalid Stripe signature." });
    return;
  }

  const event = JSON.parse(payload.toString("utf8"));
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await updateProfileSubscription(serviceClient, {
        userId: session.metadata?.user_id || session.client_reference_id,
        customerId: session.customer,
        subscriptionId: session.subscription,
        priceId: session.metadata?.access_type === "coach" ? process.env.STRIPE_COACH_PRICE_ID : process.env.STRIPE_PAID_USER_PRICE_ID,
        status: "active",
        accessType: session.metadata?.access_type || "paid_user",
        paidAccessUntil: null
      });
    }

    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object;
      await updateProfileSubscription(serviceClient, {
        userId: subscription.metadata?.user_id || "",
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        priceId: priceIdFromSubscription(subscription),
        status: subscription.status,
        accessType: subscription.metadata?.access_type || "",
        paidAccessUntil: paidUntilFromSubscription(subscription)
      });
    }

    if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      await updateProfileStatus(serviceClient, {
        customerId: invoice.customer,
        subscriptionId: invoice.subscription,
        status: event.type === "invoice.payment_succeeded" ? "active" : "past_due"
      });
    }

    json(response, 200, { received: true });
  } catch (error) {
    json(response, 500, { error: error.message });
  }
}
