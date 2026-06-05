import { BrandMark } from "../components/brand/BrandMark.jsx";
import { RoleSwitcher } from "../components/dev/RoleSwitcher.jsx";
import { BottomNav } from "../components/navigation/BottomNav.jsx";

export function AppLayout({
  activeTab,
  children,
  onRoleChange,
  onSignOut,
  onTabChange,
  role,
  tabs,
  user
}) {
  const isCoach = role === "coach";

  return (
    <div className={isCoach ? "app-shell coach-theme" : "app-shell"}>
      <header className="topbar">
        <BrandMark />
        <div className="topbar-actions">
          <RoleSwitcher currentRole={role} onRoleChange={onRoleChange} />
          <button className="avatar-button" type="button" onClick={onSignOut}>
            {user.name.slice(0, 1)}
          </button>
        </div>
      </header>

      <main className={isCoach ? "main-panel coach-panel" : "main-panel"}>
        {children}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={onTabChange} tabs={tabs} />
    </div>
  );
}
