import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = new Set(["jsfitnessx@gmail.com"]);

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

function isAdminAccount(profile, authUser) {
  return (
    profile?.role === "admin" ||
    profile?.access_tier === "admin" ||
    ADMIN_EMAILS.has(normalizeEmail(profile?.email)) ||
    ADMIN_EMAILS.has(normalizeEmail(authUser?.email))
  );
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const supabaseUrl = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    json(response, 501, { error: "Admin coach invites are not configured yet." });
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
    json(response, 401, { error: `Admin auth failed: ${userError?.message || "no user found"}.` });
    return;
  }

  try {
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,email,role,access_tier")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      json(response, 500, { error: `Admin profile lookup failed: ${profileError.message}` });
      return;
    }

    if (!isAdminAccount(profile, authUser)) {
      json(response, 403, { error: "Only admins can create free coach invites." });
      return;
    }

    const normalizedEmail = normalizeEmail(request.body?.email);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invite, error: inviteError } = await serviceClient
      .from("invites")
      .insert({
        inviter_id: authUser.id,
        invite_type: "coach",
        email: normalizedEmail || null,
        expires_at: expiresAt
      })
      .select("invite_code")
      .single();

    if (inviteError) {
      json(response, 500, { error: `Could not create coach invite: ${inviteError.message}` });
      return;
    }

    json(response, 200, { inviteCode: invite?.invite_code });
  } catch (error) {
    json(response, 500, { error: error.message || "Could not create coach invite." });
  }
}
