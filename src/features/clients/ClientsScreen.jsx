import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const progressPhotoBucket = "progress-photos";
const clientTrackerSelect = "id,goal_name,goal_type,start_weight_kg,goal_weight_kg,maintenance_calories,target_calories,duration_weeks,start_date,status";

function clientName(client) {
  return client?.client_name || client?.full_name || client?.email || "Client";
}

function buildInviteUrl(code) {
  if (!code) return "";
  return `${window.location.origin}/?invite=${code}`;
}

function formatClientPhotoDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ClientsScreen({ profile, user }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientPhotos, setClientPhotos] = useState([]);
  const [clientPhotoCount, setClientPhotoCount] = useState(0);
  const [clientTracker, setClientTracker] = useState(null);
  const [clientCheckinCount, setClientCheckinCount] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingClientId, setSavingClientId] = useState(null);
  const [message, setMessage] = useState("");

  const activeCount = useMemo(() => clients.filter((client) => client.status === "active").length, [clients]);
  const activeClients = useMemo(() => clients.filter((client) => client.status === "active"), [clients]);
  const selectedClient = useMemo(
    () => activeClients.find((client) => client.client_id === selectedClientId) || activeClients[0],
    [activeClients, selectedClientId]
  );
  const databaseRole = (profile?.role || "unknown").toLowerCase();
  const canManageClients = databaseRole === "coach" || databaseRole === "admin";

  const loadClients = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setClients([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_coach_clients");

    setLoading(false);

    if (error) {
      setMessage(`${error.message}. Run the latest supabase/phase-7-coach-client-links.sql in Supabase.`);
      setClients([]);
      return;
    }

    const nextClients = data || [];
    setClients(nextClients);
    setSelectedClientId((current) => {
      if (nextClients.some((client) => client.client_id === current && client.status === "active")) return current;
      return nextClients.find((client) => client.status === "active")?.client_id || "";
    });
  }, [user.id]);

  const loadClientPhotos = useCallback(async () => {
    const clientId = selectedClient?.client_id;
    if (!clientId || !supabase || user.id === "demo-user") {
      setClientPhotos([]);
      setClientPhotoCount(0);
      setLoadingPhotos(false);
      return;
    }

    setLoadingPhotos(true);

    const { data, error, count } = await supabase
      .from("progress_photos")
      .select("id,pose,note,thumbnail_path,taken_at,created_at", { count: "exact" })
      .eq("user_id", clientId)
      .order("taken_at", { ascending: false })
      .limit(6);

    if (error) {
      setClientPhotos([]);
      setClientPhotoCount(0);
      setLoadingPhotos(false);
      return;
    }

    const signedPhotos = await Promise.all(
      (data || []).map(async (photo) => {
        const { data: signed } = await supabase.storage
          .from(progressPhotoBucket)
          .createSignedUrl(photo.thumbnail_path, 60 * 60);

        return { ...photo, thumbnail_url: signed?.signedUrl || "" };
      })
    );

    setClientPhotos(signedPhotos);
    setClientPhotoCount(count ?? signedPhotos.length);
    setLoadingPhotos(false);
  }, [selectedClient?.client_id, user.id]);

  const loadClientTracker = useCallback(async () => {
    const clientId = selectedClient?.client_id;
    if (!clientId || !supabase || user.id === "demo-user") {
      setClientTracker(null);
      setClientCheckinCount(0);
      return;
    }

    const { data, error } = await supabase
      .from("goal_trackers")
      .select(clientTrackerSelect)
      .eq("user_id", clientId)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setClientTracker(null);
      setClientCheckinCount(0);
      return;
    }

    setClientTracker(data);

    const { count } = await supabase
      .from("goal_tracker_checkins")
      .select("id", { count: "exact", head: true })
      .eq("tracker_id", data.id);

    setClientCheckinCount(count || 0);
  }, [selectedClient?.client_id, user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadClients();
    });

    return () => {
      alive = false;
    };
  }, [loadClients]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadClientPhotos();
    });

    return () => {
      alive = false;
    };
  }, [loadClientPhotos]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadClientTracker();
    });

    return () => {
      alive = false;
    };
  }, [loadClientTracker]);

  async function searchUsers(event) {
    event.preventDefault();
    const searchText = query.trim();

    if (searchText.length < 2) {
      setMessage("Search by at least 2 characters.");
      setResults([]);
      return;
    }

    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to search real users.");
      return;
    }

    setSearching(true);
    setMessage("");
    const { data, error } = await supabase.rpc("search_users_for_client_invite", {
      search_text: searchText
    });
    setSearching(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-7-coach-client-links.sql in Supabase.`);
      setResults([]);
      return;
    }

    setResults(data || []);
    if (!data?.length) setMessage("No matching users found.");
  }

  async function addClient(profileId) {
    if (!supabase || user.id === "demo-user") return;

    setSavingClientId(profileId);
    setMessage("");

    const { error } = await supabase.rpc("link_client_to_coach", {
      target_client_id: profileId
    });

    setSavingClientId(null);

    if (error) {
      setMessage(
        error.message.includes("Only coaches")
          ? `Only coaches can add clients. Your database profile role is "${databaseRole}". If this says coach, run the latest supabase/phase-7-coach-client-links.sql.`
          : error.message
      );
      return;
    }

    setQuery("");
    setResults([]);
    setMessage("Client linked. They will now appear as an active client.");
    await loadClients();
  }

  async function createInviteLink() {
    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to create invite links.");
      return;
    }

    setMessage("");
    const { data, error } = await supabase.rpc("create_client_invite");

    if (error) {
      setMessage(`${error.message}. Run the latest supabase/phase-7-coach-client-links.sql in Supabase.`);
      return;
    }

    const nextUrl = buildInviteUrl(data?.[0]?.invite_code);
    setInviteUrl(nextUrl);

    if (navigator.clipboard && nextUrl) {
      try {
        await navigator.clipboard.writeText(nextUrl);
        setMessage("Invite link copied. Send it to the client by text, email, WhatsApp, or your own message system.");
        return;
      } catch {
        setMessage("Invite link created. Copy it from the box below and send it to the client.");
        return;
      }
    }

    setMessage("Invite link created. Copy it from the box below and send it to the client.");
  }

  return (
    <section className="screen-stack clients-screen">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Clients</p>
          <h1>Coach clients</h1>
          <p>Find existing users, link them as clients, or create a link to send outside the app.</p>
        </div>
        <button className="primary-action compact filled" onClick={createInviteLink} type="button">
          Invite Link
        </button>
      </div>

      {!canManageClients ? (
        <p className="form-message error">Your database role is "{databaseRole}". This account must be set to coach before it can add clients.</p>
      ) : null}
      {message ? <p className={message.includes("Run supabase") || message.includes("Only coaches") || message.includes("must be set to coach") ? "form-message error" : "form-message success"}>{message}</p> : null}
      {inviteUrl ? (
        <div className="panel invite-link-panel">
          <span>Latest invite. Send this link to the client. When they open it and sign in, they become linked to you.</span>
          <strong>{inviteUrl}</strong>
        </div>
      ) : null}

      <form className="panel client-search-panel" onSubmit={searchUsers}>
        <div>
          <h2>Find or invite a client</h2>
          <p>Search existing users by name or email. For new users, create an invite link and send it to them.</p>
        </div>
        <div className="client-search-row">
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            value={query}
          />
          <button className="primary-action compact" disabled={searching} type="submit">
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {results.length ? (
        <div className="client-result-list">
          {results.map((profile) => (
            <article className="client-row" key={profile.id}>
              <div>
                <strong>{clientName(profile)}</strong>
                <span>{profile.email}</span>
              </div>
              <button className="primary-action compact filled" disabled={savingClientId === profile.id} onClick={() => addClient(profile.id)} type="button">
                {savingClientId === profile.id ? "Adding..." : "Add"}
              </button>
            </article>
          ))}
        </div>
      ) : null}

      <div className="panel clients-summary-panel">
        <div className="completion-summary">
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{clients.length}</strong>
          </div>
        </div>
      </div>

      {activeClients.length ? (
        <section className="panel client-insight-panel">
          <div className="client-insight-header">
            <div>
              <p className="eyebrow">Selected client</p>
              <h2>{clientName(selectedClient)}</h2>
              <p>Progress photos and tracker information update from this client.</p>
            </div>
            <select value={selectedClient?.client_id || ""} onChange={(event) => setSelectedClientId(event.target.value)}>
              {activeClients.map((client) => (
                <option key={client.client_id} value={client.client_id}>
                  {clientName(client)}
                </option>
              ))}
            </select>
          </div>

          <div className="client-metric-grid">
            <div>
              <span>Workouts</span>
              <strong>0</strong>
            </div>
            <div>
              <span>Adherence</span>
              <strong>-</strong>
            </div>
            <div>
              <span>Check-ins</span>
              <strong>{clientCheckinCount}</strong>
            </div>
            <div>
              <span>Photos</span>
              <strong>{clientPhotoCount}</strong>
            </div>
          </div>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Progress photos</p>
                <span>Latest private uploads from {clientName(selectedClient)}.</span>
              </div>
              <button className="primary-action compact" onClick={loadClientPhotos} disabled={loadingPhotos} type="button">
                {loadingPhotos ? "Loading..." : "Refresh"}
              </button>
            </div>

            {clientPhotos.length ? (
              <div className="client-photo-strip">
                {clientPhotos.map((photo) => (
                  <article className="client-photo-thumb" key={photo.id}>
                    {photo.thumbnail_url ? <img alt={`${photo.pose} progress`} src={photo.thumbnail_url} /> : <div />}
                    <strong>{photo.pose}</strong>
                    <span>{formatClientPhotoDate(photo.taken_at || photo.created_at)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="compact-help">{loadingPhotos ? "Loading client photos..." : "No progress photos uploaded yet."}</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Tracker</p>
                <span>Weekly measurements and check-in data from this client.</span>
              </div>
            </div>
            {clientTracker ? (
              <div className="client-tracker-summary">
                <strong>{clientTracker.goal_name}</strong>
                <span>{clientTracker.duration_weeks} weeks - {clientCheckinCount} check-ins logged</span>
                <span>Start {clientTracker.start_weight_kg || "-"}kg - Goal {clientTracker.goal_weight_kg || "-"}kg</span>
                <span>Maintenance {clientTracker.maintenance_calories || "-"} cal - Target {clientTracker.target_calories || "-"} cal</span>
              </div>
            ) : (
              <p className="compact-help">No active tracker yet.</p>
            )}
          </section>
        </section>
      ) : null}

      {loading ? <p className="form-message success">Loading clients...</p> : null}

      {clients.length ? (
        <div className="client-list">
          {clients.map((client) => (
            <article className="client-row coach-client-card" key={client.link_id}>
              <div>
                <strong>{clientName(client)}</strong>
                <span>{client.client_email}</span>
                <em>{client.status === "active" ? "Confirmed client" : "Invite pending"}</em>
              </div>
              <span className={client.status === "active" ? "status-pill active" : "status-pill"}>{client.status}</span>
            </article>
          ))}
        </div>
      ) : !loading ? (
        <div className="panel empty-state">
          <p>No clients linked yet. Search for an existing user or create an invite link.</p>
        </div>
      ) : null}
    </section>
  );
}
