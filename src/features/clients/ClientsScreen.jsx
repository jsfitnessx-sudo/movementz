import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";
import { buildProgressRecords, formatRecordDate, formatRecordDuration } from "../progress/progressRecords.js";

const progressPhotoBucket = "progress-photos";
const clientTrackerSelect = "id,goal_name,goal_type,start_weight_kg,goal_weight_kg,maintenance_calories,target_calories,duration_weeks,start_date,status";
const measurementFields = [
  ["neck_cm", "Neck"],
  ["chest_cm", "Chest"],
  ["waist_cm", "Waist"],
  ["hips_cm", "Hips"],
  ["left_bicep_cm", "Left bicep"],
  ["right_bicep_cm", "Right bicep"],
  ["left_thigh_cm", "Left thigh"],
  ["right_thigh_cm", "Right thigh"]
];

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

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (!minutes) return `${secs}s`;
  return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

function formatKg(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}kg`;
}

function formatCalories(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number).toLocaleString()} cal`;
}

function formatChange(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}${suffix}`;
}

function trackerWeekPercent(tracker, checkins) {
  if (!tracker?.duration_weeks) return 0;
  return Math.round(((checkins || []).length / tracker.duration_weeks) * 100);
}

function latestCheckin(checkins) {
  return [...(checkins || [])].sort((left, right) => Number(right.week_number || 0) - Number(left.week_number || 0))[0] || null;
}

function deltaLabel(start, end, suffix = "") {
  if (start === null || start === undefined || start === "" || end === null || end === undefined || end === "") return "-";
  const value = Number(end) - Number(start);
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function measurementChanges(tracker, checkins) {
  const latest = latestCheckin(checkins);
  if (!tracker || !latest) return [];
  return measurementFields
    .map(([field, label]) => ({ label, value: deltaLabel(tracker[field], latest[field], "cm") }))
    .filter((item) => item.value !== "-");
}

function habitPercent(habit) {
  if (habit?.percent !== null && habit?.percent !== undefined) return Number(habit.percent) || 0;
  const total = Number(habit?.total || 7) || 7;
  return Math.round(((Number(habit?.done || 0) || 0) / total) * 100);
}

function MiniLineChart({ color = "teal", label, points, suffix = "" }) {
  const cleanPoints = points.filter((point) => point.value !== null && point.value !== undefined && point.value !== "");
  if (cleanPoints.length < 2) {
    return (
      <article className="mini-line-chart empty">
        <p className="eyebrow">{label}</p>
        <span>Log more tracker data to show this chart.</span>
      </article>
    );
  }

  const values = cleanPoints.map((point) => Number(point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = cleanPoints
    .map((point, index) => {
      const x = (index / (cleanPoints.length - 1)) * 100;
      const y = 86 - ((Number(point.value) - min) / range) * 72;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <article className={`mini-line-chart ${color}`}>
      <p className="eyebrow">{label}</p>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={path} />
      </svg>
      <div className="mini-chart-labels">
        <span>{cleanPoints[0].label}: {cleanPoints[0].value}{suffix}</span>
        <strong>{cleanPoints.at(-1).label}: {cleanPoints.at(-1).value}{suffix}</strong>
      </div>
    </article>
  );
}

function CoachProgressRecords({ records }) {
  if (!records.count) {
    return <p className="compact-help">No PR records yet. Completed weighted sessions and For Time workouts will appear here.</p>;
  }

  return (
    <div className="progress-records-grid coach-records-grid">
      {records.bestVolume ? (
        <article className="progress-record-card gold">
          <p className="eyebrow">Best volume</p>
          <strong>{Math.round(records.bestVolume.total_volume_kg || 0).toLocaleString()}kg</strong>
          <span>{records.bestVolume.name} - {formatRecordDate(records.bestVolume.completed_at)}</span>
        </article>
      ) : null}

      {records.forTime.length ? (
        <article className="progress-record-card">
          <p className="eyebrow">For Time PBs</p>
          <div className="progress-record-list">
            {records.forTime.slice(0, 3).map((session) => (
              <span key={session.id}>
                <strong>{session.name}</strong>
                <em>{formatRecordDuration(session.duration_seconds)} - {formatRecordDate(session.completed_at)}</em>
              </span>
            ))}
          </div>
        </article>
      ) : null}

      <article className="progress-record-card">
        <p className="eyebrow">Heaviest sets</p>
        {records.maxWeight.length ? (
          <div className="progress-record-list">
            {records.maxWeight.slice(0, 4).map((record) => (
              <span key={record.exerciseName}>
                <strong>{record.exerciseName}</strong>
                <em>{record.kg}kg x {record.reps} - {formatRecordDate(record.date)}</em>
              </span>
            ))}
          </div>
        ) : (
          <p className="compact-help">No completed weighted sets yet.</p>
        )}
      </article>

      <article className="progress-record-card">
        <p className="eyebrow">Estimated 1RM</p>
        {records.oneRepMax.length ? (
          <div className="progress-record-list">
            {records.oneRepMax.slice(0, 4).map((record) => (
              <span key={record.exerciseName}>
                <strong>{record.exerciseName}</strong>
                <em>{Math.round(record.estimatedOneRepMax)}kg est - {record.kg}kg x {record.reps}</em>
              </span>
            ))}
          </div>
        ) : (
          <p className="compact-help">Estimated 1RMs appear after weighted sets.</p>
        )}
      </article>
    </div>
  );
}

function CoachFinalTrackerCard({ tracker }) {
  const summary = tracker.final_summary || {};
  const measurements = Object.values(summary.measurements || {}).filter((item) => item.change !== null && item.change !== undefined);
  const initialPhotos = summary.initial_photos || [];
  const finalPhotos = summary.final_photos || [];

  return (
    <article className="tracker-final-card coach-final-tracker-card">
      <div className="tracker-final-head">
        <div>
          <p className="eyebrow">Final summary</p>
          <h2>{tracker.goal_name}</h2>
          <span>{tracker.duration_weeks} weeks - completed {formatShortDate(summary.completed_at || tracker.completed_at)}</span>
        </div>
        <strong>{summary.checkins_logged || 0}/{tracker.duration_weeks || 0}</strong>
      </div>

      <div className="tracker-final-stats">
        <div>
          <span>Start</span>
          <strong>{formatKg(summary.start?.weight_kg)}</strong>
        </div>
        <div>
          <span>Final</span>
          <strong>{formatKg(summary.final?.weight_kg)}</strong>
        </div>
        <div>
          <span>Weight</span>
          <strong>{formatChange(summary.changes?.weight_kg, "kg")}</strong>
        </div>
        <div>
          <span>Body fat</span>
          <strong>{formatChange(summary.changes?.body_fat_percent, "%")}</strong>
        </div>
      </div>

      {measurements.length ? (
        <div className="tracker-final-measures">
          {measurements.slice(0, 8).map((item) => (
            <span key={item.label}>{item.label.replace(" cm", "")}: {formatChange(item.change, "cm")}</span>
          ))}
        </div>
      ) : null}

      {initialPhotos.length || finalPhotos.length ? (
        <div className="tracker-final-photos">
          <CoachFinalPhotoGroup label="Initial" photos={initialPhotos} />
          <CoachFinalPhotoGroup label="Final" photos={finalPhotos} />
        </div>
      ) : null}
    </article>
  );
}

function CoachFinalPhotoGroup({ label, photos }) {
  if (!photos.length) return null;
  return (
    <div>
      <span>{label}</span>
      <div>
        {photos.map((photo) => (
          <img alt={`${label} ${photo.pose}`} key={photo.id} src={photo.thumbnail_url} />
        ))}
      </div>
    </div>
  );
}

export function ClientsScreen({ profile, user }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientPhotos, setClientPhotos] = useState([]);
  const [clientPhotoCount, setClientPhotoCount] = useState(0);
  const [clientTracker, setClientTracker] = useState(null);
  const [clientCheckinCount, setClientCheckinCount] = useState(0);
  const [clientCheckins, setClientCheckins] = useState([]);
  const [clientAssignedPlans, setClientAssignedPlans] = useState([]);
  const [clientLatestWorkout, setClientLatestWorkout] = useState(null);
  const [clientWorkoutCount, setClientWorkoutCount] = useState(0);
  const [clientWorkoutHistory, setClientWorkoutHistory] = useState([]);
  const [clientProgressRecords, setClientProgressRecords] = useState(() => buildProgressRecords([]));
  const [clientCompletedTrackers, setClientCompletedTrackers] = useState([]);
  const [clientHabits, setClientHabits] = useState([]);
  const [clientHabitAverage, setClientHabitAverage] = useState(0);
  const [clientFoodSummary, setClientFoodSummary] = useState(null);
  const [clientFoodError, setClientFoodError] = useState("");
  const [clientProgressError, setClientProgressError] = useState("");
  const [clientChartsOpen, setClientChartsOpen] = useState(false);
  const [clientPhotosOpen, setClientPhotosOpen] = useState(false);
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
  const latestClientCheckin = useMemo(() => latestCheckin(clientCheckins), [clientCheckins]);
  const clientCheckinPercent = useMemo(() => trackerWeekPercent(clientTracker, clientCheckins), [clientCheckins, clientTracker]);
  const clientWeightChange = useMemo(
    () => deltaLabel(clientTracker?.start_weight_kg, latestClientCheckin?.weight_kg, "kg"),
    [clientTracker?.start_weight_kg, latestClientCheckin?.weight_kg]
  );
  const clientMeasurements = useMemo(() => measurementChanges(clientTracker, clientCheckins), [clientCheckins, clientTracker]);
  const clientChartPoints = useMemo(() => {
    if (!clientTracker) return { weight: [], fat: [], muscle: [], waist: [] };
    return {
      weight: [
        { label: "Start", value: clientTracker.start_weight_kg },
        ...clientCheckins.map((row) => ({ label: `W${row.week_number}`, value: row.weight_kg }))
      ],
      fat: [
        { label: "Start", value: clientTracker.fat_kg },
        ...clientCheckins.map((row) => ({ label: `W${row.week_number}`, value: row.fat_kg }))
      ],
      muscle: [
        { label: "Start", value: clientTracker.muscle_kg },
        ...clientCheckins.map((row) => ({ label: `W${row.week_number}`, value: row.muscle_kg }))
      ],
      waist: [
        { label: "Start", value: clientTracker.waist_cm },
        ...clientCheckins.map((row) => ({ label: `W${row.week_number}`, value: row.waist_cm }))
      ]
    };
  }, [clientCheckins, clientTracker]);
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

  const signClientPhotos = useCallback(async (rows) => {
    return Promise.all(
      (rows || []).map(async (photo) => {
        const { data: signed, error } = await supabase.storage
          .from(progressPhotoBucket)
          .createSignedUrl(photo.thumbnail_path, 60 * 60);

        return { ...photo, thumbnail_url: error ? "" : signed?.signedUrl || "" };
      })
    );
  }, []);

  const signTrackerSummaryPhotos = useCallback(async (trackers) => {
    const photoIds = [
      ...new Set(
        (trackers || []).flatMap((tracker) => [
          ...((tracker.final_summary || {}).initial_photo_ids || []),
          ...((tracker.final_summary || {}).final_photo_ids || [])
        ]).filter(Boolean)
      )
    ];

    if (!photoIds.length) return trackers || [];

    const { data, error } = await supabase
      .from("progress_photos")
      .select("id,pose,thumbnail_path,taken_at")
      .in("id", photoIds);

    if (error) return trackers || [];

    const signedPhotos = await signClientPhotos(data || []);
    const photoMap = new Map(signedPhotos.map((photo) => [photo.id, photo]));

    return (trackers || []).map((tracker) => {
      const summary = tracker.final_summary || {};
      return {
        ...tracker,
        final_summary: {
          ...summary,
          initial_photos: (summary.initial_photo_ids || []).map((id) => photoMap.get(id)).filter(Boolean),
          final_photos: (summary.final_photo_ids || []).map((id) => photoMap.get(id)).filter(Boolean)
        }
      };
    });
  }, [signClientPhotos]);

  const loadClientProgress = useCallback(async () => {
    const clientId = selectedClient?.client_id;
    if (!clientId || !supabase || user.id === "demo-user") {
      setClientPhotos([]);
      setClientPhotoCount(0);
      setClientTracker(null);
      setClientCheckinCount(0);
      setClientCheckins([]);
      setClientAssignedPlans([]);
      setClientLatestWorkout(null);
      setClientWorkoutCount(0);
      setClientWorkoutHistory([]);
      setClientProgressRecords(buildProgressRecords([]));
      setClientCompletedTrackers([]);
      setClientHabits([]);
      setClientHabitAverage(0);
      setClientFoodSummary(null);
      setClientFoodError("");
      setClientProgressError("");
      setLoadingPhotos(false);
      return;
    }

    setLoadingPhotos(true);
    setClientProgressError("");
    setClientFoodError("");

    const loadFoodSummary = async () => {
      const { data, error } = await supabase.rpc("get_coach_client_food_summary", {
        target_client_id: clientId
      });

      if (error) {
        setClientFoodSummary(null);
        setClientFoodError(`${error.message}. Run supabase/phase-24-food-log.sql in Supabase.`);
        return;
      }

      setClientFoodSummary(data || null);
      setClientFoodError("");
    };

    const { data: summary, error: summaryError } = await supabase.rpc("get_coach_client_progress_summary", {
      target_client_id: clientId
    });

    if (!summaryError) {
      setClientTracker(summary?.tracker || null);
      setClientCheckinCount(summary?.checkin_count || 0);
      setClientCheckins(summary?.checkins || []);
      setClientPhotoCount(summary?.photo_count || 0);
      setClientPhotos(await signClientPhotos(summary?.photos || []));
      setClientAssignedPlans(summary?.assigned_plans || []);
      setClientLatestWorkout(summary?.latest_workout || null);
      setClientWorkoutCount(summary?.workout_count || 0);
      setClientWorkoutHistory(summary?.latest_workouts || []);
      setClientProgressRecords(buildProgressRecords(summary?.record_sessions || []));
      setClientCompletedTrackers(await signTrackerSummaryPhotos(summary?.completed_trackers || []));
      setClientHabits(summary?.habits || []);
      setClientHabitAverage(summary?.habit_average || 0);
      await loadFoodSummary();
      setLoadingPhotos(false);
      return;
    }

    setClientProgressError(`${summaryError.message}. Run supabase/phase-16-coach-client-progress.sql in Supabase.`);

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
    } else {
      setClientPhotos(await signClientPhotos(data || []));
      setClientPhotoCount(count ?? (data || []).length);
    }

    const { data: trackerData, error: trackerError } = await supabase
      .from("goal_trackers")
      .select(clientTrackerSelect)
      .eq("user_id", clientId)
      .in("status", ["active", "completed", "archived"])
      .order("status", { ascending: true })
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (trackerError || !trackerData) {
      setClientTracker(null);
      setClientCheckinCount(0);
      setClientCheckins([]);
      setClientAssignedPlans([]);
      setClientLatestWorkout(null);
      setClientWorkoutCount(0);
      setClientWorkoutHistory([]);
      setClientProgressRecords(buildProgressRecords([]));
      setClientCompletedTrackers([]);
      setClientHabits([]);
      setClientHabitAverage(0);
      setClientFoodSummary(null);
      setClientFoodError("");
      setLoadingPhotos(false);
      return;
    }

    setClientTracker(trackerData);

    const { count: checkinCount } = await supabase
      .from("goal_tracker_checkins")
      .select("id", { count: "exact", head: true })
      .eq("tracker_id", trackerData.id);

    setClientCheckinCount(checkinCount || 0);
    setClientCheckins([]);
    setClientAssignedPlans([]);
    setClientLatestWorkout(null);
    setClientWorkoutCount(0);
    setClientWorkoutHistory([]);
    setClientProgressRecords(buildProgressRecords([]));
    setClientCompletedTrackers([]);
    setClientHabits([]);
    setClientHabitAverage(0);
    await loadFoodSummary();
    setLoadingPhotos(false);
  }, [selectedClient?.client_id, signClientPhotos, signTrackerSummaryPhotos, user.id]);

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
      if (alive) loadClientProgress();
    });

    return () => {
      alive = false;
    };
  }, [loadClientProgress]);

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
              <strong>{clientWorkoutCount}</strong>
            </div>
            <div>
              <span>Adherence</span>
              <strong>{clientTracker ? `${clientCheckinPercent}%` : "-"}</strong>
            </div>
            <div>
              <span>Check-ins</span>
              <strong>{clientCheckinCount}</strong>
            </div>
            <div>
              <span>PRs</span>
              <strong>{clientProgressRecords.count}</strong>
            </div>
          </div>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Assigned plans</p>
                <span>Active plans and block dates for this client.</span>
              </div>
            </div>
            {clientAssignedPlans.length ? (
              <div className="coach-plan-list">
                {clientAssignedPlans.map((plan) => {
                  const start = plan.assigned_at || plan.created_at;
                  const endDate = start && plan.block_weeks
                    ? new Date(new Date(start).getTime() + Number(plan.block_weeks) * 7 * 24 * 60 * 60 * 1000)
                    : null;
                  return (
                    <article className="coach-plan-row" key={plan.assignment_id || plan.plan_id}>
                      <div>
                        <strong>{plan.name}</strong>
                        <span>{plan.workout_count || 0} workouts - {plan.block_weeks ? `${plan.block_weeks} week block` : "No timeframe"}</span>
                        <em>{start ? formatShortDate(start) : ""}{endDate ? ` - ${formatShortDate(endDate)}` : ""}</em>
                      </div>
                      <span className="status-pill gold-pill">{plan.status || "active"}</span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="compact-help">No active assigned plans yet.</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Progress charts</p>
                <span>Tracker charts match the client Progress tab data.</span>
              </div>
              <button className="primary-action compact" onClick={() => setClientChartsOpen((open) => !open)} type="button">
                {clientChartsOpen ? "Hide" : "Open"}
              </button>
            </div>
            {clientTracker ? (
              <>
                <div className="tracker-chart-placeholder">
                  <span style={{ width: `${Math.max(8, clientCheckinPercent)}%` }} />
                </div>
                {clientChartsOpen ? (
                  <div className="tracker-chart-grid">
                    <MiniLineChart color="teal" label="Weight over tracker" points={clientChartPoints.weight} suffix="kg" />
                    <MiniLineChart color="gold" label="Fat mass" points={clientChartPoints.fat} suffix="kg" />
                    <MiniLineChart color="blue" label="Muscle mass" points={clientChartPoints.muscle} suffix="kg" />
                    <MiniLineChart color="teal" label="Waist change" points={clientChartPoints.waist} suffix="cm" />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="compact-help">No active tracker yet.</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Progress records</p>
                <span>Strength and For Time records from completed sessions.</span>
              </div>
              <strong className="client-week-average">{clientProgressRecords.count}</strong>
            </div>
            <CoachProgressRecords records={clientProgressRecords} />
          </section>

          {clientCompletedTrackers.length ? (
            <section className="client-progress-card">
              <div className="client-section-title">
                <div>
                  <p className="eyebrow">Completed trackers</p>
                  <span>Final summaries saved when a tracker block is completed.</span>
                </div>
              </div>
              <div className="client-final-tracker-list">
                {clientCompletedTrackers.map((tracker) => (
                  <CoachFinalTrackerCard key={tracker.id} tracker={tracker} />
                ))}
              </div>
            </section>
          ) : null}

          <div className="client-detail-grid">
            <section className="client-progress-card">
              <p className="eyebrow">Latest workout</p>
              {clientLatestWorkout ? (
                <div className="client-tracker-summary">
                  <strong>{clientLatestWorkout.name}</strong>
                  <span>{formatShortDate(clientLatestWorkout.completed_at)} - {formatDuration(clientLatestWorkout.duration_seconds)}</span>
                  <span>{clientLatestWorkout.total_exercises} exercises - {Math.round(clientLatestWorkout.total_volume_kg || 0).toLocaleString()}kg</span>
                </div>
              ) : (
                <p className="compact-help">No completed workouts yet.</p>
              )}
            </section>

            <section className="client-progress-card">
              <p className="eyebrow">Body + calories</p>
              {clientTracker ? (
                <div className="client-tracker-summary">
                  <strong>{clientName(selectedClient)}</strong>
                  <span>Current {formatKg(latestClientCheckin?.weight_kg ?? clientTracker.start_weight_kg)} - Change {clientWeightChange}</span>
                  <span>Maintenance {clientTracker.maintenance_calories || "-"} cal - Target {clientTracker.target_calories || "-"} cal</span>
                </div>
              ) : (
                <p className="compact-help">No tracker calories yet.</p>
              )}
            </section>
          </div>

          <section className="client-progress-card coach-food-summary">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Food log</p>
                <span>Daily calories and recent nutrition logs from this client.</span>
              </div>
              {clientFoodSummary ? <strong className="client-week-average">{clientFoodSummary.monthly_compliance || 0}%</strong> : null}
            </div>
            {clientFoodError ? (
              <p className="form-message error">{clientFoodError}</p>
            ) : clientFoodSummary ? (
              <>
                <div className="coach-food-grid">
                  <div>
                    <span>Today</span>
                    <strong>{formatCalories(clientFoodSummary.today_calories)}</strong>
                  </div>
                  <div>
                    <span>Target</span>
                    <strong>{formatCalories(clientFoodSummary.today_target)}</strong>
                  </div>
                  <div className={Number(clientFoodSummary.today_remaining) < 0 ? "over" : ""}>
                    <span>{Number(clientFoodSummary.today_remaining) < 0 ? "Exceeded" : "Remaining"}</span>
                    <strong>{formatCalories(Math.abs(Number(clientFoodSummary.today_remaining || 0)))}</strong>
                  </div>
                  <div>
                    <span>Week avg</span>
                    <strong>{formatCalories(clientFoodSummary.week_average)}</strong>
                  </div>
                </div>
                {clientFoodSummary.recent_days?.length ? (
                  <div className="coach-food-days">
                    {clientFoodSummary.recent_days.map((day) => (
                      <span key={day.log_date}>
                        <strong>{formatShortDate(day.log_date)}</strong>
                        <em>{formatCalories(day.calories)} - {day.entries || 0} items - P {Math.round(day.protein_g || 0)}g</em>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="compact-help">No recent food logs yet.</p>
                )}
              </>
            ) : (
              <p className="compact-help">No food log data yet.</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Measurements from start</p>
                <span>Latest check-in compared with starting tracker measurements.</span>
              </div>
            </div>
            {clientMeasurements.length ? (
              <div className="tracker-change-list">
                {clientMeasurements.map((item) => <span key={item.label}>{item.label}: {item.value}</span>)}
              </div>
            ) : (
              <p className="compact-help">Add starting measurements and at least one weekly check-in to show centimetre changes.</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Daily habits</p>
                <span>Last 7 days habit compliance for {clientName(selectedClient)}.</span>
              </div>
              <strong className="client-week-average">{clientHabitAverage}%</strong>
            </div>
            {clientHabits.length ? (
              <div className="coach-habit-table">
                <div className="coach-habit-head">
                  <span>Habit</span>
                  <span>Done</span>
                  <span>Compliance</span>
                </div>
                {clientHabits.map((habit) => (
                  <div className="coach-habit-row" key={habit.name}>
                    <strong>{habit.name}</strong>
                    <span>{habit.done || 0}/{habit.total || 7}</span>
                    <div>
                      <em><i style={{ width: `${habitPercent(habit)}%` }} /></em>
                      <b>{habitPercent(habit)}%</b>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="compact-help">No habit logs yet. Once this client starts logging, weekly compliance will show here.</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Workout history</p>
                <span>Recent completed sessions from this client.</span>
              </div>
            </div>
            {clientWorkoutHistory.length ? (
              <div className="coach-history-list">
                {clientWorkoutHistory.map((session) => (
                  <article className="coach-history-row" key={session.id}>
                    <div>
                      <strong>{session.name}</strong>
                      <span>{formatShortDate(session.completed_at)} - {formatDuration(session.duration_seconds)}</span>
                    </div>
                    <span>{session.total_exercises} exercises</span>
                    <em>{Math.round(session.total_volume_kg || 0).toLocaleString()}kg</em>
                  </article>
                ))}
              </div>
            ) : (
              <p className="compact-help">No workout history yet.</p>
            )}
          </section>

          <section className="client-progress-card">
            <div className="client-section-title">
              <div>
                <p className="eyebrow">Progress photos</p>
                <span>{clientPhotoCount} photos in this client's photo library.</span>
              </div>
              <div className="inline-actions">
                <button className="primary-action compact" onClick={loadClientProgress} disabled={loadingPhotos} type="button">
                  {loadingPhotos ? "Loading..." : "Refresh"}
                </button>
                <button className="primary-action compact" onClick={() => setClientPhotosOpen((open) => !open)} type="button">
                  {clientPhotosOpen ? "Hide photos" : "Open photos"}
                </button>
              </div>
            </div>

            {clientProgressError ? <p className="form-message error">{clientProgressError}</p> : null}

            {clientPhotosOpen ? (
              clientPhotos.length ? (
                <div className="client-photo-strip compact">
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
              )
            ) : (
              <p className="compact-help">Photos are kept in the client's progress photo library. Open only when you need to review them.</p>
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
