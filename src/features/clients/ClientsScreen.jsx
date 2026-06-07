import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

function clientName(client) {
  return client?.client_name || client?.full_name || client?.email || "Client";
}

function buildInviteUrl(code) {
  if (!code) return "";
  return `${window.location.origin}/?invite=${code}`;
}

export function ClientsScreen({ profile, user }) {
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [searching, setSearching] = useState(false);
  const [savingClientId, setSavingClientId] = useState(null);
  const [message, setMessage] = useState("");

  const activeCount = useMemo(() => clients.filter((client) => client.status === "active").length, [clients]);
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

    setClients(data || []);
  }, [user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadClients();
    });

    return () => {
      alive = false;
    };
  }, [loadClients]);

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
