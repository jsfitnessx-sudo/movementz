import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const blankFeedData = {
  pending_requests: [],
  mutuals: [],
  mutual_count: 0,
  feed: []
};

const leaderboardLabels = {
  days: "Days",
  prs: "PRs",
  mood: "Mood"
};

function initialFor(name) {
  return (name || "M").trim().slice(0, 1).toUpperCase();
}

function formatFeedDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short"
  });
}

function activityBadge(type) {
  if (type === "pr") return "PR";
  if (type === "mood") return "Mood";
  return "Workout";
}

function leaderboardHelp(metric) {
  if (metric === "prs") return "Most PRs this month across your mutuals.";
  if (metric === "mood") return "Most mood check-ins this week. One per day counts.";
  return "Most workout days logged this week.";
}

export function MutualFeedScreen({ user }) {
  const [activeView, setActiveView] = useState("feed");
  const [feedData, setFeedData] = useState(blankFeedData);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [leaderboardMetric, setLeaderboardMetric] = useState("days");
  const [leaderboard, setLeaderboard] = useState({ metric: "days", rows: [] });
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(Boolean(supabase));
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  const hasMutuals = Number(feedData.mutual_count || 0) > 0;

  const pendingCount = useMemo(
    () => (feedData.pending_requests || []).length,
    [feedData.pending_requests]
  );

  async function loadFeed() {
    if (!supabase || user.id === "demo-user") {
      setFeedData(blankFeedData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.rpc("get_mutual_feed");
    setLoading(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-23-mutual-feed.sql in Supabase.`);
      setFeedData(blankFeedData);
      return;
    }

    setFeedData({
      ...blankFeedData,
      ...(data || {}),
      pending_requests: Array.isArray(data?.pending_requests) ? data.pending_requests : [],
      mutuals: Array.isArray(data?.mutuals) ? data.mutuals : [],
      feed: Array.isArray(data?.feed) ? data.feed : []
    });
  }

  async function loadLeaderboard(metric = leaderboardMetric) {
    if (!supabase || user.id === "demo-user") {
      setLeaderboard({ metric, rows: [] });
      return;
    }

    const { data, error } = await supabase.rpc("get_mutual_leaderboard", { metric });
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-23-mutual-feed.sql in Supabase.`);
      setLeaderboard({ metric, rows: [] });
      return;
    }

    setLeaderboard({
      metric: data?.metric || metric,
      rows: Array.isArray(data?.rows) ? data.rows : []
    });
  }

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      if (alive) await loadFeed();
    });
    return () => {
      alive = false;
    };
  }, [user.id]);

  useEffect(() => {
    let alive = true;
    if (activeView !== "leaderboard") return undefined;
    Promise.resolve().then(async () => {
      if (alive) await loadLeaderboard(leaderboardMetric);
    });
    return () => {
      alive = false;
    };
  }, [activeView, leaderboardMetric, user.id]);

  async function searchMutuals() {
    const term = searchText.trim();
    if (term.length < 2) {
      setMessage("Search by at least 2 letters or an email.");
      return;
    }

    setSearching(true);
    setMessage("");
    const { data, error } = await supabase.rpc("search_mutual_candidates", {
      search_text: term
    });
    setSearching(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-23-mutual-feed.sql in Supabase.`);
      setSearchResults([]);
      return;
    }

    setSearchResults(data || []);
    if (!data?.length) setMessage("No matching users found.");
  }

  async function requestMutual(targetUserId) {
    setMessage("");
    const { error } = await supabase.rpc("request_mutual", { target_user_id: targetUserId });
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Mutual request sent.");
    await searchMutuals();
    await loadFeed();
  }

  async function respondMutual(connectionId, responseStatus) {
    setMessage("");
    const { error } = await supabase.rpc("respond_mutual", {
      connection_id: connectionId,
      response_status: responseStatus
    });
    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(responseStatus === "active" ? "Mutual confirmed." : "Request rejected.");
    await loadFeed();
  }

  async function toggleLike(item) {
    const { error } = await supabase.rpc("toggle_feed_like", {
      feed_item_type: item.item_type,
      feed_item_id: item.item_id
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadFeed();
  }

  async function addComment(item) {
    const key = `${item.item_type}-${item.item_id}`;
    const body = (commentDrafts[key] || "").trim();
    if (!body) return;

    const { error } = await supabase.rpc("add_feed_comment", {
      feed_item_type: item.item_type,
      feed_item_id: item.item_id,
      comment_body: body
    });
    if (error) {
      setMessage(error.message);
      return;
    }

    setCommentDrafts((current) => ({ ...current, [key]: "" }));
    await loadFeed();
  }

  function renderPersonAvatar(person, className = "coach-feed-avatar") {
    return (
      <div className={className}>
        {person.avatar_url ? <img alt="" src={person.avatar_url} /> : <span>{initialFor(person.full_name || person.requester_name || person.actor_name)}</span>}
        <i />
      </div>
    );
  }

  return (
    <section className="screen-stack mutual-feed-screen">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Movementz</p>
          <h1>Feed</h1>
          <p>Only approved mutuals can appear here.</p>
        </div>
        <button className="primary-action compact" onClick={loadFeed} type="button">
          Refresh
        </button>
      </div>

      {message ? <p className={message.includes("Run supabase") || message.includes("not") ? "form-message error" : "form-message success"}>{message}</p> : null}
      {loading ? <p className="form-message success">Loading feed...</p> : null}

      <div className="feed-tabs" role="tablist" aria-label="Feed views">
        <button className={activeView === "feed" ? "active" : ""} onClick={() => setActiveView("feed")} type="button">
          Feed
        </button>
        <button className={activeView === "mutuals" ? "active" : ""} onClick={() => setActiveView("mutuals")} type="button">
          Mutuals ({feedData.mutual_count || 0})
        </button>
        <button className={activeView === "leaderboard" ? "active" : ""} onClick={() => setActiveView("leaderboard")} type="button">
          Leaderboard
        </button>
      </div>

      {activeView !== "leaderboard" ? (
        <section className="panel mutual-search-panel">
          <p className="eyebrow">Find people</p>
          <div className="inline-search-row">
            <input
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") searchMutuals();
              }}
              placeholder="Search by name or email"
              type="search"
              value={searchText}
            />
            <button className="primary-action compact" disabled={searching} onClick={searchMutuals} type="button">
              {searching ? "Searching" : "Search"}
            </button>
          </div>

          {searchResults.length ? (
            <div className="mutual-result-list">
              {searchResults.map((person) => (
                <article className="mutual-result-row" key={person.user_id}>
                  {renderPersonAvatar(person)}
                  <div>
                    <strong>{person.full_name}</strong>
                    <span>{person.email}</span>
                  </div>
                  {person.mutual_status === "active" ? (
                    <em>Mutual</em>
                  ) : person.mutual_status === "pending" ? (
                    <em>{person.direction === "received" ? "Pending your reply" : "Requested"}</em>
                  ) : (
                    <button className="primary-action compact filled" onClick={() => requestMutual(person.user_id)} type="button">
                      Request
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {pendingCount ? (
        <section className="panel mutual-pending-panel">
          <p className="eyebrow">Mutual requests</p>
          {feedData.pending_requests.map((request) => (
            <article className="mutual-result-row" key={request.id}>
              {renderPersonAvatar(request)}
              <div>
                <strong>{request.requester_name}</strong>
                <span>{request.requester_email}</span>
              </div>
              <button className="primary-action compact filled" onClick={() => respondMutual(request.id, "active")} type="button">
                Accept
              </button>
              <button className="primary-action compact danger" onClick={() => respondMutual(request.id, "rejected")} type="button">
                Reject
              </button>
            </article>
          ))}
        </section>
      ) : null}

      {activeView === "leaderboard" ? (
        <section className="panel mutual-leaderboard-card">
          <div>
            <p className="eyebrow">This week</p>
            <h2>Movementz Leaderboard</h2>
            <p>{leaderboardHelp(leaderboardMetric)}</p>
          </div>
          <div className="leaderboard-toggle-row">
            {Object.entries(leaderboardLabels).map(([key, label]) => (
              <button
                className={leaderboardMetric === key ? "active" : ""}
                key={key}
                onClick={() => setLeaderboardMetric(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {leaderboard.rows.length ? (
            <div className="leaderboard-list">
              {leaderboard.rows.map((row) => (
                <article key={row.user_id}>
                  <span>#{row.rank}</span>
                  {renderPersonAvatar(row)}
                  <strong>{row.full_name}</strong>
                  <em>{row.score} {leaderboardLabels[leaderboardMetric]}</em>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <strong>No leaderboard data yet</strong>
              <p>Mutual activity will appear here once workouts, PRs or mood logs are recorded.</p>
            </div>
          )}
        </section>
      ) : activeView === "mutuals" ? (
        <section className="panel mutual-list-panel">
          <div className="section-row">
            <div>
              <p className="eyebrow">Your mutuals</p>
              <h2>{feedData.mutual_count || 0} approved</h2>
            </div>
          </div>
          {hasMutuals ? (
            feedData.mutuals.map((person) => (
              <article className="mutual-result-row" key={person.user_id}>
                {renderPersonAvatar(person)}
                <div>
                  <strong>{person.full_name}</strong>
                  <span>{person.email}</span>
                </div>
                <em>Active</em>
              </article>
            ))
          ) : (
            <p className="compact-help">Search for someone by email to request mutual access.</p>
          )}
        </section>
      ) : (
        <section className="panel coach-activity-feed mutual-feed-list">
          <div className="section-row">
            <div>
              <h2>Mutual activity</h2>
              <p>Completed workouts, mood updates and PRs from people you have approved.</p>
            </div>
          </div>
          {feedData.feed.length ? (
            feedData.feed.map((item) => {
              const key = `${item.item_type}-${item.item_id}`;
              return (
                <article className="coach-feed-item" key={key}>
                  {renderPersonAvatar(item)}
                  <div>
                    <span className={`coach-feed-type ${item.item_type || "workout"}`}>{activityBadge(item.item_type)}</span>
                    <strong>
                      <span>{item.actor_name}</span> {item.title}
                    </strong>
                    <p>{item.detail}</p>
                    <em>{formatFeedDate(item.created_at)}</em>
                    <div className="coach-feed-actions">
                      <button className={item.liked_by_me ? "active" : ""} onClick={() => toggleLike(item)} type="button">
                        {item.liked_by_me ? "Liked" : "Like"} ({item.like_count || 0})
                      </button>
                    </div>
                    {item.comments?.length ? (
                      <div className="feed-comment-list">
                        {item.comments.map((comment) => (
                          <p key={comment.id}>
                            <strong>{comment.actor_name}</strong> {comment.body}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <div className="feed-comment-form">
                      <input
                        onChange={(event) => setCommentDrafts((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder="Add a comment..."
                        type="text"
                        value={commentDrafts[key] || ""}
                      />
                      <button className="primary-action compact" onClick={() => addComment(item)} type="button">
                        Send
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state compact">
              <strong>No mutual activity yet</strong>
              <p>Find a mutual above, then activity will appear when they train or check in.</p>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
