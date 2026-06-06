import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

function toExerciseKey(exerciseName) {
  return exerciseName.trim().toLowerCase();
}

export function AdminRequestsScreen({ user }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});

  const loadRequests = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("exercise_review_requests")
      .select("id,requester_id,exercise_name,muscle_group,status,youtube_url,admin_notes,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    setLoading(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-4-exercise-library.sql, then promote your account to admin.`);
      setRequests([]);
      return;
    }

    setRequests(data || []);
    setDrafts(
      Object.fromEntries(
        (data || []).map((request) => [
          request.id,
          {
            youtube_url: request.youtube_url || "",
            admin_notes: request.admin_notes || ""
          }
        ])
      )
    );
  }, [user.id]);

  useEffect(() => {
    const load = Promise.resolve().then(loadRequests);
    return () => {
      void load;
    };
  }, [loadRequests]);

  function updateDraft(requestId, field, value) {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] || {}),
        [field]: value
      }
    }));
  }

  async function reviewRequest(request, status) {
    if (!supabase) return;

    const draft = drafts[request.id] || {};
    const cleanYoutubeUrl = draft.youtube_url?.trim() || "";

    setSavingId(request.id);
    setMessage("");

    if (status === "approved" && cleanYoutubeUrl) {
      const { error: demoError } = await supabase.from("exercise_demo_links").upsert(
        {
          exercise_key: toExerciseKey(request.exercise_name),
          exercise_name: request.exercise_name,
          muscle_group: request.muscle_group || null,
          youtube_url: cleanYoutubeUrl,
          source_request_id: request.id,
          created_by: user.id,
          updated_at: new Date().toISOString()
        },
        { onConflict: "exercise_key" }
      );

      if (demoError) {
        setSavingId("");
        setMessage(`${demoError.message}. Run the updated supabase/phase-4-exercise-library.sql first.`);
        return;
      }
    } else if (status === "rejected") {
      const { error: deleteDemoError } = await supabase
        .from("exercise_demo_links")
        .delete()
        .eq("exercise_key", toExerciseKey(request.exercise_name));

      if (deleteDemoError) {
        setSavingId("");
        setMessage(deleteDemoError.message);
        return;
      }
    }

    if (status === "approved") {
      const { error: catalogError } = await supabase.from("exercise_catalog").upsert(
        {
          exercise_key: toExerciseKey(request.exercise_name),
          exercise_name: request.exercise_name,
          muscle_group: request.muscle_group || null,
          source: "admin",
          updated_at: new Date().toISOString()
        },
        { onConflict: "exercise_key" }
      );

      if (catalogError) {
        setSavingId("");
        setMessage(`${catalogError.message}. Run the updated supabase/phase-4-exercise-library.sql first.`);
        return;
      }
    }

    const { error } = await supabase
      .from("exercise_review_requests")
      .update({
        status,
        youtube_url: cleanYoutubeUrl || null,
        admin_notes: draft.admin_notes?.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .eq("id", request.id);

    setSavingId("");

    if (error) {
      setMessage(error.message);
      return;
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? {
              ...item,
              status,
              youtube_url: cleanYoutubeUrl || null,
              admin_notes: draft.admin_notes?.trim() || null
            }
          : item
      )
    );
    setMessage(status === "approved" ? "Exercise approved." : "Exercise rejected.");
  }

  return (
    <section className="screen-stack">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Exercise requests</h1>
          <p>Review user-added exercises and attach demo links.</p>
        </div>
        <button className="primary-action" onClick={loadRequests} type="button">
          Refresh
        </button>
      </div>

      {message ? <p className="form-message success">{message}</p> : null}

      {loading ? (
        <div className="panel">
          <p>Loading requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="panel empty-state">
          <h2>No exercise requests</h2>
          <p>Custom exercise requests will appear here when users add missing movements.</p>
        </div>
      ) : (
        <div className="request-list">
          {requests.map((request) => {
            const draft = drafts[request.id] || {};
            const requestDate = new Date(request.created_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short"
            });

            return (
              <article className="request-card" key={request.id}>
                <div className="workout-card-head">
                  <div>
                    <p className="eyebrow">{request.muscle_group || "Unassigned"} - {requestDate}</p>
                    <h2>{request.exercise_name}</h2>
                    <p>Requested by {request.requester_id}</p>
                  </div>
                  <span className={request.status === "pending" ? "status-pill" : "status-pill muted-pill"}>
                    {request.status}
                  </span>
                </div>

                <label>
                  YouTube demo link
                  <input
                    disabled={savingId === request.id}
                    onChange={(event) => updateDraft(request.id, "youtube_url", event.target.value)}
                    placeholder="https://youtube.com/..."
                    value={draft.youtube_url || ""}
                  />
                </label>

                <label>
                  Admin notes
                  <textarea
                    disabled={savingId === request.id}
                    onChange={(event) => updateDraft(request.id, "admin_notes", event.target.value)}
                    placeholder="Optional notes for this exercise"
                    value={draft.admin_notes || ""}
                  />
                </label>

                <div className="library-actions">
                  <button
                    className="primary-action filled"
                    disabled={savingId === request.id}
                    onClick={() => reviewRequest(request, "approved")}
                    type="button"
                  >
                    {savingId === request.id ? "Saving..." : "Approve"}
                  </button>
                  <button
                    className="primary-action danger"
                    disabled={savingId === request.id}
                    onClick={() => reviewRequest(request, "rejected")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
