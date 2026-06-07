import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TodayScreen({ onNavigate, role, user }) {
  const [assignedPlans, setAssignedPlans] = useState([]);
  const [coachLinks, setCoachLinks] = useState([]);
  const [selectedDay, setSelectedDay] = useState(
    new Date().toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)
  );
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");

  const scheduledWorkouts = useMemo(() => {
    return assignedPlans.flatMap((assignment) => {
      const plan = assignment.plan || {};
      return (plan.training_plan_workouts || [])
        .filter((workout) => {
          const days = Array.isArray(workout.scheduled_days) ? workout.scheduled_days : [];
          return days.includes(selectedDay);
        })
        .map((workout) => ({
          ...workout,
          planName: plan.name || "Coach plan",
          assignmentId: assignment.assignment_id
        }));
    });
  }, [assignedPlans, selectedDay]);

  const loadAssignments = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setAssignedPlans([]);
      setCoachLinks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const [coachResult, planResult] = await Promise.all([
      supabase.rpc("get_my_coach_status"),
      supabase.rpc("get_my_assigned_plans")
    ]);

    setLoading(false);

    if (coachResult.error) {
      setMessage(`${coachResult.error.message}. Run the latest supabase/phase-7-coach-client-links.sql in Supabase.`);
      setCoachLinks([]);
    } else {
      setCoachLinks(coachResult.data || []);
    }

    if (planResult.error) {
      setMessage(`${planResult.error.message}. Run supabase/phase-9-client-assignment-library.sql in Supabase.`);
      setAssignedPlans([]);
    } else {
      setAssignedPlans(planResult.data || []);
    }
  }, [user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadAssignments();
    });

    return () => {
      alive = false;
    };
  }, [loadAssignments]);

  if (role !== "client") {
    return (
      <section className="screen-stack today-screen">
        <div className="screen-heading">
          <p className="eyebrow">Today</p>
          <h1>Training schedule</h1>
          <p>Scheduled client workouts will appear here when this account is linked as a client.</p>
        </div>
        <div className="panel empty-state">
          <p>No client schedule for this account yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack today-screen">
      <div className="screen-heading">
        <p className="eyebrow">Today</p>
        <h1>Training schedule</h1>
        <p>Pick a day to see workouts scheduled by your coach.</p>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading assigned work...</p> : null}

      <div className="panel assignment-section coach-status-panel">
        <div className="section-row">
          <h2>Your coach</h2>
          <span className={coachLinks[0]?.status === "active" ? "status-pill active" : "status-pill"}>
            {coachLinks[0]?.status || "Not connected"}
          </span>
        </div>
        {coachLinks.length ? (
          <div className="assignment-card-list">
            {coachLinks.map((coach) => (
              <article className="assignment-card" key={coach.coach_id}>
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
          <p className="compact-help">No coach connected yet. Open an invite link from your coach to connect.</p>
        )}
      </div>

      <div className="panel assignment-section training-schedule-panel">
        <div className="section-row">
          <h2>Training schedule</h2>
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
              <article className="assignment-card schedule-workout-card" key={`${workout.assignmentId}-${workout.id}`}>
                <div>
                  <p className="eyebrow">{workout.planName}</p>
                  <h3>{workout.name}</h3>
                  <span>{workout.summary || workout.workout_type || "Scheduled workout"}</span>
                </div>
                <button className="primary-action compact filled" onClick={() => onNavigate?.("workouts")} type="button">
                  Start
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel empty-state compact-empty">
            <p>No scheduled workouts for {selectedDay}. Assigned workouts and plans live in their library tabs.</p>
            <div className="form-footer-actions">
              <button className="primary-action" onClick={() => onNavigate?.("plans")} type="button">
                Assigned Plans
              </button>
              <button className="primary-action filled" onClick={() => onNavigate?.("workouts")} type="button">
                Assigned Workouts
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
