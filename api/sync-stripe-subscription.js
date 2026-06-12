import { createClient } from "@supabase/supabase-js";

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
  const query = new URLSearchParams(params);
  const queryString = query.toString();
  const response = await fetch(`https://api.stripe.com/v1/${path}${queryString ? `?${queryString}` : ""}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Stripe lookup failed.");
  return data;
}

function activeStatus(status) {
  return ["active", "trialing"].includes(status);
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

async function profileHasPendingCoachStatus(serviceClient, userId) {
  const { data } = await serviceClient
    .from("profiles")
    .select("subscription_status")
    .eq("id", userId)
    .maybeSingle();
  return data?.subscription_status === "pending_coach";
}

async function provisionPaidCoach(serviceClient, values) {
  const { userId, customerId, subscriptionId, priceId, status, paidAccessUntil } = values;
  const { data, error } = await serviceClient.rpc("provision_paid_coach", {
    target_user_id: userId,
    customer_id: customerId,
    subscription_id: subscriptionId,
    price_id: priceId,
    subscription_status_input: status,
    paid_until: paidAccessUntil
  });

  if (error) throw new Error(`${error.message}. Run supabase/phase-36-paid-coach-provisioning-repair.sql in Supabase.`);
  if (!data?.length) throw new Error("Coach provisioning failed: no profile returned.");
  return data[0];
}

async function updatePaidUser(serviceClient, values) {
  const { userId, customerId, subscriptionId, priceId, status, paidAccessUntil } = values;
  const { data, error } = await serviceClient
    .from("profiles")
    .update({
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId || null,
      stripe_price_id: priceId || null,
      subscription_status: status || null,
      access_tier: activeStatus(status) ? "paid" : "free",
      paid_access_until: paidAccessUntil || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId)
    .select("id,role,access_tier,subscription_status")
    .maybeSingle();

  if (error) throw new Error(`Paid access sync failed: ${error.message}`);
  if (!data) throw new Error("Paid access sync failed: no matching profile.");
  return data;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
  const coachPriceId = process.env.STRIPE_COACH_PRICE_ID || "";
  const paidUserPriceId = process.env.STRIPE_PAID_USER_PRICE_ID || "";
  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!stripeSecretKey || !paidUserPriceId || !supabaseUrl || !supabaseServiceRoleKey) {
    json(response, 501, { error: "Stripe subscription sync is not configured yet." });
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
    json(response, 401, { error: `Subscription sync auth failed: ${userError?.message || "no user found"}.` });
    return;
  }

  try {
    const sessionId = request.body?.session_id;
    let customerId = "";
    let checkoutSession = null;
    let customer = null;
    let lineItems = null;
    let subscription = null;

    if (sessionId) {
      checkoutSession = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
      if ((checkoutSession.metadata?.user_id || checkoutSession.client_reference_id) === authUser.id) {
        customerId = checkoutSession.customer || "";
        if (customerId) {
          customer = await stripeGet(`customers/${encodeURIComponent(customerId)}`);
        }
        lineItems = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}/line_items`, {
          limit: "1",
          "expand[]": "data.price.product"
        });
        if (checkoutSession.subscription) {
          subscription = await stripeGet(`subscriptions/${encodeURIComponent(checkoutSession.subscription)}`);
        }
      }
    }

    if (!subscription) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("stripe_customer_id,subscription_status")
        .eq("id", authUser.id)
        .maybeSingle();
      customerId = customerId || profile?.stripe_customer_id || "";
      if (!customerId) throw new Error("No Stripe customer found for this account yet.");
      customer = customer || await stripeGet(`customers/${encodeURIComponent(customerId)}`);

      const subscriptions = await stripeGet("subscriptions", {
        customer: customerId,
        status: "all",
        limit: "10"
      });
      subscription = (subscriptions.data || []).find((item) => activeStatus(item.status)) || subscriptions.data?.[0];
    }

    if (!subscription?.id) throw new Error("No Stripe subscription found for this account.");

    const pendingCoach = await profileHasPendingCoachStatus(serviceClient, authUser.id);
    const accessType = checkoutSession?.metadata?.access_type ||
      subscription.metadata?.access_type ||
      customer?.metadata?.access_type ||
      accessTypeFromLineItems(lineItems) ||
      (pendingCoach ? "coach" : "");
    const priceId = priceIdFromSubscription(subscription) ||
      priceIdFromLineItems(lineItems) ||
      (accessType === "coach" ? coachPriceId : paidUserPriceId);
    const values = {
      userId: authUser.id,
      customerId: subscription.customer || customerId,
      subscriptionId: subscription.id,
      priceId,
      status: subscription.status,
      paidAccessUntil: paidUntilFromSubscription(subscription)
    };

    const profile = accessType === "coach" || priceId === coachPriceId
      ? await provisionPaidCoach(serviceClient, values)
      : await updatePaidUser(serviceClient, values);

    json(response, 200, { synced: true, profile });
  } catch (error) {
    json(response, 500, { error: error.message });
  }
}
