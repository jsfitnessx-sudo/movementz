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

function planWeekNumberForDate(entry, dateKey) {
  if (!entry?.window?.start || !dateKey) return 1;
  const target = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(target.getTime())) return 1;
  const weekNumber = Math.floor((target.getTime() - entry.window.start.getTime()) / 604800000) + 1;
  return Math.min(Number(entry.plan?.block_weeks) || 4, Math.max(1, weekNumber));
}

function runningWorkoutWeek(workout) {
  if (workout?.workout_type !== "running") return null;
  const label = `${workout.name || ""} ${workout.summary || ""}`;
  const match = label.match(/\bWeek\s+(\d{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

function formatRunTimer(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getRunSplitUnit(workout) {
  const label = `${workout?.summary || ""} ${workout?.name || ""}`.toLowerCase();
  if (label.includes("/mi") || label.includes(" mi") || label.includes("mile")) return "mi";
  if (label.includes(" x ") || label.includes("interval")) return "rep";
  return "km";
}

function isWorkoutScheduledForDay(workout, entry, day, dateKey) {
  const days = Array.isArray(workout.scheduled_days) ? workout.scheduled_days : [];
  if (!days.includes(day)) return false;

  const runWeek = runningWorkoutWeek(workout);
  if (!runWeek) return true;

  return runWeek === planWeekNumberForDate(entry, dateKey);
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
  const [editingCheckins, setEditingCheckins] = useState(() => new Set());
  const [activeScheduleWorkout, setActiveScheduleWorkout] = useState(null);
  const [activeRunWorkout, setActiveRunWorkout] = useState(null);
  const [runTimer, setRunTimer] = useState({ elapsed: 0, running: false, splits: [] });
  const [expandedWorkoutKeys, setExpandedWorkoutKeys] = useState(() => new Set());
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
        .filter((workout) => isWorkoutScheduledForDay(workout, entry, selectedDay, selectedDate))
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
  }, [activePlans, selectedDate, selectedDay]);

  const dayCounts = useMemo(() => {
    return Object.fromEntries(
      weekdays.map((day) => [
        day,
        activePlans.reduce((count, entry) => {
          const workouts = entry.plan.training_plan_workouts || [];
          return count + workouts.filter((workout) => isWorkoutScheduledForDay(workout, entry, day, dateForWeekday(day))).length;
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
      const ownPlanData = ownPlanResult.data || [];
      const templateIds = [
        ...new Set(
          ownPlanData.flatMap((plan) =>
            (plan.training_plan_workouts || []).map((workout) => workout.workout_template_id).filter(Boolean)
          )
        )
      ];
      let exercisesByTemplateId = new Map();

      if (templateIds.length) {
        const { data: templateRows, error: templateError } = await supabase
          .from("workout_templates")
          .select("id,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,target_type,target_value)")
          .in("id", templateIds);

        if (!templateError) {
          exercisesByTemplateId = new Map(
            (templateRows || []).map((template) => [
              template.id,
              (template.workout_template_exercises || []).sort((a, b) => (a.position || 0) - (b.position || 0))
            ])
          );
        }
      }

      setOwnPlans(
        ownPlanData.map((plan) => ({
          ...plan,
          training_plan_workouts: (plan.training_plan_workouts || [])
            .map((workout) => ({
              ...workout,
              exercises: exercisesByTemplateId.get(workout.workout_template_id) || []
            }))
            .sort((a, b) => a.position - b.position)
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
            if (next[checkin.id] && !checkin.response_id) continue;
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

  useEffect(() => {
    if (!activeRunWorkout || !runTimer.running) return undefined;
    const timer = window.setInterval(() => {
      setRunTimer((current) => ({ ...current, elapsed: current.elapsed + 1 }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRunWorkout, runTimer.running]);

  function startScheduledWorkout(workout) {
    if (!workout.workout_template_id) {
      if (workout.workout_type === "running") {
        startRunWorkout(workout);
        return;
      }
      setMessage(
        "This scheduled workout is missing its source workout. Re-import it into the plan."
      );
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

  function startRunWorkout(workout) {
    setMessage("");
    setActiveRunWorkout(workout);
    setRunTimer({ elapsed: 0, running: false, splits: [] });
  }

  function toggleRunTimer() {
    setRunTimer((current) => ({ ...current, running: !current.running }));
  }

  function recordRunSplit() {
    setRunTimer((current) => {
      const previousElapsed = current.splits.length ? current.splits[current.splits.length - 1].elapsed : 0;
      const split = {
        id: `split-${current.splits.length + 1}-${current.elapsed}`,
        label: `${getRunSplitUnit(activeRunWorkout).toUpperCase()} ${current.splits.length + 1}`,
        elapsed: current.elapsed,
        duration: Math.max(0, current.elapsed - previousElapsed)
      };
      return { ...current, splits: [...current.splits, split] };
    });
  }

  function resetRunTimer() {
    setRunTimer({ elapsed: 0, running: false, splits: [] });
  }

  function closeRunTimer() {
    setActiveRunWorkout(null);
    setRunTimer({ elapsed: 0, running: false, splits: [] });
  }

  function getScheduledWorkoutExercises(workout) {
    const directExercises = Array.isArray(workout.exercises) ? workout.exercises : [];
    if (directExercises.length) return directExercises;
    return [];
  }

  function formatScheduledExerciseTarget(exercise, workoutType = "strength") {
    if (workoutType === "hiit") {
      const target = exercise.target_value ? `${exercise.target_value} ${exercise.target_type || "reps"}` : "HIIT station";
      return target;
    }
    const sets = Number(exercise.sets) || 1;
    const repMin = exercise.rep_min || "";
    const repMax = exercise.rep_max || "";
    const reps = repMin && repMax ? `${repMin}-${repMax}` : repMin || repMax || "reps";
    return `${sets} sets x ${reps} reps`;
  }

  function toggleWorkoutDetails(workoutKey) {
    setExpandedWorkoutKeys((current) => {
      const next = new Set(current);
      if (next.has(workoutKey)) {
        next.delete(workoutKey);
      } else {
        next.add(workoutKey);
      }
      return next;
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
    setEditingCheckins((current) => {
      const next = new Set(current);
      next.delete(checkin.id);
      return next;
    });
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

  if (activeRunWorkout) {
    const splitUnit = getRunSplitUnit(activeRunWorkout);

    return (
      <section className="screen-stack today-screen run-timer-screen">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Run timer</p>
            <h1>{activeRunWorkout.name}</h1>
            <p>{activeRunWorkout.planName} - {activeRunWorkout.planLabel}</p>
          </div>
          <button className="primary-action compact" onClick={closeRunTimer} type="button">
            Close
          </button>
        </div>

        <div className="run-target-panel">
          <div>
            <p className="eyebrow">Target</p>
            <h2>{activeRunWorkout.summary || "Scheduled run"}</h2>
          </div>
          <span className="status-pill">{splitUnit === "rep" ? "Rep splits" : `${splitUnit.toUpperCase()} splits`}</span>
        </div>

        <div className="run-timer-panel">
          <span>{runTimer.running ? "Running" : runTimer.elapsed ? "Paused" : "Ready"}</span>
          <strong>{formatRunTimer(runTimer.elapsed)}</strong>
          <div className="run-timer-actions">
            <button className="primary-action filled" onClick={toggleRunTimer} type="button">
              {runTimer.running ? "Pause" : runTimer.elapsed ? "Resume" : "Start"}
            </button>
            <button className="primary-action" disabled={!runTimer.elapsed} onClick={recordRunSplit} type="button">
              Record {splitUnit === "rep" ? "Rep" : splitUnit.toUpperCase()} Split
            </button>
            <button className="primary-action" disabled={!runTimer.elapsed && !runTimer.splits.length} onClick={resetRunTimer} type="button">
              Reset
            </button>
          </div>
        </div>

        <div className="run-split-panel">
          <div className="section-row">
            <h2>Splits</h2>
            <span className="status-pill">{runTimer.splits.length}</span>
          </div>
          {runTimer.splits.length ? (
            <div className="run-split-list">
              {runTimer.splits.map((split) => (
                <div key={split.id}>
                  <span>{split.label}</span>
                  <strong>{formatRunTimer(split.duration)}</strong>
                  <em>Total {formatRunTimer(split.elapsed)}</em>
                </div>
              ))}
            </div>
          ) : (
            <p className="compact-help">Tap Record Split at each {splitUnit === "rep" ? "rep" : splitUnit} marker.</p>
          )}
        </div>

        <div className="form-footer-actions">
          <button className="primary-action" onClick={closeRunTimer} type="button">
            Finish Run
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack today-screen">
      <div className="screen-heading today-heading">
        <p className="eyebrow">Today</p>
        <h1>Training schedule</h1>
        <p>{formatTodayDate()}</p>
      </div>

      {message ? <p className={message.includes("submitted") ? "form-message success" : "form-message error"}>{message}</p> : null}
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
            const editing = editingCheckins.has(checkin.id);
            const showForm = !submitted || editing;
            return (
              <article className={submitted ? "today-checkin-card submitted" : "today-checkin-card"} key={`${checkin.id}-${checkin.occurrence_date}`}>
                <div className="schedule-card-top">
                  <p className="schedule-plan-name">{checkin.title}</p>
                  <span className={submitted ? "status-pill" : "status-pill gold-pill"}>{submitted ? "Submitted" : "Due"}</span>
                </div>
                <p className="compact-help">{checkin.notes || `Coach check-in from ${checkin.coach_name}`}</p>
                {submitted && !showForm ? (
                  <>
                    <div className="today-checkin-summary">
                      <span>Energy <strong>{draft.energy || "-"}/5</strong></span>
                      <span>Mood <strong>{draft.mood || "-"}/5</strong></span>
                    </div>
                    {draft.win ? <p className="today-checkin-answer"><strong>Win</strong>{draft.win}</p> : null}
                    {draft.challenge ? <p className="today-checkin-answer"><strong>Challenge</strong>{draft.challenge}</p> : null}
                    {draft.question ? <p className="today-checkin-answer"><strong>Question</strong>{draft.question}</p> : null}
                    {draft.notes ? <p className="today-checkin-answer"><strong>Notes</strong>{draft.notes}</p> : null}
                    <button className="primary-action" onClick={() => setEditingCheckins((current) => new Set(current).add(checkin.id))} type="button">
                      Edit Check-In
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="training-schedule-panel prototype-schedule-list">
        <div className="today-section-title">
          <div>
            <p className="eyebrow">Scheduled work</p>
            <h2>{selectedDay}</h2>
          </div>
          <span>{scheduledWorkouts.length}</span>
        </div>
        {scheduledWorkouts.length ? (
          <div className="assignment-card-list">
            {scheduledWorkouts.map((workout) => {
              const workoutKey = `${workout.sourceKey}-${workout.id}`;
              const exercises = getScheduledWorkoutExercises(workout).sort((a, b) => (a.position || 0) - (b.position || 0));
              const detailsOpen = expandedWorkoutKeys.has(workoutKey);
              const visibleExercises = detailsOpen ? exercises : exercises.slice(0, 4);

              return (
              <article className="schedule-session-card" key={workoutKey}>
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
                {exercises.length ? (
                  <div className="schedule-exercise-preview">
                    {visibleExercises.map((exercise) => (
                      <div key={exercise.id || `${workoutKey}-${exercise.position}`}>
                        <strong>{exercise.exercise_name}</strong>
                        <span>{formatScheduledExerciseTarget(exercise, workout.workout_type)}</span>
                      </div>
                    ))}
                    {exercises.length > 4 ? (
                      <button className="text-link" onClick={() => toggleWorkoutDetails(workoutKey)} type="button">
                        {detailsOpen ? "Hide details" : `Details +${exercises.length - 4}`}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {workout.workout_template_id ? (
                  <button className="primary-action filled schedule-start" onClick={() => startScheduledWorkout(workout)} type="button">
                    Start Session
                  </button>
                ) : workout.workout_type === "running" ? (
                  <button className="primary-action filled schedule-start" onClick={() => startRunWorkout(workout)} type="button">
                    Start Run
                  </button>
                ) : (
                  <button className="primary-action filled schedule-start" onClick={() => startScheduledWorkout(workout)} type="button">
                    Start Session
                  </button>
                )}
              </article>
              );
            })}
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
