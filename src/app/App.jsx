import { useMemo, useState } from "react";
import { AppLayout } from "../layouts/AppLayout.jsx";
import { AuthScreen } from "../features/auth/AuthScreen.jsx";
import { HomeScreen } from "../features/home/HomeScreen.jsx";
import { PlaceholderScreen } from "../features/shared/PlaceholderScreen.jsx";
import { roleTabs } from "../lib/roles/roleTabs.js";
import { getInitialRole } from "../lib/roles/getInitialRole.js";

export function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(getInitialRole);
  const tabs = useMemo(() => roleTabs[role] ?? roleTabs.normal_user, [role]);
  const [activeTab, setActiveTab] = useState(tabs[0].id);

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

  function handleSignOut() {
    setSession(null);
    setActiveTab("home");
  }

  if (!session) {
    return <AuthScreen onDemoLogin={handleDemoLogin} />;
  }

  return (
    <AppLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRoleChange={setRole}
      onSignOut={handleSignOut}
      role={role}
      tabs={tabs}
      user={session.user}
    >
      {activeTab === "home" ? (
        <HomeScreen role={role} user={session.user} />
      ) : (
        <PlaceholderScreen role={role} tab={activeTab} />
      )}
    </AppLayout>
  );
}
