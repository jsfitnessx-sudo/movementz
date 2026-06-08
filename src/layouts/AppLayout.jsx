import { BrandMark } from "../components/brand/BrandMark.jsx";
import { RoleSwitcher } from "../components/dev/RoleSwitcher.jsx";
import { BottomNav } from "../components/navigation/BottomNav.jsx";

export function AppLayout({
  activeTab,
  canPreviewRole = false,
  children,
  notificationSummary = {},
  onNotificationSelect,
  onNotificationsOpen,
  onNotificationsRead,
  onRoleChange,
  onProfileClick,
  onSignOut,
  onTabChange,
  role,
  tabs,
  user
}) {
  const isCoach = role === "coach";
  const notifications = Array.isArray(notificationSummary.items) ? notificationSummary.items : [];
  const unreadTotal = Number(notificationSummary.unread_total || 0);

  return (
    <div className={isCoach ? "app-shell coach-theme" : "app-shell"}>
      <header className="topbar">
        <BrandMark />
        <div className="topbar-actions">
          {canPreviewRole ? (
            <RoleSwitcher currentRole={role} onRoleChange={onRoleChange} />
          ) : null}
          <button
            aria-label="Open notifications"
            className={unreadTotal > 0 ? "notification-bell has-unread" : "notification-bell"}
            onClick={onNotificationsOpen}
            type="button"
          >
            <span aria-hidden="true">&#128276;</span>
            {unreadTotal > 0 ? <em>{unreadTotal}</em> : null}
          </button>
          <button
            aria-label="Open profile"
            className="avatar-button"
            type="button"
            onClick={onProfileClick}
          >
            {user.avatarUrl ? <img alt="" src={user.avatarUrl} /> : (user.name || user.email || "M").slice(0, 1)}
          </button>
          <button className="signout-shortcut" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className={isCoach ? "main-panel coach-panel" : "main-panel"}>
        {children}
      </main>

      {notificationSummary.open ? (
        <div className="notification-popover" role="dialog" aria-label="Notifications">
          <div className="section-row">
            <div>
              <p className="eyebrow">Notifications</p>
              <h2>Updates</h2>
            </div>
            <button className="icon-button" onClick={onNotificationsOpen} type="button" aria-label="Close notifications">x</button>
          </div>
          {unreadTotal > 0 ? (
            <button
              className="text-button compact"
              onClick={() => onNotificationsRead?.({ filterType: null })}
              type="button"
            >
              Mark all read
            </button>
          ) : null}
          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((item) => (
                <button
                  className={item.read_at ? "" : "unread"}
                  key={item.id}
                  onClick={() => onNotificationSelect?.(item)}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  {item.body ? <span>{item.body}</span> : null}
                  <em>{item.actor_name || "Movementz"}</em>
                </button>
              ))}
            </div>
          ) : (
            <p className="compact-help">No notifications yet.</p>
          )}
        </div>
      ) : null}

      <BottomNav activeTab={activeTab} badges={notificationSummary.badges} onTabChange={onTabChange} tabs={tabs} />
    </div>
  );
}
