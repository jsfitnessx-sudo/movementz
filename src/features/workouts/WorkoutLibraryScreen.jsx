import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const muscleGroups = ["Chest", "Back", "Legs", "Shoulders", "Biceps", "Triceps", "Core"];

const exerciseLibrary = {
  Chest: [
    "Barbell Bench Press",
    "DB Flat Press",
    "Incline DB Press",
    "Machine Chest Press",
    "Cable Fly",
    "Pec Deck",
    "Push Up",
    "Decline DB Press"
  ],
  Back: [
    "Lat Pulldown",
    "Seated Row",
    "One Arm DB Row",
    "Barbell Row",
    "Chest Supported Row",
    "Straight Arm Pulldown",
    "Assisted Pull Up",
    "Cable Pullover"
  ],
  Legs: [
    "Back Squat",
    "Romanian Deadlift",
    "Leg Press",
    "Leg Extension",
    "Seated Leg Curl",
    "Walking Lunge",
    "Bulgarian Split Squat",
    "Hip Thrust"
  ],
  Shoulders: [
    "DB Shoulder Press",
    "Machine Shoulder Press",
    "DB Lateral Raise",
    "Cable Lateral Raise",
    "Rear Delt Fly",
    "Arnold Press",
    "BB Overhead Press",
    "Face Pull"
  ],
  Biceps: [
    "DB Curl",
    "EZ Bar Curl",
    "Cable Curl",
    "Hammer Curl",
    "Preacher Curl",
    "Incline DB Curl",
    "Machine Curl",
    "Rope Curl"
  ],
  Triceps: [
    "Rope Pushdown",
    "Overhead Cable Extension",
    "Skull Crusher",
    "Close Grip Bench Press",
    "Assisted Dip",
    "Single Arm Pushdown",
    "Triceps Extension Machine",
    "Bench Dip"
  ],
  Core: [
    "Plank",
    "Dead Bug",
    "Cable Crunch",
    "Hanging Knee Raise",
    "Ab Wheel",
    "Russian Twist",
    "Pallof Press",
    "Side Plank"
  ]
};

const emptyExercise = {
  exercise_name: "",
  muscle_group: "Chest",
  sets: 3,
  rep_min: 8,
  rep_max: 12,
  start_kg: "",
  rest_seconds: 90,
  tip: "",
  search: "",
  suggestionOffset: 0
};

const demoWorkouts = [
  {
    id: "demo-strength",
    name: "Chest + Triceps",
    notes: "Foundation example workout.",
    workout_type: "strength",
    workout_template_exercises: [
      { id: "demo-1", position: 1, exercise_name: "DB Flat Press", muscle_group: "Chest", sets: 4, rep_min: 8, rep_max: 12, start_kg: 20 },
      { id: "demo-2", position: 2, exercise_name: "Cable Fly", muscle_group: "Chest", sets: 3, rep_min: 10, rep_max: 15, start_kg: 12.5 }
    ]
  }
];

function createMuscleTargets() {
  return Object.fromEntries(muscleGroups.map((muscle) => [muscle, 0]));
}

function createExerciseForMuscle(muscle, index, defaultSets = 4) {
  const options = exerciseLibrary[muscle] || [];
  return {
    ...emptyExercise,
    muscle_group: muscle,
    sets: defaultSets,
    exercise_name: options[index % options.length] || "",
    suggestionOffset: index
  };
}

function getSuggestions(exercise) {
  const options = exerciseLibrary[exercise.muscle_group] || [];
  if (options.length <= 3) return options;

  return [0, 1, 2].map((step) => options[(exercise.suggestionOffset + step) % options.length]);
}

function createSessionRows(exercise) {
  const setCount = Number(exercise.sets) || 1;
  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    kg: exercise.start_kg ?? "",
    reps: exercise.rep_min ?? "",
    done: false
  }));
}

function getPreviousSetChips(exercise) {
  const startKg = Number(exercise.start_kg);
  const repMin = Number(exercise.rep_min) || 8;
  if (!startKg) return [];

  return [
    `${startKg}kg x ${repMin}`,
    `${startKg}kg x ${Math.max(repMin - 1, 1)}`,
    `${startKg}kg x ${repMin + 2}`
  ];
}

function calculateSessionSummary(workout) {
  const exercises = workout?.workout_template_exercises || [];
  const completedSets = exercises.reduce(
    (sum, exercise) => sum + (exercise.sessionRows || []).filter((row) => row.done).length,
    0
  );
  const totalVolumeKg = exercises.reduce(
    (sum, exercise) =>
      sum +
      (exercise.sessionRows || []).reduce((setSum, row) => {
        if (!row.done) return setSum;
        return setSum + (Number(row.kg) || 0) * (Number(row.reps) || 0);
      }, 0),
    0
  );

  return {
    totalExercises: exercises.length,
    completedSets,
    totalVolumeKg
  };
}

