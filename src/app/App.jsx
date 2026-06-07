import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "../layouts/AppLayout.jsx";
import { AdminRequestsScreen } from "../features/admin/AdminRequestsScreen.jsx";
import { AuthScreen } from "../features/auth/AuthScreen.jsx";
import { ClientsScreen } from "../features/clients/ClientsScreen.jsx";
import { HomeScreen } from "../features/home/HomeScreen.jsx";
import { PlansScreen } from "../features/plans/PlansScreen.jsx";
import { ProfileScreen } from "../features/profile/ProfileScreen.jsx";
import { PlaceholderScreen } from "../features/shared/PlaceholderScreen.jsx";
import { WorkoutLibraryScreen } from "../features/workouts/WorkoutLibraryScreen.jsx";
import { roleTabs } from "../lib/roles/roleTabs.js";
import { getInitialRole } from "../lib/roles/getInitialRole.js";
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

  if (data) return data;

  const metadata = authUser.user_metadata ?? {};
  const fallbackProfile = {
    id: authUser.id,
    email: authUser.email,
    full_name: metadata.full_name || "",
    role: metadata.role || "normal_user",
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
    return fallbackProfile;
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

  return insertedProfile;
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
  const [booting, setBooting] = useState(hasSupabaseConfig);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(getInitialRole);
  const [pendingInviteCode, setPendingInviteCode] = useState(() => new URLSearchParams(window.location.search).get("invite") || "");
  const [claimedInviteCode, setClaimedInviteCode] = useState("");
  const [appMessage, setAppMessage] = useState("");
  const tabs = useMemo(() => roleTabs[role] ?? roleTabs.normal_user, [role]);
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const user = useMemo(() => buildUser(session, profile), [session, profile]);

  const claimInviteIfNeeded = useCallback(
    async (nextSession) => {
      const code = pendingInviteCode.trim();
      if (!code || claimedInviteCode === code || !supabase || !nextSession?.user?.id) return null;

      const { data, error } = await supabase.rpc("accept_client_invite", {
        invite_code_input: code
      });

      setClaimedInviteCode(code);

      if (error) {
        setAppMessage(`${error.message}.`);
        return null;
      }

      const nextProfile = await loadProfile(nextSession.user);
      setProfile(nextProfile);
      setRole(nextProfile?.role || nextSession.user.user_metadata?.role || "normal_user");
      setActiveTab("home");
      setPendingInviteCode("");
      window.history.replaceState({}, document.title, window.location.pathname);
      setAppMessage(`Invite accepted. You are now linked to ${data?.[0]?.coach_name || "your coach"}.`);
      return nextProfile;
    },
    [claimedInviteCode, pendingInviteCode]
  );

  useEffect(() => {
    if (!supabase) return undefined;

    let alive = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      const nextSession = data.session;
      setSession(nextSession);

      if (nextSession?.user) {
        const nextProfile = await loadProfile(nextSession.user);
        if (!alive) return;
        setProfile(nextProfile);
        setRole(nextProfile?.role || nextSession.user.user_metadata?.role || "normal_user");
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
        setRole(nextProfile?.role || nextSession.user.user_metadata?.role || "normal_user");
      } else {
        setProfile(null);
        setRole("normal_user");
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (activeTab === "profile") return;

    const nextTabs = roleTabs[role] ?? roleTabs.normal_user;
    if (!nextTabs.some((tab) => tab.id === activeTab)) {
      Promise.resolve().then(() => setActiveTab(nextTabs[0].id));
    }
  }, [activeTab, role]);

  useEffect(() => {
    if (!session?.user || !pendingInviteCode || claimedInviteCode === pendingInviteCode) return undefined;

    let alive = true;

    Promise.resolve().then(async () => {
      if (alive) await claimInviteIfNeeded(session);
    });

    return () => {
      alive = false;
    };
  }, [claimedInviteCode, claimInviteIfNeeded, pendingInviteCode, session]);

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

  async function handleAuthComplete(nextSession) {
    if (!nextSession?.user) return;
    const nextProfile = await loadProfile(nextSession.user);
    setProfile(nextProfile);
    setRole(nextProfile?.role || nextSession.user.user_metadata?.role || "normal_user");
    setSession(nextSession);
    setActiveTab((roleTabs[nextProfile?.role || nextSession.user.user_metadata?.role] ?? roleTabs.normal_user)[0].id);
    await claimInviteIfNeeded(nextSession);
  }

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setProfile(null);
    setRole("normal_user");
    setActiveTab("home");
  }

  function handleProfileSaved(nextProfile) {
    setProfile(nextProfile);
    setRole(nextProfile?.role || "normal_user");
  }

  if (booting) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-brand">
          <div className="brand-icon large">M</div>
          <h1>Movementz</h1>
          <p>Loading your account...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen onAuthComplete={handleAuthComplete} onDemoLogin={handleDemoLogin} />;
  }

  return (
    <AppLayout
      activeTab={activeTab}
      canPreviewRole={session.user.id === "demo-user"}
      onTabChange={setActiveTab}
      onRoleChange={setRole}
      onProfileClick={() => setActiveTab("profile")}
      onSignOut={handleSignOut}
      role={role}
      tabs={tabs}
      user={user}
    >
      {appMessage ? <p className="form-message success">{appMessage}</p> : null}
      {activeTab === "home" ? (
        <HomeScreen onNavigate={setActiveTab} role={role} user={user} />
      ) : activeTab === "profile" ? (
        <ProfileScreen
          onProfileSaved={handleProfileSaved}
          onSignOut={handleSignOut}
          profile={profile}
          user={user}
        />
      ) : activeTab === "workouts" ? (
        <WorkoutLibraryScreen user={user} />
      ) : activeTab === "plans" ? (
        <PlansScreen user={user} />
      ) : activeTab === "clients" && role === "coach" ? (
        <ClientsScreen profile={profile} user={user} />
      ) : activeTab === "requests" && role === "admin" ? (
        <AdminRequestsScreen user={user} />
      ) : (
        <PlaceholderScreen role={role} tab={activeTab} />
      )}
    </AppLayout>
  );
}
