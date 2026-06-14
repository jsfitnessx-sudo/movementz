import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "../layouts/AppLayout.jsx";
import { AdminRequestsScreen } from "../features/admin/AdminRequestsScreen.jsx";
import { AdminCoachesScreen } from "../features/admin/AdminCoachesScreen.jsx";
import { AdminSettingsScreen } from "../features/admin/AdminSettingsScreen.jsx";
import { AdminUsersScreen } from "../features/admin/AdminUsersScreen.jsx";
import { AppointmentsScreen } from "../features/appointments/AppointmentsScreen.jsx";
import { AuthScreen } from "../features/auth/AuthScreen.jsx";
import { ClientsScreen } from "../features/clients/ClientsScreen.jsx";
import { MutualFeedScreen } from "../features/feed/MutualFeedScreen.jsx";
import { FoodLogScreen } from "../features/food/FoodLogScreen.jsx";
import { HabitsScreen } from "../features/habits/HabitsScreen.jsx";
import { HomeScreen } from "../features/home/HomeScreen.jsx";
import { MindsetScreen } from "../features/mindset/MindsetScreen.jsx";
import { MessagesScreen } from "../features/messages/MessagesScreen.jsx";
import { PlansScreen } from "../features/plans/PlansScreen.jsx";
import { ProfileScreen } from "../features/profile/ProfileScreen.jsx";
import { ProgressPhotosScreen } from "../features/progress/ProgressPhotosScreen.jsx";
import { PlaceholderScreen } from "../features/shared/PlaceholderScreen.jsx";
import { UpgradePromptScreen } from "../features/shared/UpgradePromptScreen.jsx";
import { PublicTemplateLibraryScreen } from "../features/templates/PublicTemplateLibraryScreen.jsx";
import { TodayScreen } from "../features/today/TodayScreen.jsx";
import { WorkoutLibraryScreen } from "../features/workouts/WorkoutLibraryScreen.jsx";
import { tabIsLocked } from "../lib/access/paidAccess.js";
import { roleTabs } from "../lib/roles/roleTabs.js";
import { getInitialRole } from "../lib/roles/getInitialRole.js";
import { movementzWordmarkSrc } from "../lib/brandAssets.js";
import { enablePhonePushNotifications, getPushStatus } from "../lib/pushNotifications.js";
import { hasSupabaseConfig, supabase } from "../lib/supabase/client.js";

const COACH_SIGNUP_INTENT_KEY = "movementz.pendingCoachSignupEmail";
const ADMIN_EMAILS = new Set(["jsfitnessx@gmail.com"]);
const BOOT_TIMEOUT_MS = 8000;
const PROFILE_TIMEOUT_MS = 8000;

function withTimeout(promise, timeoutMs, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timerId);
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.has(normalizeEmail(email));
}

function hasPendingCoachSignupIntent(authUser) {
  if (typeof window === "undefined" || !authUser?.email) return false;
  return normalizeEmail(window.localStorage.getItem(COACH_SIGNUP_INTENT_KEY)) === normalizeEmail(authUser.email);
}

function clearPendingCoachSignupIntent(authUser) {
  if (typeof window === "undefined") return;
  if (!authUser?.email || hasPendingCoachSignupIntent(authUser)) {
    window.localStorage.removeItem(COACH_SIGNUP_INTENT_KEY);
  }
}

function isAdminProfile(profile, authUser = null) {
  return (
    profile?.role === "admin" ||
    profile?.access_tier === "admin" ||
    isAdminEmail(profile?.email) ||
    isAdminEmail(authUser?.email)
  );
}

function roleForProfile(profile, authUser = null) {
  return isAdminProfile(profile, authUser) ? "admin" : profile?.role || "normal_user";
}

