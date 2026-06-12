import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandName } from "../components/brand/BrandMark.jsx";
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
import { movementzIconSrc } from "../lib/brandAssets.js";
import { enablePhonePushNotifications, getPushStatus } from "../lib/pushNotifications.js";
import { hasSupabaseConfig, supabase } from "../lib/supabase/client.js";

async function loadProfile(authUser) {
  if (!supabase || !authUser?.id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,first_name,last_name,role,avatar_url,gender,age,location")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    console.warn("Profile load failed", error);
    return null;
  }

  if (data) return { ...data, ...(await loadProfileAccess(authUser.id)) };

  const metadata = authUser.user_metadata ?? {};
  const fallbackProfile = {
    id: authUser.id,
    email: authUser.email,
    full_name: metadata.full_name || "",
    role: metadata.role === "admin" ? "admin" : "normal_user",
    gender: metadata.gender || null,
    age: metadata.age ? Number(metadata.age) : null,
    location: metadata.location || null
  };

  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(fallbackProfile)
    .select("id,email,full_name,first_name,last_name,role,avatar_url,gender,age,location")
    .single();

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

  const { data, error } = await supabase
    .from("profiles")
    .select("access_tier,paid_access_until,admin_granted_paid_access,feature_overrides,stripe_customer_id,stripe_subscription_id,subscription_status")
    .eq("id", userId)
    .maybeSingle();

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
  const [handlingInvite, setHandlingInvite] = useState(false);
  const [previewAccount, setPreviewAccount] = useState(null);
  const [appMessage, setAppMessage] = useState("");
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

  useEffect(() => {
    const requestedTab = requestedTabRef.current;
    if (!requestedTab || !tabs.some((tab) => tab.id === requestedTab)) return;
    setActiveTab(requestedTab);
    requestedTabRef.current = "";
  }, [tabs]);
  const lockedActiveTab = tabIsLocked(activeTab, effectiveProfile, effectiveRole);

  useEffect(() => {
    const paymentStatus = new URLSearchParams(window.location.search).get("payment");
    if (!supabase || paymentStatus !== "success" || !session?.user) return undefined;

    setAppMessage("Payment received. Unlocking your access...");
    const timers = [900, 2600, 5200].map((delay) => window.setTimeout(async () => {
      const nextProfile = await loadProfile(session.user);
      setProfile(nextProfile);
      setRole(nextProfile?.role || "normal_user");
      if (nextProfile?.access_tier === "paid" || nextProfile?.admin_granted_paid_access || ["admin", "coach", "client"].includes(nextProfile?.role)) {
        setAppMessage("Paid access unlocked.");
      }
    }, delay));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [session?.user]);

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
    if (!supabase) return undefined;

    let alive = true;

    async function boot() {
      if (forcedSignupMode) {
        await supabase.auth.signOut({ scope: "local" });
        if (!alive) return;
        setSession(null);
        setProfile(null);
        setRole("normal_user");
        setBooting(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      const nextSession = data.session;
      setSession(nextSession);

      if (nextSession?.user) {
        const nextProfile = await loadProfile(nextSession.user);
        if (!alive) return;
        setProfile(nextProfile);
        setRole(nextProfile?.role || "normal_user");
      }

      setBooting(false);
    }

    boot();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user) {
        const nextProfile = await loadProfile(nextSession.user);
        setProfile(nextProfile);
        setRole(nextProfile?.role || "normal_user");
      } else {
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
      setProfile(nextProfile);
      setRole(nextProfile?.role || "normal_user");
      setActiveTab((roleTabs[nextProfile?.role || "normal_user"] ?? roleTabs.normal_user)[0].id);
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
      setAppMessage(payload.error || "Could not start coach checkout.");
      return;
    }
    window.location.href = payload.url;
  }

  function needsCoachSubscription(nextSession, nextProfile) {
    const intendedRole = nextSession?.user?.user_metadata?.intended_role;
    const currentRole = nextProfile?.role || "normal_user";
    const currentTier = nextProfile?.access_tier || "";
    return intendedRole === "coach" && currentRole !== "coach" && currentTier !== "coach";
  }

  async function handleAuthComplete(nextSession) {
    if (!nextSession?.user) return;
    const nextProfile = await loadProfile(nextSession.user);
    let resolvedProfile = nextProfile;

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
    } else if (forcedSignupMode === "coach" || needsCoachSubscription(nextSession, resolvedProfile)) {
      setAppMessage("Coach account created. Complete the coach subscription to unlock your dashboard.");
      window.history.replaceState({}, document.title, window.location.pathname);
      resolvedProfile = await loadProfile(nextSession.user);
      setProfile(resolvedProfile);
      setRole(resolvedProfile?.role || "normal_user");
      setSession(nextSession);
      await startCoachCheckout(nextSession);
      return;
    } else if (forcedSignupMode) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setProfile(resolvedProfile);
    setRole(resolvedProfile?.role || "normal_user");
    setSession(nextSession);
    setActiveTab((roleTabs[resolvedProfile?.role || "normal_user"] ?? roleTabs.normal_user)[0].id);
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
    setRole(nextProfile?.role || "normal_user");
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
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setProfile(null);
    setPreviewAccount(null);
    setNotificationSummary({ unread_total: 0, unread_messages: 0, items: [], open: false, badges: {} });
    notificationCountRef.current = 0;
    setRole("normal_user");
    setActiveTab("home");
  }

  function handleProfileSaved(nextProfile) {
    setProfile(nextProfile);
    setRole(nextProfile?.role || "normal_user");
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
          <img className="brand-loading-icon" src={movementzIconSrc} alt="" />
          <h1><BrandName /></h1>
          <p>Loading your account...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        coachInviteCode={pendingCoachInviteCode}
        initialMode={pendingCoachInviteCode ? "coach" : forcedSignupMode || "login"}
        onAuthComplete={handleAuthComplete}
        onDemoLogin={handleDemoLogin}
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
