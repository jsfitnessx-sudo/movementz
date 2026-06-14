import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";
import { WorkoutLibraryScreen } from "../workouts/WorkoutLibraryScreen.jsx";

const blockPeriods = [4, 6, 8, 10, 12, 16];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const recoverablePlanModes = new Set(["builder", "workout-builder", "plan-workout-session"]);

function readPlanRecoveryState(key) {
  if (!key || typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writePlanRecoveryState(key, value) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort local recovery only.
  }
}

function clearPlanRecoveryState(key) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function createBuilder() {
  return {
    name: "",
    planType: "block",
    blockWeeks: 4,
    step: 1,
    scheduleEnabled: false,
    workouts: [],
    selectedClientIds: [],
    instructions: ""
  };
}

function workoutSummary(workout) {
  const count = workout.workout_template_exercises?.length || workout.exercise_count || 0;
  if (workout.workout_type === "hiit") {
    const timer = workout.hiit_timer_type === "for_time" ? "For Time" : workout.hiit_timer_type === "tabata" ? "Tabata" : "Interval";
    return `${count} stations - ${timer}`;
  }
  return `${count} exercises`;
}

function formatPlanType(plan) {
  if (plan.plan_type === "no_plan") return "No timeframe";
  return `${plan.block_weeks || 4} week block`;
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function getPlanWindow(plan) {
  if (plan.plan_type === "no_plan") {
    return {
      dateRange: "No timeframe",
      daysLeft: null,
      progress: 0,
      weekLabel: "Plan only"
    };
  }

  const createdAt = plan.created_at ? new Date(plan.created_at) : new Date();
  const totalDays = Math.max(1, (plan.block_weeks || 4) * 7);
  const endAt = new Date(createdAt);
  endAt.setDate(endAt.getDate() + totalDays);

  const now = new Date();
  const daysElapsed = Math.max(0, Math.floor((now - createdAt) / 86400000));
  const daysLeft = Math.max(0, Math.ceil((endAt - now) / 86400000));
  const weekNumber = Math.min(plan.block_weeks || 4, Math.max(1, Math.floor(daysElapsed / 7) + 1));

  return {
    dateRange: `${formatShortDate(createdAt)} -> ${formatShortDate(endAt)}`,
    daysLeft,
    progress: Math.min(100, Math.max(8, (daysElapsed / totalDays) * 100)),
    weekLabel: `Week ${weekNumber} of ${plan.block_weeks || 4}`
  };
}

function formatPlanExerciseTarget(exercise, workoutType = "strength") {
  if (workoutType === "hiit") {
    const targetValue = exercise.target_value || exercise.rep_min || 0;
    const targetType = exercise.target_type || "reps";
    return `${targetValue} ${targetType}`;
  }

  return `${exercise.sets || 0} sets${exercise.rep_min || exercise.rep_max ? ` x ${exercise.rep_min || "?"}-${exercise.rep_max || "?"} reps` : ""}`;
}

export function PlansScreen({ role = "normal_user", user }) {
  const [plans, setPlans] = useState([]);
  const [archivedPlans, setArchivedPlans] = useState([]);
  const [assignedPlans, setAssignedPlans] = useState([]);
  const [planLibraryView, setPlanLibraryView] = useState("library");
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);
  const [expandedAssignedPlanIds, setExpandedAssignedPlanIds] = useState(new Set());
  const [workoutLibrary, setWorkoutLibrary] = useState([]);
  const [clients, setClients] = useState([]);
  const [builder, setBuilder] = useState(createBuilder);
  const [mode, setMode] = useState("list");
  const [showImport, setShowImport] = useState(false);
  const [openPlanMenu, setOpenPlanMenu] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [activePlanWorkout, setActivePlanWorkout] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const planStartCounterRef = useRef(0);
  const recoveryHydratedRef = useRef(false);
  const recoveryKey = useMemo(
    () => user?.id ? `movementz:plan-recovery:${user.id}` : "",
    [user?.id]
  );

  const importedWorkoutIds = useMemo(
    () => new Set(builder.workouts.map((workout) => workout.workout_template_id).filter(Boolean)),
    [builder.workouts]
  );

  const loadPlans = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setPlans([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("training_plans")
      .select("id,name,status,plan_type,block_weeks,created_at,training_plan_workouts(id),training_plan_assignments(id)")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(30);

    setLoading(false);
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-6-training-plans.sql in Supabase first.`);
      setPlans([]);
      return;
    }

    setPlans(data || []);
  }, [user.id]);

  const loadArchivedPlans = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setArchivedPlans([]);
      return;
    }

    const { data, error } = await supabase
      .from("training_plans")
      .select("id,name,status,plan_type,block_weeks,created_at,archived_at,training_plan_workouts(id),training_plan_assignments(id)")
      .eq("owner_id", user.id)
      .eq("status", "archived")
      .order("archived_at", { ascending: false })
      .limit(30);

    if (!error) setArchivedPlans(data || []);
  }, [user.id]);

  const loadWorkoutLibrary = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setWorkoutLibrary([]);
      return;
    }

    const { data, error } = await supabase
      .from("workout_templates")
      .select("id,name,status,workout_type,hiit_timer_type,hiit_rounds,created_at,workout_template_exercises(id)")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(80);

    if (!error) setWorkoutLibrary(data || []);
  }, [user.id]);

  const loadClients = useCallback(async () => {
    if (role !== "coach" || !supabase || user.id === "demo-user") {
      setClients([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_coach_clients");

    if (error) {
      setClients([]);
      return;
    }

    setClients(
      (data || []).filter((link) => link.status === "active").map((link) => ({
        id: link.client_id,
        name: link.client_name || link.client_email || "Client"
      }))
    );
  }, [role, user.id]);

  const loadAssignedPlans = useCallback(async () => {
    if (role !== "client" || !supabase || user.id === "demo-user") {
      setAssignedPlans([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_assigned_plans");

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-9-client-assignment-library.sql in Supabase.`);
      setAssignedPlans([]);
      return;
    }

    setAssignedPlans(data || []);
  }, [role, user.id]);

  useEffect(() => {
    const recovered = readPlanRecoveryState(recoveryKey);
    if (recovered?.mode && recoverablePlanModes.has(recovered.mode)) {
      Promise.resolve().then(() => {
        setBuilder(recovered.builder || createBuilder());
        setEditingPlanId(recovered.editingPlanId || null);
        setShowImport(Boolean(recovered.showImport));
        setActivePlanWorkout(recovered.activePlanWorkout || null);
        setSelectedPlan(recovered.selectedPlan || null);
        setMode(recovered.mode);
        setMessage("Restored your unfinished plan.");
      });
    }
    recoveryHydratedRef.current = true;
  }, [recoveryKey]);

  useEffect(() => {
    if (!recoveryHydratedRef.current || !recoveryKey) return;

    if (!recoverablePlanModes.has(mode)) {
      clearPlanRecoveryState(recoveryKey);
      return;
    }

    writePlanRecoveryState(recoveryKey, {
      version: 1,
      updatedAt: new Date().toISOString(),
      mode,
      builder,
      editingPlanId,
      showImport,
      activePlanWorkout,
      selectedPlan
    });
  }, [activePlanWorkout, builder, editingPlanId, mode, recoveryKey, selectedPlan, showImport]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (!alive) return;
      loadPlans();
      loadArchivedPlans();
      loadWorkoutLibrary();
      loadClients();
      loadAssignedPlans();
    });

    return () => {
      alive = false;
    };
  }, [loadArchivedPlans, loadAssignedPlans, loadClients, loadPlans, loadWorkoutLibrary]);

  function startBuilder() {
    setBuilder(createBuilder());
    setEditingPlanId(null);
    setShowImport(false);
    setMessage("");
    setMode("builder");
  }

  async function fetchPlanDetail(plan) {
    if (!supabase || user.id === "demo-user") {
      return {
        ...plan,
        instructions: plan.instructions || "",
        training_plan_workouts: plan.training_plan_workouts || [],
        training_plan_assignments: plan.training_plan_assignments || []
      };
    }

    setLoadingDetail(true);
    const { data, error } = await supabase
      .from("training_plans")
      .select(
        "id,name,plan_type,block_weeks,instructions,created_at,training_plan_workouts(id,workout_template_id,position,name,workout_type,source_type,summary,scheduled_days),training_plan_assignments(id,client_id,profiles!training_plan_assignments_client_id_fkey(id,full_name,email))"
      )
      .eq("owner_id", user.id)
      .eq("id", plan.id)
      .single();
    setLoadingDetail(false);

    if (error) {
      throw error;
    }

    return {
      ...data,
      training_plan_workouts: (data.training_plan_workouts || []).sort((a, b) => a.position - b.position),
      training_plan_assignments: data.training_plan_assignments || []
    };
  }

  function planToBuilder(plan, overrides = {}) {
    const workouts = (plan.training_plan_workouts || []).map((workout) => ({
      id: `plan-${workout.id}`,
      plan_workout_id: workout.id,
      workout_template_id: workout.workout_template_id,
      name: workout.name,
      workout_type: workout.workout_type,
      source_type: workout.source_type || "imported",
      summary: workout.summary,
      scheduled_days: workout.scheduled_days || []
    }));

    return {
      name: plan.name || "",
      planType: plan.plan_type || "block",
      blockWeeks: plan.block_weeks || 4,
      step: 2,
      scheduleEnabled: workouts.some((workout) => workout.scheduled_days.length),
      workouts,
      selectedClientIds: (plan.training_plan_assignments || [])
        .map((assignment) => (typeof assignment === "string" ? assignment : assignment.client_id))
        .filter(Boolean),
      instructions: plan.instructions || "",
      ...overrides
    };
  }

  async function openPlanDetails(plan) {
    setOpenPlanMenu(null);
    setMessage("");

    try {
      const detail = await fetchPlanDetail(plan);
      setSelectedPlan(detail);
      setMode("detail");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function editPlan(plan) {
    setOpenPlanMenu(null);
    setMessage("");

    try {
      const detail = await fetchPlanDetail(plan);
      setBuilder(planToBuilder(detail));
      setEditingPlanId(detail.id);
      setShowImport(false);
      setSelectedPlan(null);
      setMode("builder");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function assignPlan(plan) {
    setOpenPlanMenu(null);
    setMessage("");

    try {
      const detail = await fetchPlanDetail(plan);
      setBuilder(planToBuilder(detail));
      setEditingPlanId(detail.id);
      setShowImport(false);
      setSelectedPlan(null);
      setMode("builder");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function duplicatePlan(plan) {
    setOpenPlanMenu(null);
    setMessage("");

    try {
      const detail = await fetchPlanDetail(plan);
      setBuilder(
        planToBuilder(detail, {
          name: `${detail.name} Copy`,
          selectedClientIds: []
        })
      );
      setEditingPlanId(null);
      setShowImport(false);
      setSelectedPlan(null);
      setMode("builder");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deletePlan(planId) {
    setOpenPlanMenu(null);

    if (!window.confirm("Delete this plan?")) return;

    if (!supabase || user.id === "demo-user") {
      setPlans((current) => current.filter((plan) => plan.id !== planId));
      setArchivedPlans((current) => current.filter((plan) => plan.id !== planId));
      return;
    }

    const { error } = await supabase.from("training_plans").delete().eq("owner_id", user.id).eq("id", planId);
    if (error) {
      setMessage(error.message);
      return;
    }

    setPlans((current) => current.filter((plan) => plan.id !== planId));
    setArchivedPlans((current) => current.filter((plan) => plan.id !== planId));
  }

  async function archivePlan(planId) {
    setOpenPlanMenu(null);
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setPlans((current) => current.filter((plan) => plan.id !== planId));
      return;
    }

    const { error } = await supabase
      .from("training_plans")
      .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("owner_id", user.id)
      .eq("id", planId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlans((current) => current.filter((plan) => plan.id !== planId));
    await loadArchivedPlans();
  }

  async function restorePlan(planId) {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      const restoredPlan = archivedPlans.find((plan) => plan.id === planId);
      setArchivedPlans((current) => current.filter((plan) => plan.id !== planId));
      if (restoredPlan) setPlans((current) => [{ ...restoredPlan, status: "active", archived_at: null }, ...current]);
      return;
    }

    const { error } = await supabase
      .from("training_plans")
      .update({ status: "active", archived_at: null, updated_at: new Date().toISOString() })
      .eq("owner_id", user.id)
      .eq("id", planId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await Promise.all([loadPlans(), loadArchivedPlans()]);
  }

  function continueBuilder() {
    if (!builder.name.trim()) {
      setMessage("Add a plan name first.");
      return;
    }

    setMessage("");
    setBuilder((current) => ({ ...current, step: 2 }));
  }

  function addImportedWorkout(workout) {
    if (importedWorkoutIds.has(workout.id)) return;

    setBuilder((current) => ({
      ...current,
      workouts: [
        ...current.workouts,
        {
          id: `import-${workout.id}`,
          workout_template_id: workout.id,
          name: workout.name,
          workout_type: workout.workout_type,
          source_type: "imported",
          summary: workoutSummary(workout),
          scheduled_days: []
        }
      ]
    }));
  }

  async function addCreatedWorkoutToPlan(workout) {
    setBuilder((current) => ({
      ...current,
      workouts: [
        ...current.workouts,
        {
          id: `created-${workout.id}`,
          workout_template_id: workout.id,
          name: workout.name,
          workout_type: workout.workout_type,
          source_type: "imported",
          summary: workoutSummary(workout),
          scheduled_days: []
        }
      ]
    }));
    await loadWorkoutLibrary();
    setMessage("");
    setMode("builder");
  }

  function removePlanWorkout(id) {
    setBuilder((current) => ({
      ...current,
      workouts: current.workouts.filter((workout) => workout.id !== id)
    }));
  }

  function toggleWorkoutDay(id, day) {
    setBuilder((current) => ({
      ...current,
      workouts: current.workouts.map((workout) => {
        if (workout.id !== id) return workout;
        const days = new Set(workout.scheduled_days || []);
        if (days.has(day)) days.delete(day);
        else days.add(day);
        return { ...workout, scheduled_days: weekdays.filter((weekday) => days.has(weekday)) };
      })
    }));
  }

  function toggleClient(clientId) {
    setBuilder((current) => {
      const ids = new Set(current.selectedClientIds);
      if (ids.has(clientId)) ids.delete(clientId);
      else ids.add(clientId);
      return { ...current, selectedClientIds: Array.from(ids) };
    });
  }

  function toggleAssignedPlan(planId) {
    setExpandedAssignedPlanIds((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  function startPlanWorkout(workout, options = {}) {
    if (!workout.workout_template_id) {
      setMessage("This plan workout is missing its source workout. Re-import it from the workout library.");
      return;
    }

    planStartCounterRef.current += 1;
    setMessage("");
    setActivePlanWorkout({
      id: workout.workout_template_id,
      name: workout.name,
      workout_type: workout.workout_type,
      isAssignedPlanWorkout: Boolean(options.assigned),
      autoStartKey: `${options.planId || "plan"}-${workout.id || workout.workout_template_id}-${planStartCounterRef.current}`
    });
    setMode("plan-workout-session");
  }

  async function savePlan() {
    if (!builder.name.trim()) {
      setMessage("Add a plan name first.");
      return;
    }

    if (!supabase || user.id === "demo-user") {
      setPlans((current) => {
        const savedPlan = {
          id: editingPlanId || `demo-plan-${Date.now()}`,
          name: builder.name.trim(),
          plan_type: builder.planType,
          block_weeks: builder.planType === "block" ? builder.blockWeeks : null,
          training_plan_workouts: builder.workouts,
          training_plan_assignments: role === "coach" ? builder.selectedClientIds : []
        };

        if (editingPlanId) {
          return current.map((plan) => (plan.id === editingPlanId ? savedPlan : plan));
        }

        return [savedPlan, ...current];
      });
      setEditingPlanId(null);
      setMode("list");
      return;
    }

    setSaving(true);
    setMessage("");

    const planPayload = {
      owner_id: user.id,
      name: builder.name.trim(),
      plan_type: builder.planType,
      block_weeks: builder.planType === "block" ? builder.blockWeeks : null,
      instructions: role === "coach" ? builder.instructions || null : null
    };
    let planId = editingPlanId;

    if (editingPlanId) {
      const { error: updateError } = await supabase
        .from("training_plans")
        .update({
          name: planPayload.name,
          plan_type: planPayload.plan_type,
          block_weeks: planPayload.block_weeks,
          instructions: planPayload.instructions,
          updated_at: new Date().toISOString()
        })
        .eq("owner_id", user.id)
        .eq("id", editingPlanId);

      if (updateError) {
        setMessage(`${updateError.message}. Run supabase/phase-6-training-plans.sql in Supabase first.`);
        setSaving(false);
        return;
      }

      const { error: workoutDeleteError } = await supabase.from("training_plan_workouts").delete().eq("plan_id", editingPlanId);
      if (workoutDeleteError) {
        setMessage(workoutDeleteError.message);
        setSaving(false);
        return;
      }

      const { error: assignmentDeleteError } = await supabase.from("training_plan_assignments").delete().eq("plan_id", editingPlanId);
      if (assignmentDeleteError) {
        setMessage(assignmentDeleteError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: plan, error: planError } = await supabase.from("training_plans").insert(planPayload).select("id").single();

      if (planError) {
        setMessage(`${planError.message}. Run supabase/phase-6-training-plans.sql in Supabase first.`);
        setSaving(false);
        return;
      }

      planId = plan.id;
    }

    if (builder.workouts.length && planId) {
      const { error: workoutError } = await supabase.from("training_plan_workouts").insert(
        builder.workouts.map((workout, index) => ({
          plan_id: planId,
          workout_template_id: workout.workout_template_id,
          position: index + 1,
          name: workout.name,
          workout_type: workout.workout_type,
          source_type: workout.source_type || "imported",
          summary: workout.summary,
          scheduled_days: builder.scheduleEnabled ? workout.scheduled_days || [] : []
        }))
      );

      if (workoutError) {
        setMessage(workoutError.message);
        setSaving(false);
        return;
      }
    }

    if (role === "coach" && builder.selectedClientIds.length && planId) {
      const { error: assignmentError } = await supabase.from("training_plan_assignments").insert(
        builder.selectedClientIds.map((clientId) => ({
          plan_id: planId,
          client_id: clientId,
          assigned_by: user.id
        }))
      );

      if (assignmentError) {
        setMessage(assignmentError.message);
        setSaving(false);
        return;
      }
    }

    await loadPlans();
    setSaving(false);
    setEditingPlanId(null);
    setMode("list");
  }

  function closeBuilder() {
    setBuilder(createBuilder());
    setEditingPlanId(null);
    setShowImport(false);
    setMessage("");
    setMode("list");
  }

  if (mode === "workout-builder") {
    return (
      <WorkoutLibraryScreen
        embedded
        initialMode="setup"
        onClose={() => setMode("builder")}
        onWorkoutSaved={addCreatedWorkoutToPlan}
        user={user}
      />
    );
  }

  if (mode === "plan-workout-session" && activePlanWorkout) {
    return (
      <WorkoutLibraryScreen
        autoStartWorkout={activePlanWorkout}
        embedded
        onClose={() => {
          setActivePlanWorkout(null);
          setMode(selectedPlan ? "detail" : "list");
        }}
        role={role}
        user={user}
      />
    );
  }

  if (mode === "builder") {
    return (
      <section className="screen-stack plans-screen">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Plan builder</p>
            <h1>{editingPlanId ? "Edit plan" : builder.step === 1 ? "Build plan" : "Plan workouts"}</h1>
            <p>{builder.step === 1 ? "Set the plan shell first, then add workouts." : "Add workouts, schedule them, and assign clients."}</p>
          </div>
          <button className="primary-action compact" onClick={closeBuilder} type="button">
            Close
          </button>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}

        {builder.step === 1 ? (
          <div className="panel plan-builder-panel">
            <label>
              Name of plan
              <input
                onChange={(event) => setBuilder((current) => ({ ...current, name: event.target.value }))}
                placeholder="Plan name, e.g. Push Pull Legs, 8 Week Shred"
                value={builder.name}
              />
            </label>

            <div className="plan-type-grid">
              <button
                className={builder.planType === "block" ? "plan-choice active" : "plan-choice"}
                onClick={() => setBuilder((current) => ({ ...current, planType: "block" }))}
                type="button"
              >
                <strong>Block plan</strong>
                <span>Set a training period</span>
              </button>
              <button
                className={builder.planType === "no_plan" ? "plan-choice active" : "plan-choice"}
                onClick={() => setBuilder((current) => ({ ...current, planType: "no_plan" }))}
                type="button"
              >
                <strong>No plan</strong>
                <span>No timeframe</span>
              </button>
            </div>

            {builder.planType === "block" ? (
              <div className="block-period-picker">
                <p className="eyebrow">Block period</p>
                <div>
                  {blockPeriods.map((weeks) => (
                    <button
                      className={builder.blockWeeks === weeks ? "chip active hiit" : "chip"}
                      key={weeks}
                      onClick={() => setBuilder((current) => ({ ...current, blockWeeks: weeks }))}
                      type="button"
                    >
                      {weeks}w
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button className="primary-action filled" onClick={continueBuilder} type="button">
              Continue
            </button>
          </div>
        ) : (
          <div className="panel plan-builder-panel">
            <div className="plan-builder-summary">
              <button className="primary-action compact" onClick={() => setBuilder((current) => ({ ...current, step: 1 }))} type="button">
                Back
              </button>
              <div>
                <h2>{builder.name}</h2>
                <p>
                  {builder.planType === "block" ? `${builder.blockWeeks} week block` : "No timeframe"} - {builder.workouts.length} workouts
                </p>
              </div>
            </div>

            <div className="plan-builder-actions">
              <button className="primary-action filled" onClick={() => setMode("workout-builder")} type="button">
                + New Workout
              </button>
              <button className="primary-action" onClick={() => setShowImport((current) => !current)} type="button">
                Import Workouts
              </button>
            </div>

            {showImport ? (
              <div className="import-workout-list">
                {workoutLibrary.length ? (
                  workoutLibrary.map((workout) => (
                    <button
                      disabled={importedWorkoutIds.has(workout.id)}
                      key={workout.id}
                      onClick={() => addImportedWorkout(workout)}
                      type="button"
                    >
                      <span>
                        <strong>{workout.name}</strong>
                        <em>{workoutSummary(workout)}</em>
                      </span>
                      <small>{importedWorkoutIds.has(workout.id) ? "Added" : "Add"}</small>
                    </button>
                  ))
                ) : (
                  <p className="compact-help">No workout templates available yet.</p>
                )}
              </div>
            ) : null}

            <div className="plan-workouts-panel">
              <div className="section-row">
                <h2>Plan workouts</h2>
                <button
                  className={builder.scheduleEnabled ? "status-pill active" : "status-pill"}
                  onClick={() => setBuilder((current) => ({ ...current, scheduleEnabled: !current.scheduleEnabled }))}
                  type="button"
                >
                  {builder.scheduleEnabled ? "Scheduled" : "No schedule"}
                </button>
              </div>

              {builder.workouts.length ? (
                <div className="plan-workout-list">
                  {builder.workouts.map((workout) => (
                    <article className="plan-workout-card" key={workout.id}>
                      <div>
                        <strong>{workout.name}</strong>
                        <span>{workout.summary}</span>
                      </div>
                      <button className="danger-link" onClick={() => removePlanWorkout(workout.id)} type="button">
                        Remove
                      </button>
                      {builder.scheduleEnabled ? (
                        <div className="weekday-picker">
                          {weekdays.map((day) => (
                            <button
                              className={(workout.scheduled_days || []).includes(day) ? "active" : ""}
                              key={day}
                              onClick={() => toggleWorkoutDay(workout.id, day)}
                              type="button"
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="compact-help">Add workouts with New Workout or Import Workouts.</p>
              )}
            </div>

            {role === "coach" ? (
              <div className="coach-assignment-panel">
                <div className="section-row">
                  <div>
                    <p className="eyebrow">Coach assignment</p>
                    <p className="compact-help">
                      {builder.selectedClientIds.length
                        ? `${builder.selectedClientIds.length} client${builder.selectedClientIds.length === 1 ? "" : "s"} will receive this plan when saved.`
                        : "Choose linked clients to assign this plan as soon as it is saved."}
                    </p>
                  </div>
                  <span className="status-pill">{builder.selectedClientIds.length} selected</span>
                </div>
                {clients.length ? (
                  clients.map((client) => (
                    <button
                      className={builder.selectedClientIds.includes(client.id) ? "client-assignment active" : "client-assignment"}
                      key={client.id}
                      onClick={() => toggleClient(client.id)}
                      type="button"
                    >
                      <span>{client.name}</span>
                      <strong>{builder.selectedClientIds.includes(client.id) ? "Added" : "Add"}</strong>
                    </button>
                  ))
                ) : (
                  <p className="compact-help">Linked clients will appear here.</p>
                )}
                <textarea
                  onChange={(event) => setBuilder((current) => ({ ...current, instructions: event.target.value }))}
                  placeholder="Plan instructions for selected clients..."
                  value={builder.instructions}
                />
              </div>
            ) : null}

            <div className="form-footer-actions">
              <button className="primary-action" onClick={closeBuilder} type="button">
                Cancel
              </button>
              <button className="primary-action filled" disabled={saving} onClick={savePlan} type="button">
                {saving ? "Saving..." : editingPlanId ? "Update Plan" : role === "coach" && builder.selectedClientIds.length ? "Save & assign plan" : "Save Plan"}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (mode === "detail" && selectedPlan) {
    const assignedClients = selectedPlan.training_plan_assignments || [];
    const planWorkouts = selectedPlan.training_plan_workouts || [];

    return (
      <section className="screen-stack plans-screen">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Plan details</p>
            <h1>{selectedPlan.name}</h1>
            <p>{formatPlanType(selectedPlan)}</p>
          </div>
          <div className="inline-actions">
            <button className="primary-action compact filled" onClick={() => editPlan(selectedPlan)} type="button">
              Edit
            </button>
            <button
              className="primary-action compact"
              onClick={() => {
                setSelectedPlan(null);
                setMode("list");
              }}
              type="button"
            >
              Back
            </button>
          </div>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}

        <div className="panel plan-detail-panel">
          <div className="completion-summary">
            <div>
              <span>Workouts</span>
              <strong>{planWorkouts.length}</strong>
            </div>
            <div>
              <span>Clients</span>
              <strong>{assignedClients.length}</strong>
            </div>
            <div>
              <span>Period</span>
              <strong>{selectedPlan.plan_type === "block" ? `${selectedPlan.block_weeks || 4}w` : "None"}</strong>
            </div>
            <div>
              <span>Type</span>
              <strong>{selectedPlan.plan_type === "block" ? "Block" : "Plan"}</strong>
            </div>
          </div>

          {selectedPlan.instructions ? (
            <div className="session-feedback-summary">
              <span>Instructions</span>
              <p>{selectedPlan.instructions}</p>
            </div>
          ) : null}
        </div>

        <div className="plan-workouts-panel">
          <div className="section-row">
            <h2>Plan workouts</h2>
            <span className="status-pill">{planWorkouts.length} saved</span>
          </div>

              {planWorkouts.length ? (
            <div className="plan-workout-list">
              {planWorkouts.map((workout) => (
                <article className="plan-workout-card" key={workout.id}>
                  <div>
                    <strong>{workout.name}</strong>
                    <span>{workout.summary || workout.workout_type}</span>
                    {workout.scheduled_days?.length ? (
                      <em>{workout.scheduled_days.join(", ")}</em>
                    ) : (
                      <em>No schedule</em>
                    )}
                  </div>
                  <div className="plan-workout-actions">
                    <span className="status-pill">{workout.source_type}</span>
                    <button className="primary-action compact filled" onClick={() => startPlanWorkout(workout, { planId: selectedPlan.id })} type="button">
                      Start
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="compact-help">No workouts were added to this plan.</p>
          )}
        </div>

        <div className="coach-assignment-panel">
          <p className="eyebrow">Assigned clients</p>
          {assignedClients.length ? (
            assignedClients.map((assignment) => (
              <div className="client-assignment active" key={assignment.id}>
                <span>
                  {assignment.profiles?.full_name || assignment.profiles?.email || "Client"}
                </span>
                <strong>Assigned</strong>
              </div>
            ))
          ) : (
            <p className="compact-help">No clients assigned yet.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack plans-screen">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Plan library</p>
          <h1>Plans</h1>
          <p>Build blocks from workouts, schedule sessions, and assign them to clients.</p>
        </div>
        <button className="primary-action compact filled" onClick={startBuilder} type="button">
          + New Plan
        </button>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading plans...</p> : null}
      {loadingDetail ? <p className="form-message success">Loading plan...</p> : null}

      {role === "client" ? (
        <div className="library-view-tabs" role="tablist" aria-label="Plan library view">
          <button
            className={planLibraryView === "library" ? "active" : ""}
            onClick={() => setPlanLibraryView("library")}
            type="button"
          >
            My Plans
          </button>
          <button
            className={planLibraryView === "assigned" ? "active" : ""}
            onClick={() => setPlanLibraryView("assigned")}
            type="button"
          >
            Coach Assigned
            <span>{assignedPlans.length}</span>
          </button>
        </div>
      ) : null}

      {role === "client" && planLibraryView === "assigned" ? (
        assignedPlans.length ? (
          <div className="plan-library-list">
            {assignedPlans.map((assignment) => {
              const plan = assignment.plan || {};
              const workouts = plan.training_plan_workouts || [];
              const isOpen = expandedAssignedPlanIds.has(assignment.assignment_id);
              const assignedDate = assignment.assigned_at
                ? new Date(assignment.assigned_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                : "";

              return (
                <article className="workout-card plan-card assigned-library-card prototype-plan-card" key={assignment.assignment_id}>
                  <div className="coach-assigned-banner">
                    <strong>Coach Assigned</strong>
                    <span>Complete sessions from here.</span>
                  </div>
                  <div className="prototype-plan-summary">
                    <h2>{plan.name || "Assigned plan"}</h2>
                    <p>{formatPlanType(plan)}{assignedDate ? ` - assigned ${assignedDate}` : ""}</p>
                    <div className="workout-card-meta">
                      <span>{workouts.length} workouts</span>
                      <span>Active</span>
                    </div>
                    <button className="primary-action compact" onClick={() => toggleAssignedPlan(assignment.assignment_id)} type="button">
                      {isOpen ? "Hide" : "Open"}
                    </button>
                  </div>
                  {plan.instructions ? <p className="workout-notes">{plan.instructions}</p> : null}
                  {isOpen && workouts.length ? (
                    <div className="assigned-plan-workout-list">
                      {workouts.map((workout) => (
                        <section className="assigned-plan-workout-block" key={workout.id || `${assignment.assignment_id}-${workout.position}`}>
                          <div className="assigned-plan-workout-head">
                            <div>
                              <strong>{workout.name}</strong>
                              <em>{workout.scheduled_days?.length ? workout.scheduled_days.join(", ") : workout.summary || workout.workout_type || "Workout"}</em>
                            </div>
                            <button
                              className="primary-action compact filled"
                              onClick={() => startPlanWorkout(workout, { assigned: true, planId: plan.id })}
                              type="button"
                            >
                              ▶ Start
                            </button>
                          </div>
                          {workout.exercises?.length ? (
                            <div className="assigned-exercise-list">
                              {workout.exercises.map((exercise) => (
                                <div key={exercise.id || `${workout.id}-${exercise.position}`}>
                                  <span>{exercise.exercise_name}</span>
                                  <em>{formatPlanExerciseTarget(exercise, workout.workout_type)}</em>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel empty-state">
            <p>No assigned plans yet. Coach-assigned plans will appear here.</p>
          </div>
        )
      ) : plans.length ? (
        <div className="plan-library-list">
          {plans.map((plan) => {
            const planWindow = getPlanWindow(plan);
            const workoutCount = plan.training_plan_workouts?.length || 0;
            const clientCount = plan.training_plan_assignments?.length || 0;

            return (
              <article className="workout-card plan-card prototype-plan-card my-plan-card" key={plan.id}>
                <div className="plan-card-menu-row">
                  <span className="status-pill">{plan.status || "Active"}</span>
                  <div className="session-menu-wrap">
                    <button
                      aria-expanded={openPlanMenu === plan.id}
                      aria-label={`${plan.name} options`}
                      className="icon-action"
                      onClick={() => setOpenPlanMenu((current) => (current === plan.id ? null : plan.id))}
                      type="button"
                    >
                      ...
                    </button>
                    {openPlanMenu === plan.id ? (
                      <div className="session-menu plan-action-menu" role="menu">
                        <button onClick={() => editPlan(plan)} type="button">
                          Edit
                        </button>
                        {role === "coach" ? (
                          <button onClick={() => assignPlan(plan)} type="button">
                            Assign
                          </button>
                        ) : null}
                        <button onClick={() => duplicatePlan(plan)} type="button">
                          Duplicate
                        </button>
                        <button onClick={() => openPlanDetails(plan)} type="button">
                          Details
                        </button>
                        <button onClick={() => archivePlan(plan.id)} type="button">
                          Archive
                        </button>
                        <button className="danger-text" onClick={() => deletePlan(plan.id)} type="button">
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="prototype-plan-summary">
                  <h2>{plan.name}</h2>
                  <strong>{planWindow.daysLeft === null ? planWindow.weekLabel : `${planWindow.weekLabel} - ${planWindow.daysLeft} days left`}</strong>
                  <p>{planWindow.dateRange}</p>
                  <div className="workout-card-meta">
                    <span>{formatPlanType(plan)}</span>
                    <span>{workoutCount} workouts</span>
                    <span>{clientCount} clients</span>
                  </div>
                </div>

                <div className="plan-progress-track" aria-hidden="true">
                  <span style={{ width: `${planWindow.progress}%` }} />
                </div>

                <button className="primary-action compact" onClick={() => openPlanDetails(plan)} type="button">
                  Open
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel empty-state">
          <p>No plans yet. Create your first plan from the workout library.</p>
        </div>
      )}

      {role !== "client" || planLibraryView === "library" ? (
        <section className="archive-section">
          <button className="archive-toggle" onClick={() => setShowArchivedPlans((current) => !current)} type="button">
            <span>Archived plans</span>
            <em>{archivedPlans.length}</em>
          </button>
          {showArchivedPlans ? (
            archivedPlans.length ? (
              <div className="archive-list">
                {archivedPlans.map((plan) => (
                  <article className="archive-card" key={plan.id}>
                    <div>
                      <strong>{plan.name}</strong>
                      <span>Archived {formatShortDate(plan.archived_at)} - {formatPlanType(plan)}</span>
                    </div>
                    <div className="archive-actions">
                      <button className="primary-action compact" onClick={() => restorePlan(plan.id)} type="button">
                        Restore
                      </button>
                      <button className="danger-link" onClick={() => deletePlan(plan.id)} type="button">
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="compact-help">No archived plans.</p>
            )
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
