import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";
import { WorkoutLibraryScreen } from "../workouts/WorkoutLibraryScreen.jsx";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const archivedRetentionDays = 30;

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getPlanWindow(plan, assignedAt) {
  const start = new Date(plan.created_at || assignedAt || Date.now());
  if (Number.isNaN(start.getTime()) || plan.plan_type !== "block") {
    return { start, end: null, archiveUntil: null, status: "active" };
  }

  const end = addDays(start, (Number(plan.block_weeks) || 4) * 7);
  const archiveUntil = addDays(end, archivedRetentionDays);
  const now = new Date();

  if (now <= end) return { start, end, archiveUntil, status: "active" };
  if (now <= archiveUntil) return { start, end, archiveUntil, status: "archived" };
  return { start, end, archiveUntil, status: "expired" };
}

function formatPlanWindow(plan, assignedAt) {
  const { start, end, status } = getPlanWindow(plan, assignedAt);
  if (!end) return "No timeframe";
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  const weekNumber = Math.min(Number(plan.block_weeks) || 4, Math.max(1, Math.floor((Date.now() - start.getTime()) / 604800000) + 1));
  return status === "active" ? `Week ${weekNumber} of ${plan.block_weeks || 4} - ${daysLeft} days left` : "Archived";
}

function formatTodayDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateForWeekday(dayLabel) {
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay() || 7;
  monday.setDate(today.getDate() - day + 1);
  const index = weekdays.indexOf(dayLabel);
  const target = new Date(monday);
  target.setDate(monday.getDate() + Math.max(index, 0));
  return localDateKey(target);
}

function normalisePlan(assignment, source) {
  const plan = source === "assigned" ? assignment.plan || {} : assignment;
  const window = getPlanWindow(plan, assignment.assigned_at);

  return {
    assignmentId: assignment.assignment_id || plan.id,
    assignedAt: assignment.assigned_at || plan.created_at,
    coachName: assignment.coach_name || assignment.assigned_by_name || assignment.coach?.full_name || "",
    plan,
    source,
    window
  };
}

