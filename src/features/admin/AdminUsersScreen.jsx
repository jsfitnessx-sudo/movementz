import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";
import { hasFullUserAccess } from "../../lib/access/paidAccess.js";

function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function AdminUsersScreen({ onPreviewAccount }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState("");

  const loadUsers = useCallback(async (alive = true) => {
    if (!supabase) {
      if (alive) setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_admin_user_summaries");
    if (!alive) return;
    setLoading(false);
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-32-paid-user-access.sql in Supabase.`);
      setUsers([]);
    } else {
      setUsers(data || []);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => loadUsers(alive));
    return () => {
      alive = false;
    };
  }, [loadUsers]);

  async function updatePaidAccess(user, grantAccess) {
    if (!supabase) return;
    setSavingUserId(user.id);
    setMessage("");
    const { error } = await supabase.rpc("admin_set_paid_access", {
      target_user_id: user.id,
      grant_access: grantAccess,
      access_until: null
    });
    setSavingUserId("");
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-32-paid-user-access.sql in Supabase.`);
      return;
    }
    setMessage(grantAccess ? `Full access granted to ${user.full_name || user.email}.` : `Admin access removed for ${user.full_name || user.email}.`);
    await loadUsers(true);
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.full_name, user.email, user.role, user.location].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [search, users]);

  return (
    <section className="screen-stack admin-list-screen">
      <div className="screen-heading">
        <p className="eyebrow">Admin</p>
        <h1>Users</h1>
        <p>Basic account information only. Private logs, messages and mindset content stay out of this view.</p>
      </div>
      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading users...</p> : null}
      <section className="panel admin-directory-panel">
        <div className="section-row">
          <h2>All users</h2>
          <span className="status-pill">{filteredUsers.length}</span>
        </div>
        <input className="directory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, role or location" />
        <div className="admin-directory-list">
          {filteredUsers.map((user) => (
            <article key={user.id}>
              <div>
                <strong>{user.full_name}</strong>
                <span>{user.email}</span>
              </div>
              <em>{user.role}</em>
              <span>{hasFullUserAccess(user, user.role) ? "Full access" : "Free access"}</span>
              <span>{user.admin_granted_paid_access ? "Admin granted" : user.subscription_status || user.access_tier || "No subscription"}</span>
              <span>Joined {formatDate(user.created_at)}</span>
              <div className="admin-user-actions">
                {onPreviewAccount ? (
                  <button
                    className="primary-action compact"
                    onClick={() => onPreviewAccount({
                      id: user.id,
                      email: user.email,
                      name: user.full_name,
                      role: user.role,
                      access_tier: user.access_tier,
                      paid_access_until: user.paid_access_until,
                      admin_granted_paid_access: user.admin_granted_paid_access,
                      feature_overrides: user.feature_overrides
                    })}
                    type="button"
                  >
                    Preview
                  </button>
                ) : null}
                <button
                  className="primary-action compact"
                  disabled={savingUserId === user.id}
                  onClick={() => updatePaidAccess(user, !user.admin_granted_paid_access)}
                  type="button"
                >
                  {user.admin_granted_paid_access ? "Remove grant" : "Grant access"}
                </button>
              </div>
            </article>
          ))}
          {!filteredUsers.length && !loading ? <p className="compact-help">No users found.</p> : null}
        </div>
      </section>
    </section>
  );
}
