import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function AdminUsersScreen() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      if (!supabase) {
        if (alive) setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.rpc("get_admin_user_summaries");
      if (!alive) return;
      setLoading(false);
      if (error) {
        setMessage(`${error.message}. Run supabase/phase-29-calendar-admin-summaries.sql in Supabase.`);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

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
              <span>{user.location || "No location"}</span>
              <span>Joined {formatDate(user.created_at)}</span>
              <span>Last sign in {formatDate(user.last_sign_in_at)}</span>
            </article>
          ))}
          {!filteredUsers.length && !loading ? <p className="compact-help">No users found.</p> : null}
        </div>
      </section>
    </section>
  );
}
