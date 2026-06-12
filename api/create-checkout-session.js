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

async function stripeRequest(path, params) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Stripe request failed.");
  }
  return data;
}

function checkoutUrls(request) {
  const appUrl = String(process.env.VITE_APP_URL || process.env.APP_URL || request.headers.origin || "")
    .replace(/\/+$/, "");
  return {
    success_url: `${appUrl || "https://movementz79-app.vercel.app"}/?payment=success&tab=home`,
    cancel_url: `${appUrl || "https://movementz79-app.vercel.app"}/?payment=cancelled`
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
  const paidUserPriceId = process.env.STRIPE_PAID_USER_PRICE_ID || "";
  const coachPriceId = process.env.STRIPE_COACH_PRICE_ID || "";
  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!stripeSecretKey || !paidUserPriceId || !supabaseUrl || !supabaseServiceRoleKey) {
    json(response, 501, { error: "Stripe checkout is not configured yet." });
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
    json(response, 401, { error: `Checkout auth failed: ${userError?.message || "no user found"}.` });
    return;
  }

  const checkoutType = request.body?.type === "coach" ? "coach" : "paid_user";
  const priceId = checkoutType === "coach" ? coachPriceId : paidUserPriceId;

  if (!priceId) {
    json(response, 501, { error: "This checkout type is not configured yet." });
    return;
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id,email,full_name,first_name,last_name,stripe_customer_id")
    .eq("id", authUser.id)
    .maybeSingle();

  const displayName = profile?.full_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    authUser.user_metadata?.full_name ||
    authUser.email ||
    "Movementz user";
  let customerId = profile?.stripe_customer_id;

  try {
    if (!customerId) {
      const customer = await stripeRequest("customers", {
        email: profile?.email || authUser.email || "",
        name: displayName,
        "metadata[user_id]": authUser.id
      });
      customerId = customer.id;
      await serviceClient
        .from("profiles")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", authUser.id);
    }

    const session = await stripeRequest("checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: authUser.id,
      success_url: checkoutUrls(request).success_url,
      cancel_url: checkoutUrls(request).cancel_url,
      "metadata[user_id]": authUser.id,
      "metadata[access_type]": checkoutType,
      "subscription_data[metadata][user_id]": authUser.id,
      "subscription_data[metadata][access_type]": checkoutType
    });

    json(response, 200, { url: session.url });
  } catch (error) {
    json(response, 500, { error: error.message });
  }
}