export function TodayScreen({ role, user }) {
  const [ownPlans, setOwnPlans] = useState([]);
  const [assignedPlans, setAssignedPlans] = useState([]);
  const [coachLinks, setCoachLinks] = useState([]);
  const [dueCheckins, setDueCheckins] = useState([]);
  const [checkinDrafts, setCheckinDrafts] = useState({});
  const [activeScheduleWorkout, setActiveScheduleWorkout] = useState(null);
  const [selectedDay, setSelectedDay] = useState(
    new Date().toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");
  const startCounterRef = useRef(0);
  const selectedDate = useMemo(() => dateForWeekday(selectedDay), [selectedDay]);

  const schedulePlans = useMemo(() => {
    return [
      ...ownPlans.map((plan) => normalisePlan(plan, "own")),
      ...assignedPlans.map((assignment) => normalisePlan(assignment, "assigned"))
    ];
  }, [assignedPlans, ownPlans]);

  const activePlans = useMemo(
    () => schedulePlans.filter((entry) => entry.window.status === "active" && entry.plan.status !== "archived"),
    [schedulePlans]
  );

  const scheduledWorkouts = useMemo(() => {
    return activePlans.flatMap((entry) => {
      const plan = entry.plan;
      return (plan.training_plan_workouts || [])
        .filter((workout) => {
          const days = Array.isArray(workout.scheduled_days) ? workout.scheduled_days : [];
          return days.includes(selectedDay);
        })
        .map((workout) => ({
          ...workout,
          assigned: entry.source === "assigned",
          planId: plan.id,
          planLabel: formatPlanWindow(plan, entry.assignedAt),
          planName: plan.name || (entry.source === "assigned" ? "Coach plan" : "My plan"),
          planCoachName: entry.coachName,
          planSource: entry.source,
          planWindow: entry.window,
          sourceKey: `${entry.source}-${entry.assignmentId}`
        }));
    }).sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [activePlans, selectedDay]);

  const dayCounts = useMemo(() => {
    return Object.fromEntries(
      weekdays.map((day) => [
        day,
        activePlans.reduce((count, entry) => {
          const workouts = entry.plan.training_plan_workouts || [];
          return count + workouts.filter((workout) => Array.isArray(workout.scheduled_days) && workout.scheduled_days.includes(day)).length;
        }, 0)
      ])
    );
  }, [activePlans]);

  const loadSchedule = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setOwnPlans([]);
      setAssignedPlans([]);
      setCoachLinks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const ownPlanQuery = supabase
      .from("training_plans")
      .select(
        "id,name,status,plan_type,block_weeks,instructions,created_at,training_plan_workouts(id,workout_template_id,position,name,workout_type,source_type,summary,scheduled_days)"
      )
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(50);

    const requests = [ownPlanQuery];
    if (role === "client") {
      requests.push(
        supabase.rpc("get_my_assigned_plans"),
        supabase.rpc("get_my_coach_status"),
        supabase.rpc("get_my_due_checkins", { target_date: selectedDate })
      );
    }

    const [ownPlanResult, assignedPlanResult, coachResult, checkinResult] = await Promise.all(requests);

    setLoading(false);

    if (ownPlanResult.error) {
      setMessage(`${ownPlanResult.error.message}. Run supabase/phase-6-training-plans.sql in Supabase.`);
      setOwnPlans([]);
    } else {
      setOwnPlans(
        (ownPlanResult.data || []).map((plan) => ({
          ...plan,
          training_plan_workouts: (plan.training_plan_workouts || []).sort((a, b) => a.position - b.position)
        }))
      );
    }

    if (role === "client") {
      if (assignedPlanResult?.error) {
        setMessage(`${assignedPlanResult.error.message}. Run supabase/phase-9-client-assignment-library.sql in Supabase.`);
        setAssignedPlans([]);
      } else {
        setAssignedPlans(assignedPlanResult?.data || []);
      }

      if (coachResult?.error) {
        setCoachLinks([]);
      } else {
        setCoachLinks(coachResult?.data || []);
      }

      if (checkinResult?.error) {
        setDueCheckins([]);
      } else {
        const checkins = checkinResult?.data || [];
        setDueCheckins(checkins);
        setCheckinDrafts((current) => {
          const next = { ...current };
          for (const checkin of checkins) {
            if (next[checkin.id]) continue;
            const responses = checkin.responses || {};
            next[checkin.id] = {
              energy: responses.energy || "",
              mood: responses.mood || "",
              win: responses.win || "",
              challenge: responses.challenge || "",
              question: responses.question || "",
              notes: checkin.response_notes || ""
            };
          }
          return next;
        });
      }
    } else {
      setAssignedPlans([]);
      setCoachLinks([]);
      setDueCheckins([]);
    }
  }, [role, selectedDate, user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadSchedule();
    });

    return () => {
      alive = false;
    };
  }, [loadSchedule]);

  function startScheduledWorkout(workout) {
    if (!workout.workout_template_id) {
      setMessage("This scheduled workout is missing its source workout. Re-import it into the plan.");
      return;
    }

    startCounterRef.current += 1;
    setActiveScheduleWorkout({
      id: workout.workout_template_id,
      name: workout.name,
      workout_type: workout.workout_type,
      isAssignedPlanWorkout: workout.assigned,
      autoStartKey: `${workout.sourceKey}-${workout.id || workout.workout_template_id}-${startCounterRef.current}`
    });
  }

  function updateCheckinDraft(checkinId, field, value) {
    setCheckinDrafts((current) => ({
      ...current,
      [checkinId]: {
        ...(current[checkinId] || {}),
        [field]: value
      }
    }));
  }

  async function submitCheckin(checkin) {
    if (!supabase || user.id === "demo-user") return;
    const draft = checkinDrafts[checkin.id] || {};
    const { error } = await supabase.from("coach_checkin_responses").upsert(
      {
        calendar_item_id: checkin.id,
        coach_id: checkin.coach_id,
        client_id: user.id,
        occurrence_date: checkin.occurrence_date,
        responses: {
          energy: draft.energy || null,
          mood: draft.mood || null,
          win: draft.win || null,
          challenge: draft.challenge || null,
          question: draft.question || null
        },
        notes: draft.notes || null
      },
      { onConflict: "calendar_item_id,client_id,occurrence_date" }
    );

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-33-recurring-coach-checkins.sql in Supabase.`);
      return;
    }

    setMessage("Check-in submitted.");
    await loadSchedule();
  }

  if (activeScheduleWorkout) {
    return (
      <WorkoutLibraryScreen
        autoStartWorkout={activeScheduleWorkout}
        embedded
        onClose={() => setActiveScheduleWorkout(null)}
        role={role}
        user={user}
      />
    );
  }

  return (
    <section className="screen-stack today-screen">
      <div className="screen-heading today-heading">
        <h1>Training <span>Schedule</span></h1>
        <p>{formatTodayDate()}</p>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading schedule...</p> : null}

      <div className="schedule-day-tabs prototype-day-tabs" role="tablist" aria-label="Training days">
        {weekdays.map((day) => (
          <button
            className={selectedDay === day ? "active" : ""}
            key={day}
            onClick={() => setSelectedDay(day)}
            type="button"
          >
            {day}
            {dayCounts[day] ? <span>{dayCounts[day]}</span> : null}
          </button>
        ))}
      </div>

      {role === "client" && coachLinks.length ? (
        <p className="compact-help today-coach-line">Coach: {coachLinks[0].coach_name}</p>
      ) : null}

      {role === "client" && dueCheckins.length ? (
        <section className="panel today-checkin-panel">
          <div className="section-row">
            <div>
              <p className="eyebrow">Coach check-ins</p>
              <h2>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h2>
            </div>
            <span className="status-pill">{dueCheckins.filter((checkin) => checkin.response_id).length}/{dueCheckins.length}</span>
          </div>
          {dueCheckins.map((checkin) => {
            const draft = checkinDrafts[checkin.id] || {};
            const submitted = Boolean(checkin.response_id);
            return (
              <article className={submitted ? "today-checkin-card submitted" : "today-checkin-card"} key={`${checkin.id}-${checkin.occurrence_date}`}>
                <div className="schedule-card-top">
                  <p className="schedule-plan-name">{checkin.title}</p>
                  <span className={submitted ? "status-pill" : "status-pill gold-pill"}>{submitted ? "Submitted" : "Due"}</span>
                </div>
                <p className="compact-help">{checkin.notes || `Coach check-in from ${checkin.coach_name}`}</p>
                <div className="today-checkin-grid">
                  <label>
                    Energy 1-5
                    <input inputMode="numeric" value={draft.energy} onChange={(event) => updateCheckinDraft(checkin.id, "energy", event.target.value)} />
                  </label>
                  <label>
                    Mood 1-5
                    <input inputMode="numeric" value={draft.mood} onChange={(event) => updateCheckinDraft(checkin.id, "mood", event.target.value)} />
                  </label>
                </div>
                <label>
                  Win
                  <textarea value={draft.win} onChange={(event) => updateCheckinDraft(checkin.id, "win", event.target.value)} placeholder="What went well?" />
                </label>
                <label>
                  Challenge
                  <textarea value={draft.challenge} onChange={(event) => updateCheckinDraft(checkin.id, "challenge", event.target.value)} placeholder="What felt hard?" />
                </label>
                <label>
                  Question for coach
                  <textarea value={draft.question} onChange={(event) => updateCheckinDraft(checkin.id, "question", event.target.value)} placeholder="Anything you want help with?" />
                </label>
                <label>
                  Extra notes
                  <textarea value={draft.notes} onChange={(event) => updateCheckinDraft(checkin.id, "notes", event.target.value)} placeholder="Optional" />
                </label>
                <button className="primary-action filled" onClick={() => submitCheckin(checkin)} type="button">
                  {submitted ? "Update Check-In" : "Submit Check-In"}
                </button>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="training-schedule-panel prototype-schedule-list">
        {scheduledWorkouts.length ? (
          <div className="assignment-card-list">
            {scheduledWorkouts.map((workout) => (
              <article className="schedule-session-card" key={`${workout.sourceKey}-${workout.id}`}>
                <div className="schedule-card-top">
                  <p className="schedule-plan-name">{workout.planName}</p>
                  <span className={workout.planSource === "assigned" ? "status-pill gold-pill" : "status-pill"}>
                    {workout.planSource === "assigned" ? "Coach" : "Mine"}
                  </span>
                </div>
                <div className="schedule-select-look">
                  {workout.planSource === "assigned" ? `Coach plan${workout.planCoachName ? ` - ${workout.planCoachName}` : ""}` : "My plan"} - {workout.planLabel}
                </div>
                <div className="schedule-session-main">
                  <h3>{workout.name}</h3>
                  <span>
                    {workout.summary || workout.workout_type || "Scheduled workout"}
                  </span>
                </div>
                <button className="primary-action filled schedule-start" onClick={() => startScheduledWorkout(workout)} type="button">
                  Start Session
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel empty-state compact-empty schedule-session-card">
            <p>No scheduled workouts for {selectedDay}.</p>
          </div>
        )}
      </div>
    </section>
  );
}