function createDefaultSetup() {
  return {
    name: "",
    notes: "",
    workout_type: "strength",
    defaultSets: 4,
    muscleTargets: { ...createMuscleTargets(), Chest: 4 }
  };
}

export function WorkoutLibraryScreen({ user }) {
  const [workouts, setWorkouts] = useState([]);
  const [mode, setMode] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [setup, setSetup] = useState(createDefaultSetup);
  const [form, setForm] = useState({
    name: "",
    notes: "",
    workout_type: "strength",
    exercises: []
  });
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [activeNumberInput, setActiveNumberInput] = useState(null);
  const [openSessionMenu, setOpenSessionMenu] = useState(null);
  const [completedSession, setCompletedSession] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState({ rating: 0, comment: "" });
  const sessionInputRefs = useRef({});
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const editingWorkout = useMemo(
    () => workouts.find((workout) => workout.id === editingId),
    [editingId, workouts]
  );

  const totalTargetExercises = useMemo(
    () =>
      Object.values(setup.muscleTargets).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      ),
    [setup.muscleTargets]
  );

  const selectedMuscleTargets = useMemo(
    () => Object.entries(setup.muscleTargets).filter(([, count]) => Number(count) > 0),
    [setup.muscleTargets]
  );

  useEffect(() => {
    loadWorkouts();
  }, [user.id]);

  useEffect(() => {
    if (!activeNumberInput) return;

    const key = `${activeNumberInput.exerciseIndex}-${activeNumberInput.rowIndex}-${activeNumberInput.field}`;
    const input = sessionInputRefs.current[key];
    if (!input) return;

    window.requestAnimationFrame(() => {
      const keypadHeight = window.matchMedia("(max-width: 720px)").matches ? 340 : 0;
      const rect = input.getBoundingClientRect();
      const visibleBottom = window.innerHeight - keypadHeight;

      if (rect.bottom <= visibleBottom && rect.top >= 96) return;

      const nextTop = window.scrollY + rect.top - 140;
      window.scrollTo({ top: Math.max(nextTop, 0), behavior: "smooth" });
    });
  }, [activeNumberInput]);

  async function loadWorkouts() {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setWorkouts(demoWorkouts);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("workout_templates")
      .select(
        "id,name,notes,workout_type,created_at,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,start_kg,rest_seconds,tip,superset_group)"
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .order("position", { referencedTable: "workout_template_exercises", ascending: true });

    if (error) {
      setMessage("Could not load workouts yet. Run the Phase 2 SQL in Supabase first.");
      setWorkouts([]);
    } else {
      setWorkouts(data || []);
    }
    setLoading(false);
  }

  function startNewWorkout() {
    setEditingId(null);
    setSetup(createDefaultSetup());
    setMessage("");
    setMode("setup");
  }

  function buildExercisesFromSetup() {
    if (!setup.name.trim()) {
      setMessage("Give this workout a name first.");
      return;
    }

    if (totalTargetExercises < 1) {
      setMessage("Choose at least one exercise.");
      return;
    }

    const exercises = [];
    const defaultSets = Number(setup.defaultSets) || 4;
    Object.entries(setup.muscleTargets).forEach(([muscle, count]) => {
      for (let index = 0; index < Number(count || 0); index += 1) {
        exercises.push(createExerciseForMuscle(muscle, index, defaultSets));
      }
    });

    setForm({
      name: setup.name,
      notes: setup.notes,
      workout_type: setup.workout_type,
      exercises
    });
    setMessage("");
    setMode("editor");
  }

  function startEditWorkout(workout) {
    setEditingId(workout.id);
    setForm({
      name: workout.name || "",
      notes: workout.notes || "",
      workout_type: workout.workout_type || "strength",
      exercises: (workout.workout_template_exercises || []).map((exercise) => ({
        id: exercise.id,
        exercise_name: exercise.exercise_name || "",
        muscle_group: exercise.muscle_group || "Chest",
        sets: exercise.sets || 3,
        rep_min: exercise.rep_min || 8,
        rep_max: exercise.rep_max || 12,
        start_kg: exercise.start_kg ?? "",
        rest_seconds: exercise.rest_seconds || 90,
        tip: exercise.tip || "",
        search: "",
        suggestionOffset: 0
      }))
    });
    setMessage("");
    setMode("editor");
  }

  function updateMuscleTarget(muscle, change) {
    setSetup((current) => ({
      ...current,
      muscleTargets: {
        ...current.muscleTargets,
        [muscle]: Math.max(0, Math.min(12, (Number(current.muscleTargets[muscle]) || 0) + change))
      }
    }));
  }

  function toggleMuscleTarget(muscle) {
    setSetup((current) => {
      const currentCount = Number(current.muscleTargets[muscle]) || 0;
      const hasAnySelected = Object.values(current.muscleTargets).some((count) => Number(count) > 0);
      const defaultCount = hasAnySelected ? 1 : 4;

      return {
        ...current,
        muscleTargets: {
          ...current.muscleTargets,
          [muscle]: currentCount > 0 ? 0 : defaultCount
        }
      };
    });
  }

  function updateDefaultSets(change) {
    setSetup((current) => ({
      ...current,
      defaultSets: Math.max(1, Math.min(8, (Number(current.defaultSets) || 4) + change))
    }));
  }

  function updateExercise(index, field, value) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, [field]: value } : exercise
      )
    }));
  }

  function chooseExercise(index, exerciseName, clearSearch = false) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? {
              ...exercise,
              exercise_name: exerciseName,
              search: clearSearch ? "" : exercise.search
            }
          : exercise
      )
    }));
    setMessage("");
  }

  function refreshSuggestions(index) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? { ...exercise, suggestionOffset: exercise.suggestionOffset + 3 }
          : exercise
      )
    }));
    setMessage("Exercise options refreshed.");
  }

  function showDemo(exerciseName) {
    setMessage(
      exerciseName
        ? `Demo videos for ${exerciseName} will open here once video links are added.`
        : "Choose an exercise first, then Demo will show its video."
    );
  }

  function addExercise() {
    setForm((current) => ({
      ...current,
      exercises: [...current.exercises, createExerciseForMuscle("Chest", current.exercises.length, 4)]
    }));
  }

  function removeExercise(index) {
    setForm((current) => ({
      ...current,
      exercises:
        current.exercises.length === 1
          ? current.exercises
          : current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index)
    }));
  }

  async function saveWorkout(event) {
    event.preventDefault();
    setMessage("");

    const cleanName = form.name.trim();
    const cleanExercises = form.exercises
      .map((exercise, index) => ({
        position: index + 1,
        exercise_name: exercise.exercise_name.trim(),
        muscle_group: exercise.muscle_group || null,
        sets: Number(exercise.sets) || 1,
        rep_min: exercise.rep_min === "" ? null : Number(exercise.rep_min),
        rep_max: exercise.rep_max === "" ? null : Number(exercise.rep_max),
        start_kg: exercise.start_kg === "" ? null : Number(exercise.start_kg),
        rest_seconds: exercise.rest_seconds === "" ? null : Number(exercise.rest_seconds),
        tip: exercise.tip.trim() || null
      }))
      .filter((exercise) => exercise.exercise_name);

    if (!cleanName) {
      setMessage("Give this workout a name first.");
      return;
    }

    if (cleanExercises.length === 0) {
      setMessage("Add at least one exercise.");
      return;
    }

    if (!supabase || user.id === "demo-user") {
      const demoWorkout = {
        id: editingId || `demo-${Date.now()}`,
        name: cleanName,
        notes: form.notes,
        workout_type: form.workout_type,
        workout_template_exercises: cleanExercises.map((exercise) => ({
          ...exercise,
          id: `${Date.now()}-${exercise.position}`
        }))
      };
      setWorkouts((current) =>
        editingId
          ? current.map((workout) => (workout.id === editingId ? demoWorkout : workout))
          : [demoWorkout, ...current]
      );
      setMode("list");
      return;
    }

    setSaving(true);

    const workoutPayload = {
      owner_id: user.id,
      created_by: user.id,
      name: cleanName,
      notes: form.notes.trim() || null,
      workout_type: form.workout_type,
      source_type: "personal",
      visibility: "private",
      is_template: true,
      updated_at: new Date().toISOString()
    };

    const workoutResult = editingId
      ? await supabase
          .from("workout_templates")
          .update(workoutPayload)
          .eq("id", editingId)
          .select("id")
          .single()
      : await supabase
          .from("workout_templates")
          .insert(workoutPayload)
          .select("id")
          .single();

    if (workoutResult.error) {
      setMessage(workoutResult.error.message);
      setSaving(false);
      return;
    }

    const templateId = workoutResult.data.id;
    if (editingId) {
      const { error: deleteError } = await supabase
        .from("workout_template_exercises")
        .delete()
        .eq("template_id", templateId);

      if (deleteError) {
        setMessage(deleteError.message);
        setSaving(false);
        return;
      }
    }

    const { error: exerciseError } = await supabase
      .from("workout_template_exercises")
      .insert(cleanExercises.map((exercise) => ({ ...exercise, template_id: templateId })));

    if (exerciseError) {
      setMessage(exerciseError.message);
      setSaving(false);
      return;
    }

    await loadWorkouts();
    setSaving(false);
    setMode("list");
  }

  async function deleteWorkout(workoutId) {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      return;
    }

    const { error } = await supabase
      .from("workout_templates")
      .delete()
      .eq("id", workoutId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadWorkouts();
    }
  }

  function startSession(workout) {
    setActiveWorkout({
      ...workout,
      startedAt: new Date().toISOString(),
      workout_template_exercises: (workout.workout_template_exercises || []).map((exercise) => ({
        ...exercise,
        original_exercise_name: exercise.exercise_name,
        sessionRows: createSessionRows(exercise)
      }))
    });
    setCompletedSession(null);
    setSessionFeedback({ rating: 0, comment: "" });
    setMode("session");
  }

  function updateSessionRow(exerciseIndex, rowIndex, field, value) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex
          ? {
              ...exercise,
              sessionRows: exercise.sessionRows.map((row, currentRowIndex) =>
                currentRowIndex === rowIndex ? { ...row, [field]: value } : row
              )
            }
          : exercise
      )
    }));
  }

  function addSessionSet(exerciseIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex
          ? {
              ...exercise,
              sessionRows: [
                ...exercise.sessionRows,
                {
                  setNumber: exercise.sessionRows.length + 1,
                  kg: exercise.start_kg ?? "",
                  reps: exercise.rep_min ?? "",
                  done: false
                }
              ]
            }
          : exercise
      )
    }));
  }

  function removeSessionSet(exerciseIndex, rowIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) => {
        if (currentExerciseIndex !== exerciseIndex || exercise.sessionRows.length === 1) return exercise;

        return {
          ...exercise,
          sessionRows: exercise.sessionRows
            .filter((_, currentRowIndex) => currentRowIndex !== rowIndex)
            .map((row, index) => ({ ...row, setNumber: index + 1 }))
        };
      })
    }));
  }

  function playTone(type = "tap") {
    if (typeof window === "undefined") return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = type === "done" ? 880 : 420;
    gain.gain.setValueAtTime(type === "done" ? 0.12 : 0.055, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (type === "done" ? 0.18 : 0.06));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === "done" ? 0.18 : 0.06));
  }

  function markSessionSetDone(exerciseIndex, rowIndex) {
    updateSessionRow(exerciseIndex, rowIndex, "done", true);
    setActiveNumberInput(null);
    playTone("done");
  }

  function moveToNextNumberInput() {
    if (!activeNumberInput || !activeWorkout) return;

    const { exerciseIndex, rowIndex, field } = activeNumberInput;
    const exercise = activeWorkout.workout_template_exercises[exerciseIndex];
    if (!exercise) return;

    if (field === "kg") {
      setActiveNumberInput({ exerciseIndex, rowIndex, field: "reps" });
      return;
    }

    updateSessionRow(exerciseIndex, rowIndex, "done", true);
    playTone("done");

    if (rowIndex + 1 < exercise.sessionRows.length) {
      setActiveNumberInput({ exerciseIndex, rowIndex: rowIndex + 1, field: "kg" });
      return;
    }

    setActiveNumberInput(null);
  }

  function updateActiveNumber(value) {
    if (!activeNumberInput) return;
    updateSessionRow(activeNumberInput.exerciseIndex, activeNumberInput.rowIndex, activeNumberInput.field, value);
  }

  function pressKeypad(key) {
    if (!activeNumberInput || !activeWorkout) return;

    const exercise = activeWorkout.workout_template_exercises[activeNumberInput.exerciseIndex];
    const row = exercise?.sessionRows?.[activeNumberInput.rowIndex];
    const currentValue = String(row?.[activeNumberInput.field] ?? "");

    if (key === "hide") {
      setActiveNumberInput(null);
      return;
    }

    if (key === "next") {
      moveToNextNumberInput();
      return;
    }

    playTone("tap");

    if (key === "delete") {
      updateActiveNumber(currentValue.slice(0, -1));
      return;
    }

    if (key === "." && currentValue.includes(".")) return;
    updateActiveNumber(`${currentValue}${key}`);
  }

  function swapSessionExercise(exerciseIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) => {
        if (currentExerciseIndex !== exerciseIndex) return exercise;
        const options = exerciseLibrary[exercise.muscle_group] || [];
        const currentOptionIndex = options.indexOf(exercise.exercise_name);
        const nextName = options[(currentOptionIndex + 1 + options.length) % options.length] || exercise.exercise_name;
        return { ...exercise, exercise_name: nextName, skipped: false };
      })
    }));
    setOpenSessionMenu(null);
    setMessage("Exercise swapped. Full substitution logging comes next in the workout logging phase.");
  }

  function skipSessionExercise(exerciseIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex ? { ...exercise, skipped: true } : exercise
      )
    }));
    setOpenSessionMenu(null);
    setMessage("Exercise skipped for this session.");
  }

  async function finishActiveSession() {
    if (!activeWorkout) return;

    setSaving(true);
    setMessage("");
    setActiveNumberInput(null);

    const completedAt = new Date().toISOString();
    const startedAt = activeWorkout.startedAt || completedAt;
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    );
    const summary = calculateSessionSummary(activeWorkout);

    if (!supabase || user.id === "demo-user") {
      setCompletedSession({
        id: `demo-session-${Date.now()}`,
        name: activeWorkout.name,
        startedAt,
        completedAt,
        durationSeconds,
        ...summary
      });
      setSaving(false);
      setMode("complete");
      return;
    }

    const { data: sessionLog, error: sessionError } = await supabase
      .from("session_logs")
      .insert({
        owner_id: user.id,
        workout_template_id: activeWorkout.id || null,
        name: activeWorkout.name,
        notes: activeWorkout.notes || null,
        workout_type: activeWorkout.workout_type || "strength",
        status: "completed",
        started_at: startedAt,
        completed_at: completedAt,
        duration_seconds: durationSeconds,
        total_exercises: summary.totalExercises,
        completed_sets: summary.completedSets,
        total_volume_kg: summary.totalVolumeKg
      })
      .select("id")
      .single();

    if (sessionError) {
      setMessage(`${sessionError.message}. Run supabase/phase-3-session-logging.sql in Supabase first.`);
      setSaving(false);
      return;
    }

    for (const [exerciseIndex, exercise] of activeWorkout.workout_template_exercises.entries()) {
      const { data: sessionExercise, error: exerciseError } = await supabase
        .from("session_log_exercises")
        .insert({
          session_id: sessionLog.id,
          workout_template_exercise_id: exercise.id || null,
          position: exerciseIndex + 1,
          exercise_name: exercise.exercise_name,
          original_exercise_name: exercise.original_exercise_name || exercise.exercise_name,
          muscle_group: exercise.muscle_group || null,
          target_sets: exercise.sets || null,
          target_rep_min: exercise.rep_min || null,
          target_rep_max: exercise.rep_max || null,
          skipped: Boolean(exercise.skipped),
          substituted: Boolean(exercise.original_exercise_name && exercise.original_exercise_name !== exercise.exercise_name)
        })
        .select("id")
        .single();

      if (exerciseError) {
        setMessage(exerciseError.message);
        setSaving(false);
        return;
      }

      const sessionSets = (exercise.sessionRows || []).map((row) => ({
        session_exercise_id: sessionExercise.id,
        set_number: row.setNumber,
        kg: row.kg === "" ? null : Number(row.kg),
        reps: row.reps === "" ? null : Number(row.reps),
        completed: Boolean(row.done)
      }));

      if (sessionSets.length) {
        const { error: setError } = await supabase.from("session_log_sets").insert(sessionSets);
        if (setError) {
          setMessage(setError.message);
          setSaving(false);
          return;
        }
      }
    }

    setCompletedSession({
      id: sessionLog.id,
      name: activeWorkout.name,
      startedAt,
      completedAt,
      durationSeconds,
      ...summary
    });
    setSaving(false);
    setMode("complete");
  }

  async function saveSessionFeedback() {
    if (!completedSession) return;

    if (supabase && user.id !== "demo-user") {
      setSaving(true);
      const { error } = await supabase
        .from("session_logs")
        .update({
          rating: sessionFeedback.rating || null,
          comment: sessionFeedback.comment.trim() || null
        })
        .eq("id", completedSession.id);

      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setCompletedSession(null);
    setActiveWorkout(null);
    setSessionFeedback({ rating: 0, comment: "" });
    setMode("list");
  }

  if (mode === "session" && activeWorkout) {
    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Active session</p>
            <h1>{activeWorkout.name}</h1>
            <p>Add or remove sets as the real workout changes.</p>
          </div>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}

        <div className="workout-card-list">
          {activeWorkout.workout_template_exercises.map((exercise, exerciseIndex) => {
            const previousSets = getPreviousSetChips(exercise);
            const isMenuOpen = openSessionMenu === exerciseIndex;

            return (
              <article
                className={exercise.skipped ? "workout-card active-exercise-card skipped" : "workout-card active-exercise-card"}
                key={exercise.id || exerciseIndex}
              >
                <div className="active-exercise-head">
                  <div>
                    <p className="eyebrow">{exercise.muscle_group || "Strength"}</p>
                    <h2>{exercise.exercise_name}</h2>
                    <p>
                      Target: {exercise.sets || 0} sets
                      {exercise.rep_min || exercise.rep_max
                        ? ` x ${exercise.rep_min || "?"}-${exercise.rep_max || "?"} reps`
                        : ""}
                    </p>
                  </div>
                  <div className="session-menu-wrap">
                    <button
                      aria-expanded={isMenuOpen}
                      aria-label={`More options for ${exercise.exercise_name}`}
                      className="icon-action session-menu-button"
                      onClick={() => setOpenSessionMenu(isMenuOpen ? null : exerciseIndex)}
                      type="button"
                    >
                      ...
                    </button>
                    {isMenuOpen ? (
                      <div className="session-menu" role="menu">
                        <button onClick={() => showDemo(exercise.exercise_name)} type="button">
                          Demo
                        </button>
                        <button onClick={() => swapSessionExercise(exerciseIndex)} type="button">
                          Swap exercise
                        </button>
                        <button className="danger-text" onClick={() => skipSessionExercise(exerciseIndex)} type="button">
                          Skip exercise
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {previousSets.length ? (
                  <div className="previous-sets">
                    <span>Last</span>
                    <div>
                      {previousSets.map((set) => (
                        <strong key={set}>{set}</strong>
                      ))}
                    </div>
                  </div>
                ) : null}

                {exercise.skipped ? <p className="form-message error">Skipped for this session.</p> : null}

                <div className="session-set-table">
                  <div className="session-set-row session-set-head">
                    <span>Set</span>
                    <span>Kg</span>
                    <span>Reps</span>
                    <span>Done</span>
                    <span>Remove</span>
                  </div>
                  {exercise.sessionRows.map((row, rowIndex) => (
                    <div className="session-set-row" key={`${exerciseIndex}-${row.setNumber}`}>
                      <strong>{row.setNumber}</strong>
                      <input
                        className={
                          activeNumberInput?.exerciseIndex === exerciseIndex &&
                          activeNumberInput?.rowIndex === rowIndex &&
                          activeNumberInput?.field === "kg"
                            ? "active-number-input"
                            : ""
                        }
                        inputMode="none"
                        onChange={(event) =>
                          updateSessionRow(exerciseIndex, rowIndex, "kg", event.target.value)
                        }
                        onFocus={() => setActiveNumberInput({ exerciseIndex, rowIndex, field: "kg" })}
                        ref={(element) => {
                          sessionInputRefs.current[`${exerciseIndex}-${rowIndex}-kg`] = element;
                        }}
                        type="text"
                        value={row.kg}
                      />
                      <input
                        className={
                          activeNumberInput?.exerciseIndex === exerciseIndex &&
                          activeNumberInput?.rowIndex === rowIndex &&
                          activeNumberInput?.field === "reps"
                            ? "active-number-input"
                            : ""
                        }
                        inputMode="none"
                        onChange={(event) =>
                          updateSessionRow(exerciseIndex, rowIndex, "reps", event.target.value)
                        }
                        onFocus={() => setActiveNumberInput({ exerciseIndex, rowIndex, field: "reps" })}
                        ref={(element) => {
                          sessionInputRefs.current[`${exerciseIndex}-${rowIndex}-reps`] = element;
                        }}
                        type="text"
                        value={row.reps}
                      />
                      <button
                        className={row.done ? "set-toggle done" : "set-toggle"}
                        onClick={() =>
                          row.done
                            ? updateSessionRow(exerciseIndex, rowIndex, "done", false)
                            : markSessionSetDone(exerciseIndex, rowIndex)
                        }
                        type="button"
                      >
                        {row.done ? "✓" : "Done"}
                      </button>
                      <button
                        className="danger-link"
                        onClick={() => removeSessionSet(exerciseIndex, rowIndex)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  className="primary-action compact"
                  onClick={() => addSessionSet(exerciseIndex)}
                  type="button"
                >
                  Add Set
                </button>
              </article>
            );
          })}
        </div>

        <div className="session-end-actions">
          <button className="primary-action" disabled={saving} onClick={finishActiveSession} type="button">
            {saving ? "Saving..." : "Finish Workout"}
          </button>
        </div>

        {activeNumberInput ? (
          <div className="mobile-number-pad" aria-label="Workout number keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "delete"].map((key) => (
              <button
                className={key === "delete" ? "keypad-delete" : `keypad-key key-${key === "." ? "decimal" : key}`}
                key={key}
                onClick={() => pressKeypad(key)}
                type="button"
              >
                {key === "delete" ? "⌫" : key}
              </button>
            ))}
            <button className="keypad-hide" onClick={() => pressKeypad("hide")} type="button">
              ˅
            </button>
            <button className="keypad-next" onClick={() => pressKeypad("next")} type="button">
              Next
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  if (mode === "complete" && completedSession) {
    const minutes = Math.floor(completedSession.durationSeconds / 60);
    const seconds = completedSession.durationSeconds % 60;

    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout complete</p>
          <h1>{completedSession.name}</h1>
          <p>Review the session, rate it, and save your notes.</p>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}

        <div className="workout-card completion-card">
          <div className="completion-summary">
            <div>
              <span>Duration</span>
              <strong>{minutes ? `${minutes}m ${seconds}s` : `${seconds}s`}</strong>
            </div>
            <div>
              <span>Exercises</span>
              <strong>{completedSession.totalExercises}</strong>
            </div>
            <div>
              <span>Sets done</span>
              <strong>{completedSession.completedSets}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{Math.round(completedSession.totalVolumeKg).toLocaleString()}kg</strong>
            </div>
          </div>

          <div className="session-rating">
            <h2>Rate this session</h2>
            <div>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  className={sessionFeedback.rating >= rating ? "star-button active" : "star-button"}
                  key={rating}
                  onClick={() => setSessionFeedback((current) => ({ ...current, rating }))}
                  type="button"
                >
                  *
                </button>
              ))}
            </div>
          </div>

          <label className="completion-notes">
            Notes
            <textarea
              onChange={(event) =>
                setSessionFeedback((current) => ({ ...current, comment: event.target.value }))
              }
              placeholder="Any notes? (optional)"
              value={sessionFeedback.comment}
            />
          </label>
        </div>

        <button className="primary-action filled" disabled={saving} onClick={saveSessionFeedback} type="button">
          {saving ? "Saving..." : "Save & Finish"}
        </button>
      </section>
    );
  }

  if (mode === "setup") {
    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout library</p>
          <h1>Build workout</h1>
          <p>Choose the muscle groups first, then pick exercises from quick options.</p>
        </div>

        <div className="workout-editor panel">
          <div className="library-toolbar">
            <button className="primary-action" onClick={() => setMode("list")} type="button">
              Close
            </button>
          </div>

          {message ? <p className="form-message error">{message}</p> : null}

          <label>
            Workout name
            <input
              onChange={(event) => setSetup((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Push Day, Chest + Triceps"
              value={setup.name}
            />
          </label>

          <label>
            Notes
            <textarea
              onChange={(event) => setSetup((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Workout notes, focus points, rest guidance, or coaching cues..."
              value={setup.notes}
            />
          </label>

          <div className="setup-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">Sets</p>
                <h2>Sets per exercise</h2>
              </div>
              <div className="stepper-control">
                <button onClick={() => updateDefaultSets(-1)} type="button">
                  -
                </button>
                <strong>{setup.defaultSets}</strong>
                <button onClick={() => updateDefaultSets(1)} type="button">
                  +
                </button>
              </div>
            </div>
            <p className="compact-help">You can still adjust individual exercises on the next screen.</p>
          </div>

          <div className="muscle-picker setup-card">
            <div>
              <p className="eyebrow">Muscle groups</p>
              <h2>Pick muscles, then choose how many exercises</h2>
            </div>

            <div className="muscle-chip-list">
              {muscleGroups.map((muscle) => {
                const count = Number(setup.muscleTargets[muscle]) || 0;
                return (
                  <button
                    className={count > 0 ? "chip active" : "chip"}
                    key={muscle}
                    onClick={() => toggleMuscleTarget(muscle)}
                    type="button"
                  >
                    {count > 0 ? "✓ " : ""}
                    {muscle}
                  </button>
                );
              })}
            </div>

            <div className="muscle-count-list">
              {selectedMuscleTargets.length === 0 ? (
                <p className="compact-help">Choose at least one muscle group.</p>
              ) : (
                selectedMuscleTargets.map(([muscle, count]) => (
                  <div className="muscle-count-row" key={muscle}>
                    <strong>{muscle}</strong>
                    <div className="stepper-control">
                      <button onClick={() => updateMuscleTarget(muscle, -1)} type="button">
                        -
                      </button>
                      <strong>{count}</strong>
                      <button onClick={() => updateMuscleTarget(muscle, 1)} type="button">
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="setup-summary-row">
                <span>Total exercises</span>
                <strong>{totalTargetExercises}</strong>
              </div>
            </div>
          </div>

          <button className="primary-action filled" onClick={buildExercisesFromSetup} type="button">
            Continue
          </button>
        </div>
      </section>
    );
  }

  if (mode === "editor") {
    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout library</p>
          <h1>{editingWorkout ? "Edit workout" : "Choose exercises"}</h1>
          <p>Use the quick options, refresh them, search, or type a requested exercise name.</p>
        </div>

        <form className="workout-editor panel" onSubmit={saveWorkout}>
          <div className="library-toolbar">
            <button
              className="primary-action"
              onClick={() => (editingId ? setMode("list") : setMode("setup"))}
              type="button"
            >
              Back
            </button>
          </div>

          {message ? <p className="form-message error">{message}</p> : null}

          <div className="exercise-list">
            <div className="section-row exercise-list-head">
              <h2>Exercises</h2>
              <button className="primary-action compact" onClick={addExercise} type="button">
                Add Exercise
              </button>
            </div>

            {form.exercises.map((exercise, index) => {
              const searchResults = exercise.search
                ? Object.values(exerciseLibrary)
                    .flat()
                    .filter((name) => name.toLowerCase().includes(exercise.search.toLowerCase()))
                    .slice(0, 5)
                : [];

              return (
                <div className="exercise-editor" key={`${index}-${exercise.id || "new"}`}>
                  <div className="exercise-editor-head">
                    <div>
                      <strong>Exercise {index + 1}</strong>
                      <p className="muscle-label">{exercise.muscle_group}</p>
                    </div>
                    {exercise.exercise_name ? (
                      <button
                        className="primary-action compact demo-action"
                        onClick={() => showDemo(exercise.exercise_name)}
                        type="button"
                      >
                        Demo
                      </button>
                    ) : null}
                  </div>

                  {exercise.exercise_name ? (
                    <div className="selected-exercise">
                      <span>Selected:</span>
                      <strong>{exercise.exercise_name}</strong>
                    </div>
                  ) : null}

                  <div className="suggestion-picker">
                    <div className="suggestion-list">
                      {getSuggestions(exercise).map((suggestion) => (
                        <button
                          className={exercise.exercise_name === suggestion ? "suggestion active" : "suggestion"}
                          key={suggestion}
                          onClick={() => chooseExercise(index, suggestion, true)}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                    <div className="mini-actions">
                      <button
                        aria-label={`Refresh ${exercise.muscle_group} suggestions`}
                        className="primary-action compact refresh-action"
                        onClick={() => refreshSuggestions(index)}
                        title="Refresh suggestions"
                        type="button"
                      >
                        ↻
                      </button>
                      <button
                        className="danger-link remove-action"
                        onClick={() => removeExercise(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <label>
                    Search or type exercise
                    <input
                      onChange={(event) => updateExercise(index, "search", event.target.value)}
                      placeholder={`Search ${exercise.muscle_group} exercises...`}
                      value={exercise.search}
                    />
                  </label>

                  {searchResults.length > 0 ? (
                    <div className="search-results">
                      {searchResults.map((result) => (
                        <button
                          key={result}
                          onClick={() => chooseExercise(index, result, true)}
                          type="button"
                        >
                          {result}
                        </button>
                      ))}
                    </div>
                  ) : exercise.search ? (
                    <button
                      className="primary-action compact"
                      onClick={() => chooseExercise(index, exercise.search, true)}
                      type="button"
                    >
                      Use "{exercise.search}"
                    </button>
                  ) : null}

                  <div className="form-grid four">
                    <label>
                      Sets
                      <input
                        min="1"
                        onChange={(event) => updateExercise(index, "sets", event.target.value)}
                        type="number"
                        value={exercise.sets}
                      />
                    </label>
                    <label>
                      Rep min
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "rep_min", event.target.value)}
                        type="number"
                        value={exercise.rep_min}
                      />
                    </label>
                    <label>
                      Rep max
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "rep_max", event.target.value)}
                        type="number"
                        value={exercise.rep_max}
                      />
                    </label>
                    <label>
                      Start kg
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "start_kg", event.target.value)}
                        step="0.25"
                        type="number"
                        value={exercise.start_kg}
                      />
                    </label>
                  </div>

                  <div className="form-grid two">
                    <label>
                      Rest sec
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "rest_seconds", event.target.value)}
                        type="number"
                        value={exercise.rest_seconds}
                      />
                    </label>
                    <label>
                      Tip
                      <input
                        onChange={(event) => updateExercise(index, "tip", event.target.value)}
                        placeholder="Optional cue"
                        value={exercise.tip}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="form-footer-actions">
            <button className="primary-action filled" disabled={saving} type="submit">
              {saving ? "Saving..." : "Save Workout"}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="screen-stack workout-library">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Workout library</p>
          <h1>Workouts</h1>
          <p>Create workouts once, start them later, or use them inside plans.</p>
        </div>
        <button className="primary-action filled" onClick={startNewWorkout} type="button">
          Build Workout
        </button>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}

      {loading ? (
        <div className="panel">
          <p>Loading workouts...</p>
        </div>
      ) : workouts.length === 0 ? (
        <div className="panel empty-state">
          <h2>No workouts yet</h2>
          <p>Start with one strength workout. Plans will import from this library next.</p>
          <button className="primary-action filled" onClick={startNewWorkout} type="button">
            Build First Workout
          </button>
        </div>
      ) : (
        <div className="workout-card-list">
          {workouts.map((workout) => {
            const exercises = workout.workout_template_exercises || [];
            const totalSets = exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);

            return (
              <article className="workout-card" key={workout.id}>
                <div className="workout-card-head">
                  <div>
                    <p className="eyebrow">{workout.workout_type}</p>
                    <h2>{workout.name}</h2>
                    <p>
                      {exercises.length} exercises - {totalSets} total sets
                    </p>
                  </div>
                  <span className="status-pill">Template</span>
                </div>

                {workout.notes ? <p className="workout-notes">{workout.notes}</p> : null}

                <div className="workout-exercise-summary">
                  {exercises.map((exercise) => (
                    <div key={exercise.id || `${workout.id}-${exercise.position}`}>
                      <strong>{exercise.exercise_name}</strong>
                      <span>
                        {exercise.sets || 0} sets
                        {exercise.rep_min || exercise.rep_max
                          ? ` x ${exercise.rep_min || "?"}-${exercise.rep_max || "?"} reps`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="library-actions">
                  <button className="primary-action filled" onClick={() => startSession(workout)} type="button">
                    Start
                  </button>
                  <button className="primary-action" onClick={() => startEditWorkout(workout)} type="button">
                    Edit
                  </button>
                  <button className="primary-action danger" onClick={() => deleteWorkout(workout.id)} type="button">
                    Delete
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