async function loadProfile(authUser) {
  if (!supabase || !authUser?.id) return null;

  const { data, error } = await withTimeout(supabase
    .from("profiles")
    .select("id,email,full_name,first_name,last_name,role,avatar_url,gender,age,location")
    .eq("id", authUser.id)
    .maybeSingle(), PROFILE_TIMEOUT_MS, "Profile load");

  if (error) {
    console.warn("Profile load failed", error);
    return null;
  }

  if (data) return { ...data, ...(await loadProfileAccess(authUser.id)) };

  const metadata = authUser.user_metadata ?? {};
  const isPendingCoachSignup = metadata.intended_role === "coach";
  const isProtectedAdmin = isAdminEmail(authUser.email);
  const fallbackProfile = {
    id: authUser.id,
    email: authUser.email,
    full_name: metadata.full_name || "",
    role: metadata.role === "admin" || isProtectedAdmin ? "admin" : isPendingCoachSignup ? "coach" : "normal_user",
    gender: metadata.gender || null,
    age: metadata.age ? Number(metadata.age) : null,
    location: metadata.location || null,
    subscription_status: isPendingCoachSignup && !isProtectedAdmin ? "pending_coach" : null
  };

  if (isPendingCoachSignup) {
    return { ...fallbackProfile, ...(await loadProfileAccess(authUser.id)) };
  }

  const { data: insertedProfile, error: insertError } = await withTimeout(supabase
    .from("profiles")
    .insert(fallbackProfile)
    .select("id,email,full_name,first_name,last_name,role,avatar_url,gender,age,location")
    .single(), PROFILE_TIMEOUT_MS, "Profile create");

  if (insertError) {
    console.warn("Profile create failed", insertError);
    return { ...fallbackProfile, ...(await loadProfileAccess(authUser.id)) };
  }

  if (fallbackProfile.role === "coach") {
    await supabase.from("coach_profiles").upsert({
      user_id: authUser.id,
      qualification: metadata.qualification || null,
      experience_areas: Array.isArray(metadata.experience_areas)
        ? metadata.experience_areas
        : [],
      about_me: metadata.about_me || null
    });
  }

  return { ...insertedProfile, ...(await loadProfileAccess(authUser.id)) };
}

async function loadProfileAccess(userId) {
  if (!supabase || !userId) return {};

  const { data, error } = await withTimeout(supabase
    .from("profiles")
    .select("access_tier,paid_access_until,admin_granted_paid_access,feature_overrides,stripe_customer_id,stripe_subscription_id,subscription_status")
    .eq("id", userId)
    .maybeSingle(), PROFILE_TIMEOUT_MS, "Profile access load");

  if (error) {
    return {};
  }

  return data || {};
}

function buildUser(session, profile) {
  const authUser = session?.user;
  const displayName =
    profile?.full_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    authUser?.user_metadata?.full_name ||
    authUser?.email ||
    "Movementz athlete";

  return {
    id: authUser?.id ?? "demo-user",
    email: authUser?.email ?? profile?.email,
    name: displayName,
    avatarUrl: profile?.avatar_url
  };
}

function isCoachPaymentPending(session, profile) {
  if (!session?.user || !profile) return false;
  if (isAdminProfile(profile)) return false;
  const intendedRole = session.user.user_metadata?.intended_role;
  const hasLocalCoachIntent = hasPendingCoachSignupIntent(session.user);
  const isPendingCoachProfile = profile.subscription_status === "pending_coach";
  const isUnlockedCoach =
    profile.access_tier === "coach" ||
    (profile.role === "coach" && ["active", "trialing"].includes(String(profile.subscription_status || "").toLowerCase())) ||
    profile.admin_granted_paid_access;

  return (intendedRole === "coach" || hasLocalCoachIntent || isPendingCoachProfile) && !isUnlockedCoach;
}

function hasCoachAccess(profile) {
  const status = String(profile?.subscription_status || "").toLowerCase();
  return (
    profile?.access_tier === "coach" ||
    (
      profile?.role === "coach" &&
      (profile?.admin_granted_paid_access || status !== "pending_coach")
    )
  );
}

function clearRestoreSessionMessage(setAppMessage) {
  setAppMessage((current) =>
    current === "We could not restore your session. Please log in again." ? "" : current
  );
}

