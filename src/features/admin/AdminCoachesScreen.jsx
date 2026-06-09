import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

export function AdminCoachesScreen() {
  const [coaches, setCoaches] = useState([]);
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
      const { data, error } = await supabase.rpc("get_admin_coach_summaries");
      if (!alive) return;
      setLoading(false);
      if (error) {
        setMessage(`${error.message}. Run supabase/phase-29-calendar-admin-summaries.sql in Supabase.`);
        setCoaches([]);
      } else {
        setCoaches(data || []);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const filteredCoaches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return coaches;
    return coaches.filter((coach) =>
      [coach.full_name, coach.email, coach.qualification, ...(coach.specialty || [])].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [coaches, search]);

  return (
    <section className="screen-stack admin-list-screen">
      <div className="screen-heading">
        <p className="eyebrow">Admin</p>
        <h1>Coaches</h1>
        <p>Coach profile basics, specialties and active client counts.</p>
      </div>
      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading coaches...</p> : null}
      <section className="panel admin-directory-panel">
        <div className="section-row">
          <h2>Coach directory</h2>
          <span className="status-pill">{filteredCoaches.length}</span>
        </div>
        <input className="directory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search coach, qualification or specialty" />
        <div className="coach-directory-list">
          {filteredCoaches.map((coach) => (
            <article key={coach.id}>
              <div>
                <strong>{coach.full_name}</strong>
                <span>{coach.email}</span>
              </div>
              <div>
                <span>Qualification</span>
                <strong>{coach.qualification || "Not added"}</strong>
              </div>
              <div>
                <span>Specialty</span>
                <p>{coach.specialty?.length ? coach.specialty.join(", ") : "Not added"}</p>
              </div>
              <em>{coach.client_count || 0} active clients</em>
            </article>
          ))}
          {!filteredCoaches.length && !loading ? <p className="compact-help">No coaches found.</p> : null}
        </div>
      </section>
    </section>
  );
}
