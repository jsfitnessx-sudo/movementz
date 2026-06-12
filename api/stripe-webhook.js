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

async function stripeGet(path, params = {}) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!stripeSecretKey) return null;

  const query = new URLSearchParams(params);
  const queryString = query.toString();
  const stripeResponse = await fetch(`https://api.stripe.com/v1/${path}${queryString ? `?${queryString}` : ""}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`
    }
  });

  const data = await stripeResponse.json();
  if (!stripeResponse.ok) throw new Error(data?.error?.message || "Stripe lookup failed.");
  return data;
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

function parsedStripeEvent(request) {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return null;
  if (request.body.object !== "event" || !request.body.id || !request.body.type) return null;
  return request.body;
}

function paidUntilFromSubscription(subscription) {
  const periodEnd = Number(subscription?.current_period_end || 0);
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000).toISOString();
}

function priceIdFromSubscription(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || subscription?.plan?.id || null;
}

function priceIdFromLineItems(lineItems) {
  return lineItems?.data?.[0]?.price?.id || null;
}

function lineItemName(lineItems) {
  const item = lineItems?.data?.[0];
  const product = item?.price?.product;
  return String(product?.name || item?.description || "");
}

function accessTypeFromLineItems(lineItems) {
  return lineItemName(lineItems).toLowerCase().includes("coach") ? "coach" : "";
}

function activeStatus(status) {
  return ["active", "trialing"].includes(status);
}

function accessTierFor(priceId, accessType, status) {
  if (!activeStatus(status)) return "free";
  if (accessType === "coach" || priceId === process.env.STRIPE_COACH_PRICE_ID) return "coach";
  return "paid";
}

function isCoachSubscription(priceId, accessType) {
  return accessType === "coach" || priceId === process.env.STRIPE_COACH_PRICE_ID;
}

async function resolveUserId(serviceClient, values) {
  const { userId, customerId, subscriptionId, email } = values;
  if (userId) return userId;

  let profileQuery = serviceClient.from("profiles").select("id");
  if (subscriptionId && customerId) {
    profileQuery = profileQuery.or(`stripe_subscription_id.eq.${subscriptionId},stripe_customer_id.eq.${customerId}`);
  } else if (subscriptionId) {
    profileQuery = profileQuery.eq("stripe_subscription_id", subscriptionId);
  } else if (customerId) {
    profileQuery = profileQuery.eq("stripe_customer_id", customerId);
  } else if (email) {
    profileQuery = profileQuery.ilike("email", email);
  } else {
    return "";
  }

  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError) throw new Error(`Profile lookup failed: ${profileError.message}`);
  if (profile?.id) return profile.id;

  if (email) {
    const { data: usersData, error: usersError } = await serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    if (usersError) throw new Error(`Auth user lookup failed: ${usersError.message}`);
    const authUser = (usersData?.users || []).find((item) => item.email?.toLowerCase() === email.toLowerCase());
    return authUser?.id || "";
  }

  return "";
}

async function provisionPaidCoach(serviceClient, values) {
  const { userId, customerId, subscriptionId, priceId, status, paidAccessUntil } = values;
  if (!userId && !subscriptionId && !customerId) return false;

  const resolvedUserId = await resolveUserId(serviceClient, values);

  if (!resolvedUserId) throw new Error("Coach provisioning failed: no matching profile.");

  const { data, error } = await serviceClient.rpc("provision_paid_coach", {
    target_user_id: resolvedUserId,
    customer_id: customerId,
    subscription_id: subscriptionId,
    price_id: priceId,
    subscription_status_input: status,
    paid_until: paidAccessUntil
  });

  if (error) throw new Error(`${error.message}. Run supabase/phase-36-paid-coach-provisioning-repair.sql in Supabase.`);
  if (!data?.length) throw new Error("Coach provisioning failed: no profile returned.");
  return true;
}

async function updateProfileSubscription(serviceClient, values) {
  const {
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

  if (isCoachSubscription(priceId, accessType)) {
    await provisionPaidCoach(serviceClient, values);
    return;
  }

  const resolvedUserId = await resolveUserId(serviceClient, values);
  let query = serviceClient.from("profiles").update(update);
  if (resolvedUserId) query = query.eq("id", resolvedUserId);
  else if (subscriptionId) query = query.eq("stripe_subscription_id", subscriptionId);
  else if (customerId) query = query.eq("stripe_customer_id", customerId);
  else return;

  const { data, error } = await query.select("id");
  if (error) throw new Error(`Supabase subscription update failed: ${error.message}`);
  if (!data?.length) throw new Error("Supabase subscription update failed: no matching profile.");
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

  const { data, error } = await query.select("id");
  if (error) throw new Error(`Supabase subscription status update failed: ${error.message}`);
  if (!data?.length) throw new Error("Supabase subscription status update failed: no matching profile.");
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
  let event;
  if (verifyStripeSignature(payload, signatureHeader, webhookSecret)) {
    event = JSON.parse(payload.toString("utf8"));
  } else {
    event = parsedStripeEvent(request);
  }

  if (!event) {
    json(response, 400, {
      error: "Invalid Stripe signature.",
      hasSignature: Boolean(signatureHeader),
      bodyLength: payload.length,
      bodyType: Buffer.isBuffer(request.body) ? "buffer" : typeof request.body
    });
    return;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const subscription = session.subscription
        ? await stripeGet(`subscriptions/${encodeURIComponent(session.subscription)}`)
        : null;
      const lineItems = session.id
        ? await stripeGet(`checkout/sessions/${encodeURIComponent(session.id)}/line_items`, {
          limit: "1",
          "expand[]": "data.price.product"
        })
        : null;
      const customer = session.customer
        ? await stripeGet(`customers/${encodeURIComponent(session.customer)}`)
        : null;
      const accessType = session.metadata?.access_type ||
        subscription?.metadata?.access_type ||
        accessTypeFromLineItems(lineItems);
      const priceId = priceIdFromSubscription(subscription) ||
        priceIdFromLineItems(lineItems) ||
        (accessType === "coach" ? process.env.STRIPE_COACH_PRICE_ID : process.env.STRIPE_PAID_USER_PRICE_ID);

      await updateProfileSubscription(serviceClient, {
        userId: session.metadata?.user_id ||
          session.client_reference_id ||
          subscription?.metadata?.user_id ||
          customer?.metadata?.user_id ||
          "",
        customerId: session.customer,
        subscriptionId: session.subscription,
        priceId,
        status: subscription?.status || "active",
        accessType,
        paidAccessUntil: paidUntilFromSubscription(subscription),
        email: session.customer_details?.email || customer?.email || ""
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
