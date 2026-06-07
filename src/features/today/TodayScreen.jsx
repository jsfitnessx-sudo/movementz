import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

function workoutSummary(template) {
  const count = template?.workout_template_exercises?.length || 0;
  if (template?.workout_type === "hiit") {
    const type = template.hiit_timer_type === "for_time" ? "For Time" : template.hiit_timer_type === "tabata" ? "Tabata" : "Interval";
    return `${count} exercises - ${type}`;
  }
  return `${count} exercises`;
}

function planSummary(plan) {
  const count = plan?.training_plan_workouts?.length || 0;
  if (plan?.plan_type === "block") return `${plan.block_weeks || 4} week block - ${count} workouts`;
  return `No timeframe - ${count} workouts`;
}

export function TodayScreen({ role, user }) {
  const [assignedWorkouts, setAssignedWorkouts] = useState([]);
  const [assignedPlans, setAssignedPlans] = useState([]);
  const [coachLinks, setCoachLinks] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");

  const loadAssignments = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setAssignedWorkouts([]);
      setAssignedPlans([]);
      setCoachLinks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const [coachResult, workoutResult, planResult] = await Promise.all([
      supabase.rpc("get_my_coach_status"),
      supabase
        .from("coach_workout_assignments")
        .select(
          "id,status,assigned_at,coach_id,workout_templates(id,name,notes,workout_type,hiit_timer_type,hiit_rounds,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,target_type,target_value))"
        )
        .eq("client_id", user.id)
        .eq("status", "active")
        .order("assigned_at", { ascending: false })
        .limit(20),
      supabase
        .from("training_plan_assignments")
        .select(
          "id,status,created_at,training_plans(id,name,plan_type,block_weeks,instructions,training_plan_workouts(id,position,name,workout_type,summary,scheduled_days))"
        )
        .eq("client_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    setLoading(false);

    if (coachResult.error) {
      setMessage(`${coachResult.error.message}. Run the latest supabase/phase-7-coach-client-links.sql in Supabase.`);
      setCoachLinks([]);
    } else {
      setCoachLinks(coachResult.data || []);
    }

    if (workoutResult.error) {
      setMessage(`${workoutResult.error.message}. Run supabase/phase-8-workout-assignments.sql in Supabase.`);
      setAssignedWorkouts([]);
    } else {
      setAssignedWorkouts(workoutResult.data || []);
    }

    if (planResult.error) {
      setMessage(`${planResult.error.message}. Run supabase/phase-6-training-plans.sql in Supabase.`);
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
          <h1>Today</h1>
          <p>Assigned coach work appears here when this account is linked as a client.</p>
        </div>
        <div className="panel empty-state">
          <p>No client assignments for this account yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack today-screen">
      <div className="screen-heading">
        <p className="eyebrow">Today</p>
        <h1>Assigned work</h1>
        <p>Workouts and plans from your coach appear here.</p>
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

      <div className="panel assignment-section">
        <div className="section-row">
          <h2>Workouts</h2>
          <span className="status-pill">{assignedWorkouts.length}</span>
        </div>
        {assignedWorkouts.length ? (
          <div className="assignment-card-list">
            {assignedWorkouts.map((assignment) => {
              const workout = assignment.workout_templates;
              return (
                <article className="assignment-card" key={assignment.id}>
                  <div>
                    <p className="eyebrow">{workout?.workout_type || "Workout"}</p>
                    <h3>{workout?.name || "Assigned workout"}</h3>
                    <span>{workoutSummary(workout)}</span>
                  </div>
                  <span className="status-pill active">Assigned</span>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="compact-help">No direct workouts assigned yet.</p>
        )}
      </div>

      <div className="panel assignment-section">
        <div className="section-row">
          <h2>Plans</h2>
          <span className="status-pill">{assignedPlans.length}</span>
        </div>
        {assignedPlans.length ? (
          <div className="assignment-card-list">
            {assignedPlans.map((assignment) => {
              const plan = assignment.training_plans;
              return (
                <article className="assignment-card" key={assignment.id}>
                  <div>
                    <p className="eyebrow">Plan</p>
                    <h3>{plan?.name || "Assigned plan"}</h3>
                    <span>{planSummary(plan)}</span>
                  </div>
                  <span className="status-pill active">Active</span>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="compact-help">No plans assigned yet.</p>
        )}
      </div>
    </section>
  );
}