function CoachCheckoutGate({ appMessage, onContinue, onSignOut }) {
  return (
    <main className="auth-screen">
      <section className="auth-card auth-brand">
        <img className="auth-wordmark" src={movementzWordmarkSrc} alt="Movementz" />
        <p>Coach account created.</p>
        <p>Complete the coach subscription to unlock your coach dashboard.</p>
        {appMessage ? <div className="auth-status">{appMessage}</div> : null}
        <div className="auth-actions">
          <button type="button" onClick={onContinue}>Continue to payment</button>
          <button type="button" className="ghost-button" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const forcedSignupMode = useMemo(() => {
    const signupMode = new URLSearchParams(window.location.search).get("signup");
    return ["user", "coach"].includes(signupMode) ? signupMode : "";
  }, []);
  const requestedTabRef = useRef(new URLSearchParams(window.location.search).get("tab") || "");
  const coachCheckoutStartedRef = useRef(false);
  const coachInviteCode = useMemo(() => new URLSearchParams(window.location.search).get("coach_invite") || "", []);
  const [booting, setBooting] = useState(hasSupabaseConfig);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(getInitialRole);
  const [pendingInviteCode, setPendingInviteCode] = useState(() => new URLSearchParams(window.location.search).get("invite") || "");
  const [pendingCoachInviteCode, setPendingCoachInviteCode] = useState(coachInviteCode);
  const [claimedInviteCode, setClaimedInviteCode] = useState("");
  const [pendingInvite, setPendingInvite] = useState(null);
  const [clientSignupInvite, setClientSignupInvite] = useState(null);
  const [handlingInvite, setHandlingInvite] = useState(false);
  const [previewAccount, setPreviewAccount] = useState(null);
  const [appMessage, setAppMessage] = useState("");
  const [coachCheckoutRedirecting, setCoachCheckoutRedirecting] = useState(false);
  const [workoutIntent, setWorkoutIntent] = useState("");
  const [notificationSummary, setNotificationSummary] = useState({
    unread_total: 0,
    unread_messages: 0,
    items: [],
    open: false,
    badges: {}
  });
  const [pushStatus, setPushStatus] = useState({
    supported: false,
    permission: "default",
    subscribed: false,
    configured: false,
    enabling: false,
    message: "",
    error: false
  });
  const notificationCountRef = useRef(0);
  const effectiveRole = previewAccount?.role || role;
  const effectiveProfile = useMemo(() => previewAccount ? {
    id: previewAccount.id,
    email: previewAccount.email,
    full_name: previewAccount.name,
    role: previewAccount.role,
    avatar_url: previewAccount.avatarUrl,
    access_tier: previewAccount.access_tier,
    paid_access_until: previewAccount.paid_access_until,
    admin_granted_paid_access: previewAccount.admin_granted_paid_access,
    feature_overrides: previewAccount.feature_overrides
  } : profile, [previewAccount, profile]);
  const tabs = useMemo(
    () => (roleTabs[effectiveRole] ?? roleTabs.normal_user).map((tab) => ({
      ...tab,
      locked: tabIsLocked(tab.id, effectiveProfile, effectiveRole)
    })),
    [effectiveProfile, effectiveRole]
  );
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const accountUser = useMemo(() => buildUser(session, profile), [session, profile]);
  const user = useMemo(() => previewAccount ? {
    id: previewAccount.id,
    email: previewAccount.email,
    name: previewAccount.name,
    avatarUrl: previewAccount.avatarUrl
  } : accountUser, [accountUser, previewAccount]);
  const sessionAccessToken = session?.access_token || "";

  useEffect(() => {
    const requestedTab = requestedTabRef.current;
    if (!requestedTab || !tabs.some((tab) => tab.id === requestedTab)) return;
    setActiveTab(requestedTab);
    requestedTabRef.current = "";
  }, [tabs]);
  const lockedActiveTab = tabIsLocked(activeTab, effectiveProfile, effectiveRole);
  const coachPaymentPending = !previewAccount && isCoachPaymentPending(session, profile);

  useEffect(() => {
    const paymentParams = new URLSearchParams(window.location.search);
    const paymentStatus = paymentParams.get("payment");
    const checkoutSessionId = paymentParams.get("session_id") || "";
    if (!supabase || paymentStatus !== "success" || !session?.user) return undefined;

    setCoachCheckoutRedirecting(false);
    setAppMessage("Payment received. Unlocking your access...");
    let alive = true;

    Promise.resolve().then(async () => {
      try {
        const response = await fetch("/api/sync-stripe-subscription", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ session_id: checkoutSessionId })
        });
        const payload = await response.json();
        if (!alive) return;
        if (!response.ok) {
          setAppMessage(payload.error || "Payment received, but access sync is still pending.");
          return;
        }
        const nextProfile = await loadProfile(session.user);
        if (!alive) return;
        const nextRole = roleForProfile(nextProfile, session.user);
        setProfile(nextProfile);
        setRole(nextRole);
        setActiveTab((roleTabs[nextRole] ?? roleTabs.normal_user)[0].id);
        if (nextRole === "admin") {
          clearPendingCoachSignupIntent(session.user);
          setAppMessage("Admin access restored. Coach checkout is not required.");
        } else if (hasCoachAccess(nextProfile)) {
          clearPendingCoachSignupIntent(session.user);
          setAppMessage("Coach access unlocked.");
        } else {
          setAppMessage("Paid access unlocked.");
        }
      } catch (error) {
        if (alive) setAppMessage(error.message || "Payment received, but access sync is still pending.");
      }
    });

    const timers = [900, 2600, 5200].map((delay) => window.setTimeout(async () => {
      const nextProfile = await loadProfile(session.user);
      if (!alive) return;
      const nextRole = roleForProfile(nextProfile, session.user);
      setProfile(nextProfile);
      setRole(nextRole);
      if (nextRole === "admin") {
        clearPendingCoachSignupIntent(session.user);
        setActiveTab((roleTabs.admin ?? roleTabs.normal_user)[0].id);
        setAppMessage("Admin access restored. Coach checkout is not required.");
      } else if (hasCoachAccess(nextProfile)) {
        clearPendingCoachSignupIntent(session.user);
        setActiveTab((roleTabs.coach ?? roleTabs.normal_user)[0].id);
        setAppMessage("Coach access unlocked.");
      } else if (nextProfile?.access_tier === "paid" || nextProfile?.admin_granted_paid_access || ["admin", "client"].includes(nextProfile?.role)) {
        setAppMessage("Paid access unlocked.");
      }
    }, delay));

    return () => {
      alive = false;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [session?.user, sessionAccessToken]);

  const playNotificationSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(740, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.08);
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    } catch {
      // Browsers can block audio before a user gesture; the badge still updates.
    }
  }, []);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!supabase || !session?.user?.id || previewAccount) return;

    const { data, error } = await supabase.rpc("get_my_notification_summary");
    if (error) {
      console.warn("Notification summary failed", error);
      return;
    }

    const nextSummary = {
      unread_total: Number(data?.unread_total || 0),
      unread_messages: Number(data?.unread_messages || 0),
      items: Array.isArray(data?.items) ? data.items : [],
      badges: {
        messages: Number(data?.unread_messages || 0)
      }
    };
    const nextCount = nextSummary.unread_total + nextSummary.unread_messages;
    if (!silent && nextCount > notificationCountRef.current) {
      playNotificationSound();
    }
    notificationCountRef.current = nextCount;
    setNotificationSummary((current) => ({
      ...nextSummary,
      open: current.open
    }));
  }, [playNotificationSound, previewAccount, session?.user?.id]);

  const markNotificationsRead = useCallback(async ({ notificationId = null, filterType = null } = {}) => {
    if (!supabase || !session?.user?.id || previewAccount) return;
    await supabase.rpc("mark_app_notifications_read", {
      notification_id: notificationId,
      filter_type: filterType
    });
    await loadNotifications({ silent: true });
  }, [loadNotifications, previewAccount, session?.user?.id]);

  const toggleNotifications = useCallback(() => {
    setNotificationSummary((current) => ({ ...current, open: !current.open }));
  }, []);

  const refreshPushStatus = useCallback(async ({ silent = true } = {}) => {
    if (!session?.user?.id || previewAccount) return;
    try {
      const nextStatus = await getPushStatus();
      setPushStatus((current) => ({
        ...current,
        ...nextStatus,
        message: silent ? current.message : current.message,
        error: false
      }));
    } catch {
      setPushStatus((current) => ({
        ...current,
        supported: false,
        message: silent ? current.message : "Phone notifications are not available on this device.",
        error: true
      }));
    }
  }, [previewAccount, session?.user?.id]);

  const handleEnablePush = useCallback(async () => {
    setPushStatus((current) => ({ ...current, enabling: true, message: "", error: false }));
    try {
      const nextStatus = await enablePhonePushNotifications();
      setPushStatus((current) => ({
        ...current,
        ...nextStatus,
        enabling: false,
        message: "Phone notifications enabled on this device.",
        error: false
      }));
    } catch (pushError) {
      setPushStatus((current) => ({
        ...current,
        enabling: false,
        message: pushError.message,
        error: true
      }));
    }
  }, []);

  async function handleNotificationSelect(notification) {
    await markNotificationsRead({ notificationId: notification.id });
    setNotificationSummary((current) => ({ ...current, open: false }));
    if (notification.link_tab === "workouts" && notification.link_payload?.view === "shared") {
      setWorkoutIntent("shared");
    }
    if (notification.link_tab) {
      setActiveTab(notification.link_tab);
    }
  }

  const previewInviteIfNeeded = useCallback(
    async (nextSession) => {
      const code = pendingInviteCode.trim();
      if (!code || claimedInviteCode === code || !supabase || !nextSession?.user?.id) return null;

      const { data, error } = await supabase.rpc("preview_client_invite", {
        invite_code_input: code
      });

      if (error) {
        setAppMessage(`${error.message}.`);
        return null;
      }

      if (!data?.length) {
        setAppMessage("Invite link is invalid, already used, or expired.");
        setClaimedInviteCode(code);
        return null;
      }

      setPendingInvite(data[0]);
      setAppMessage("");
      return data[0];
    },
    [claimedInviteCode, pendingInviteCode]
  );

  useEffect(() => {
    if (!supabase || session?.user || !pendingInviteCode) {
      setClientSignupInvite(null);
      return undefined;
    }

    let alive = true;

    Promise.resolve().then(async () => {
      const { data, error } = await supabase.rpc("preview_client_signup_invite", {
        invite_code_input: pendingInviteCode
      });

      if (!alive) return;
      if (error || !data?.length) {
        setClientSignupInvite(null);
        return;
      }

      setClientSignupInvite(data[0]);
    });

    return () => {
      alive = false;
    };
  }, [pendingInviteCode, session?.user]);

  useEffect(() => {
    if (!supabase) return undefined;

    let alive = true;

    async function boot() {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), BOOT_TIMEOUT_MS, "Session load");
        if (!alive) return;

        const nextSession = data.session;
        if (nextSession?.user) {
          const nextProfile = await loadProfile(nextSession.user);
          if (!alive) return;
          if (isAdminProfile(nextProfile, nextSession.user)) {
            clearPendingCoachSignupIntent(nextSession.user);
            if (forcedSignupMode) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            setSession(nextSession);
            setProfile(nextProfile);
            setRole(roleForProfile(nextProfile, nextSession.user));
            clearRestoreSessionMessage(setAppMessage);
            return;
          }

          if (forcedSignupMode) {
            await withTimeout(supabase.auth.signOut({ scope: "local" }), BOOT_TIMEOUT_MS, "Sign out");
            if (!alive) return;
            setSession(null);
            setProfile(null);
            setRole("normal_user");
            return;
          }

          setSession(nextSession);
          setProfile(nextProfile);
          setRole(roleForProfile(nextProfile, nextSession.user));
          clearRestoreSessionMessage(setAppMessage);
          return;
        }

        if (forcedSignupMode) {
          await withTimeout(supabase.auth.signOut({ scope: "local" }), BOOT_TIMEOUT_MS, "Sign out");
          if (!alive) return;
          setSession(null);
          setProfile(null);
          setRole("normal_user");
          return;
        }

        setSession(null);
      } catch (error) {
        console.warn("App boot failed", error);
        if (!alive) return;
        setSession(null);
        setProfile(null);
        setRole("normal_user");
        setAppMessage("We could not restore your session. Please log in again.");
      } finally {
        if (alive) setBooting(false);
      }
    }

    boot();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        setSession(nextSession);

        if (nextSession?.user) {
          const nextProfile = await loadProfile(nextSession.user);
          if (isAdminProfile(nextProfile, nextSession.user)) {
            clearPendingCoachSignupIntent(nextSession.user);
          }
          setProfile(nextProfile);
          setRole(roleForProfile(nextProfile, nextSession.user));
          clearRestoreSessionMessage(setAppMessage);
        } else {
          setProfile(null);
          setRole("normal_user");
        }
      } catch (error) {
        console.warn("Auth state refresh failed", error);
        setProfile(null);
        setRole("normal_user");
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [forcedSignupMode]);

  useEffect(() => {
    if (activeTab === "profile" || activeTab === "templates") return;

    const nextTabs = roleTabs[effectiveRole] ?? roleTabs.normal_user;
    if (!nextTabs.some((tab) => tab.id === activeTab)) {
      Promise.resolve().then(() => setActiveTab(nextTabs[0].id));
    }
  }, [activeTab, effectiveRole]);

  useEffect(() => {
    if (!session?.user || !pendingInviteCode || claimedInviteCode === pendingInviteCode) return undefined;

    let alive = true;

    Promise.resolve().then(async () => {
      if (alive) await previewInviteIfNeeded(session);
    });

    return () => {
      alive = false;
    };
  }, [claimedInviteCode, previewInviteIfNeeded, pendingInviteCode, session]);

  useEffect(() => {
    if (!session?.user || !pendingCoachInviteCode || !supabase) return undefined;

    let alive = true;

    Promise.resolve().then(async () => {
      const { error } = await supabase.rpc("accept_admin_coach_invite", {
        invite_code_input: pendingCoachInviteCode
      });

      if (!alive) return;

      if (error) {
        setAppMessage(error.message);
        return;
      }

      const nextProfile = await loadProfile(session.user);
      if (!alive) return;
      const nextRole = roleForProfile(nextProfile, session.user);
      setProfile(nextProfile);
      setRole(nextRole);
      setActiveTab((roleTabs[nextRole] ?? roleTabs.normal_user)[0].id);
      setPendingCoachInviteCode("");
      window.history.replaceState({}, document.title, window.location.pathname);
      setAppMessage("Coach access confirmed.");
    });

    return () => {
      alive = false;
    };
  }, [pendingCoachInviteCode, session]);

  useEffect(() => {
    if (!session?.user?.id || previewAccount) return undefined;
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadNotifications({ silent: true });
    });
    const interval = window.setInterval(() => {
      if (alive) loadNotifications();
    }, 20000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [loadNotifications, previewAccount, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || previewAccount) return undefined;
    let alive = true;
    Promise.resolve().then(async () => {
      if (alive) await refreshPushStatus();
    });
    return () => {
      alive = false;
    };
  }, [previewAccount, refreshPushStatus, session?.user?.id]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (!requestedTab || !tabs.some((tab) => tab.id === requestedTab)) return;
    setActiveTab(requestedTab);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [tabs]);

  function handleDemoLogin(nextRole) {
    setRole(nextRole);
    setActiveTab((roleTabs[nextRole] ?? roleTabs.normal_user)[0].id);
    setSession({
      user: {
        id: "demo-user",
        name: nextRole === "coach" ? "Coach Demo" : "Joseph Salaivao"
      }
    });
  }

  async function startCoachCheckout(nextSession = session) {
    const token = nextSession?.access_token;
    if (!token) {
      setAppMessage("Log in before starting coach checkout.");
      return;
    }
    if (coachCheckoutStartedRef.current) return;
    coachCheckoutStartedRef.current = true;
    setCoachCheckoutRedirecting(true);

    const latestProfile = await loadProfile(nextSession.user);
    if (isAdminProfile(latestProfile, nextSession.user)) {
      clearPendingCoachSignupIntent(nextSession.user);
      coachCheckoutStartedRef.current = false;
      setCoachCheckoutRedirecting(false);
      setProfile(latestProfile);
      setRole("admin");
      setSession(nextSession);
      setActiveTab((roleTabs.admin ?? roleTabs.normal_user)[0].id);
      window.history.replaceState({}, document.title, window.location.pathname);
      setAppMessage("Admin access restored. Coach checkout is not required.");
      return;
    }

    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "coach" })
    });
    const payload = await response.json();
    if (!response.ok || !payload.url) {
      coachCheckoutStartedRef.current = false;
      setCoachCheckoutRedirecting(false);
      setAppMessage(payload.error || "Could not start coach checkout.");
      return;
    }
    window.location.href = payload.url;
  }

  function needsCoachSubscription(nextSession, nextProfile) {
    if (isAdminProfile(nextProfile, nextSession?.user)) return false;
    const intendedRole = nextSession?.user?.user_metadata?.intended_role;
    const hasLocalCoachIntent = hasPendingCoachSignupIntent(nextSession?.user);
    const isPendingCoachProfile = nextProfile?.subscription_status === "pending_coach";
    const currentRole = nextProfile?.role || "normal_user";
    const isCoachAttempt = currentRole === "coach" || intendedRole === "coach" || hasLocalCoachIntent || isPendingCoachProfile;
    const isUnlockedCoach = hasCoachAccess(nextProfile);
    return isCoachAttempt && !isUnlockedCoach;
  }

  async function handleAuthComplete(nextSession) {
    if (!nextSession?.user) return;
    const nextProfile = await loadProfile(nextSession.user);
    let resolvedProfile = nextProfile;
    if (isAdminProfile(resolvedProfile, nextSession.user)) {
      clearPendingCoachSignupIntent(nextSession.user);
      if (forcedSignupMode) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    if (pendingCoachInviteCode && supabase) {
      const { error } = await supabase.rpc("accept_admin_coach_invite", {
        invite_code_input: pendingCoachInviteCode
      });
      if (error) {
        setAppMessage(error.message);
      } else {
        resolvedProfile = await loadProfile(nextSession.user);
        setAppMessage("Coach access confirmed.");
        setPendingCoachInviteCode("");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (needsCoachSubscription(nextSession, resolvedProfile)) {
      setAppMessage("Coach account created. Complete the coach subscription to unlock your dashboard.");
      window.history.replaceState({}, document.title, window.location.pathname);
      setCoachCheckoutRedirecting(true);
      resolvedProfile = await loadProfile(nextSession.user);
      if (isAdminProfile(resolvedProfile, nextSession.user)) {
        clearPendingCoachSignupIntent(nextSession.user);
        setCoachCheckoutRedirecting(false);
        setProfile(resolvedProfile);
        setRole("admin");
        setSession(nextSession);
        setActiveTab((roleTabs.admin ?? roleTabs.normal_user)[0].id);
        setAppMessage("Admin access restored. Coach checkout is not required.");
        return;
      }
      setProfile(resolvedProfile);
      setRole(roleForProfile(resolvedProfile, nextSession.user));
      setSession(nextSession);
      await startCoachCheckout(nextSession);
      return;
    } else if (forcedSignupMode) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setProfile(resolvedProfile);
    setRole(roleForProfile(resolvedProfile, nextSession.user));
    setSession(nextSession);
    if (isAdminProfile(resolvedProfile, nextSession.user) || hasCoachAccess(resolvedProfile)) {
      clearPendingCoachSignupIntent(nextSession.user);
    }
    const nextRole = roleForProfile(resolvedProfile, nextSession.user);
    setActiveTab((roleTabs[nextRole] ?? roleTabs.normal_user)[0].id);
    await previewInviteIfNeeded(nextSession);
  }

  async function acceptPendingInvite() {
    if (!pendingInviteCode || !session?.user || !supabase) return;

    setHandlingInvite(true);
    const { data, error } = await supabase.rpc("accept_client_invite", {
      invite_code_input: pendingInviteCode
    });
    setHandlingInvite(false);

    if (error) {
      setAppMessage(error.message);
      return;
    }

    const nextProfile = await loadProfile(session.user);
    setProfile(nextProfile);
    setRole(roleForProfile(nextProfile, session.user));
    setActiveTab("home");
    setPendingInvite(null);
    setClaimedInviteCode(pendingInviteCode);
    setPendingInviteCode("");
    window.history.replaceState({}, document.title, window.location.pathname);
    setAppMessage(`Coach confirmed: ${data?.[0]?.coach_name || "your coach"}.`);
  }

  async function declinePendingInvite() {
    if (!pendingInviteCode || !supabase) return;

    setHandlingInvite(true);
    const { error } = await supabase.rpc("decline_client_invite", {
      invite_code_input: pendingInviteCode
    });
    setHandlingInvite(false);

    if (error) {
      setAppMessage(error.message);
      return;
    }

    setPendingInvite(null);
    setClaimedInviteCode(pendingInviteCode);
    setPendingInviteCode("");
    window.history.replaceState({}, document.title, window.location.pathname);
    setAppMessage("Invite declined.");
  }

  async function handleSignOut() {
    clearPendingCoachSignupIntent();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setProfile(null);
    setPreviewAccount(null);
    setCoachCheckoutRedirecting(false);
    setNotificationSummary({ unread_total: 0, unread_messages: 0, items: [], open: false, badges: {} });
    notificationCountRef.current = 0;
    setRole("normal_user");
    setActiveTab("home");
  }

  function handleProfileSaved(nextProfile) {
    setProfile(nextProfile);
    setRole(roleForProfile(nextProfile, session?.user));
  }

  function handlePreviewAccount(nextAccount) {
    setPreviewAccount(nextAccount);
    setActiveTab(nextAccount ? (roleTabs[nextAccount.role] ?? roleTabs.normal_user)[0].id : "settings");
  }

  function handleTabChange(tabId) {
    setWorkoutIntent("");
    setActiveTab(tabId);
  }

  function handleNavigate(tabId, intent = "") {
    if (tabId === "workouts") setWorkoutIntent(intent);
    setActiveTab(tabId);
  }

  if (booting) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-brand">
          <img className="auth-wordmark" src={movementzWordmarkSrc} alt="Movementz" />
          <p>Loading your account...</p>
        </section>
      </main>
    );
  }

  if (coachCheckoutRedirecting) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-brand">
          <img className="auth-wordmark" src={movementzWordmarkSrc} alt="Movementz" />
          <p>Preparing coach checkout...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        clientInvite={clientSignupInvite}
        clientInviteCode={pendingInviteCode}
        coachInviteCode={pendingCoachInviteCode}
        initialMode={pendingCoachInviteCode ? "coach" : pendingInviteCode ? "user" : forcedSignupMode || "login"}
        onAuthComplete={handleAuthComplete}
        onDemoLogin={handleDemoLogin}
      />
    );
  }

  if (coachPaymentPending) {
    return (
      <CoachCheckoutGate
        appMessage={appMessage}
        onContinue={() => startCoachCheckout(session)}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <AppLayout
      activeTab={activeTab}
      canPreviewRole={session.user.id === "demo-user"}
      onTabChange={handleTabChange}
      notificationSummary={notificationSummary}
      onNotificationSelect={handleNotificationSelect}
      onNotificationsOpen={toggleNotifications}
      onNotificationsRead={markNotificationsRead}
      onRoleChange={setRole}
      onProfileClick={() => setActiveTab("profile")}
      onPushEnable={handleEnablePush}
      onSignOut={handleSignOut}
      pushStatus={pushStatus}
      role={effectiveRole}
      tabs={tabs}
      user={user}
    >
      {previewAccount ? (
        <div className="panel admin-preview-banner">
          <div>
            <p className="eyebrow">Admin preview</p>
            <h2>Viewing as {previewAccount.name}</h2>
            <p>This is a build/testing preview from your admin login, not a real Supabase Auth switch.</p>
          </div>
          <button className="primary-action filled" onClick={() => handlePreviewAccount(null)} type="button">
            Back to admin
          </button>
        </div>
      ) : null}
      {appMessage ? <p className="form-message success">{appMessage}</p> : null}
      {pendingInvite ? (
        <div className="panel invite-confirm-panel">
          <div>
            <p className="eyebrow">Coach invite</p>
            <h2>{pendingInvite.coach_name} invited you</h2>
            <p>Confirm this coach before your account becomes their client.</p>
          </div>
          <div className="form-footer-actions">
            <button className="primary-action" disabled={handlingInvite} onClick={declinePendingInvite} type="button">
              Decline
            </button>
            <button className="primary-action filled" disabled={handlingInvite} onClick={acceptPendingInvite} type="button">
              {handlingInvite ? "Confirming..." : "Accept Coach"}
            </button>
          </div>
        </div>
      ) : null}
      {activeTab === "home" ? (
        <HomeScreen onNavigate={handleNavigate} profile={effectiveProfile} role={effectiveRole} user={user} />
      ) : activeTab === "templates" ? (
        <PublicTemplateLibraryScreen onBack={() => setActiveTab("home")} user={user} />
      ) : activeTab === "today" ? (
        <TodayScreen onNavigate={handleNavigate} role={effectiveRole} user={user} />
      ) : activeTab === "profile" ? (
        <ProfileScreen
          onProfileSaved={handleProfileSaved}
          onSignOut={handleSignOut}
          profile={effectiveProfile}
          user={user}
        />
      ) : activeTab === "workouts" ? (
        <WorkoutLibraryScreen
          initialMode={workoutIntent === "quick" ? "quick-log" : workoutIntent === "build" ? "setup" : "list"}
          initialLibraryView={workoutIntent === "shared" ? "shared" : "library"}
          profile={effectiveProfile}
          role={effectiveRole}
          user={user}
        />
      ) : activeTab === "plans" ? (
        <PlansScreen role={effectiveRole} user={user} />
      ) : activeTab === "clients" && effectiveRole === "coach" ? (
        <ClientsScreen profile={effectiveProfile} user={user} />
      ) : lockedActiveTab ? (
        <UpgradePromptScreen featureTab={activeTab} onNavigate={handleNavigate} />
      ) : activeTab === "messages" && (effectiveRole === "coach" || effectiveRole === "client" || effectiveRole === "normal_user") ? (
        <MessagesScreen onNotificationsChange={loadNotifications} role={effectiveRole} user={user} />
      ) : activeTab === "habits" ? (
        <HabitsScreen user={user} />
      ) : activeTab === "progress" ? (
        <ProgressPhotosScreen profile={effectiveProfile} role={effectiveRole} user={user} />
      ) : activeTab === "mindset" ? (
        <MindsetScreen role={effectiveRole} user={user} />
      ) : activeTab === "feed" ? (
        <MutualFeedScreen user={user} />
      ) : activeTab === "food" ? (
        <FoodLogScreen role={effectiveRole} user={user} />
      ) : activeTab === "appointments" && effectiveRole === "coach" ? (
        <AppointmentsScreen user={user} />
      ) : activeTab === "users" && effectiveRole === "admin" ? (
        <AdminUsersScreen onPreviewAccount={handlePreviewAccount} />
      ) : activeTab === "coaches" && effectiveRole === "admin" ? (
        <AdminCoachesScreen />
      ) : activeTab === "requests" && effectiveRole === "admin" ? (
        <AdminRequestsScreen user={user} />
      ) : activeTab === "settings" && effectiveRole === "admin" ? (
        <AdminSettingsScreen
          onPreviewAccount={handlePreviewAccount}
          previewAccount={previewAccount}
          user={user}
        />
      ) : (
        <PlaceholderScreen role={effectiveRole} tab={activeTab} />
      )}
    </AppLayout>
  );
}
