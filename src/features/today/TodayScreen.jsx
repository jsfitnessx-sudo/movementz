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
  const { end, status } = getPlanWindow(plan, assignedAt);
  if (!end) return "No timeframe";
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  return status === "active" ? `Week block - ${daysLeft} days left` : "Archived";
}

function normalisePlan(assignment, source) {
  const plan = source === "assigned" ? assignment.plan || {} : assignment;
  const window = getPlanWindow(plan, assignment.assigned_at);

  return {
    assignmentId: assignment.assignment_id || plan.id,
    assignedAt: assignment.assigned_at || plan.created_at,
    plan,
    source,
    window
  };
}

export function TodayScreen({ role, user }) {
  const [ownPlans, setOwnPlans] = useState([]);
  const [assignedPlans, setAssignedPlans] = useState([]);
  const [coachLinks, setCoachLinks] = useState([]);
  const [activeScheduleWorkout, setActiveScheduleWorkout] = useState(null);
  const [selectedDay, setSelectedDay] = useState(
    new Date().toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");
  const startCounterRef = useRef(0);

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

  const archivedPlans = useMemo(
    () => schedulePlans.filter((entry) => entry.window.status === "archived" || entry.plan.status === "archived"),
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
          planSource: entry.source,
          planWindow: entry.window,
          sourceKey: `${entry.source}-${entry.assignmentId}`
        }));
    });
  }, [activePlans, selectedDay]);

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
      requests.push(supabase.rpc("get_my_assigned_plans"), supabase.rpc("get_my_coach_status"));
    }

    const [ownPlanResult, assignedPlanResult, coachResult] = await Promise.all(requests);

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
    } else {
      setAssignedPlans([]);
      setCoachLinks([]);
    }
  }, [role, user.id]);

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
      <div className="screen-heading">
        <p className="eyebrow">Today</p>
        <h1>Training schedule</h1>
        <p>Own plans and coach plans appear by scheduled day while the block is active.</p>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading schedule...</p> : null}

      {role === "client" ? (
        <div className="panel assignment-section coach-status-panel compact-panel">
          <div className="section-row">
            <h2>Your coach</h2>
            <span className={coachLinks[0]?.status === "active" ? "status-pill active" : "status-pill"}>
              {coachLinks[0]?.status || "Not connected"}
            </span>
          </div>
          {coachLinks.length ? (
            <div className="assignment-card-list">
              {coachLinks.map((coach) => (
                <article className="assignment-card compact-card" key={coach.coach_id}>
                  <div>
                    <p className="eyebrow">Coach</p>
                    <h3>{coach.coach_name}</h3>
                    <span>{coach.coach_email}</span>
                  </div>
                  <span className="status-pill active">Confirmed</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="compact-help">No coach connected yet.</p>
          )}
        </div>
      ) : null}

      <div className="panel assignment-section training-schedule-panel">
        <div className="section-row">
          <div>
            <h2>Schedule</h2>
            <p className="compact-help">
              {activePlans.length} active plan{activePlans.length === 1 ? "" : "s"}
              {archivedPlans.length ? ` - ${archivedPlans.length} archived` : ""}
            </p>
          </div>
          <span className="status-pill">{scheduledWorkouts.length}</span>
        </div>
        <div className="schedule-day-tabs" role="tablist" aria-label="Training days">
          {weekdays.map((day) => (
            <button
              className={selectedDay === day ? "active" : ""}
              key={day}
              onClick={() => setSelectedDay(day)}
              type="button"
            >
              {day}
            </button>
          ))}
        </div>
        {scheduledWorkouts.length ? (
          <div className="assignment-card-list">
            {scheduledWorkouts.map((workout) => (
              <article className="assignment-card schedule-workout-card" key={`${workout.sourceKey}-${workout.id}`}>
                <div>
                  <p className="eyebrow">{workout.planSource === "assigned" ? "Coach plan" : "My plan"}</p>
                  <h3>{workout.name}</h3>
                  <span>
                    {workout.planName} - {workout.summary || workout.workout_type || "Scheduled workout"}
                  </span>
                  <em>{workout.planLabel}</em>
                </div>
                <button className="primary-action compact filled" onClick={() => startScheduledWorkout(workout)} type="button">
                  Start
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel empty-state compact-empty">
            <p>No scheduled workouts for {selectedDay}.</p>
          </div>
        )}
      </div>
    </section>
  );
}
