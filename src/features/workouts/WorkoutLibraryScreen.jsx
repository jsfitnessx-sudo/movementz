import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const emptyExercise = {
  exercise_name: "",
  muscle_group: "Chest",
  sets: 3,
  rep_min: 8,
  rep_max: 12,
  start_kg: "",
  rest_seconds: 90,
  tip: ""
};

const demoWorkouts = [
  {
    id: "demo-strength",
    name: "Chest + Triceps",
    notes: "Foundation example workout.",
    workout_type: "strength",
    workout_template_exercises: [
      { id: "demo-1", position: 1, exercise_name: "DB Flat Press", sets: 4, rep_min: 8, rep_max: 12 },
      { id: "demo-2", position: 2, exercise_name: "Cable Fly", sets: 3, rep_min: 10, rep_max: 15 }
    ]
  }
];

export function WorkoutLibraryScreen({ user }) {
  const [workouts, setWorkouts] = useState([]);
  const [mode, setMode] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    notes: "",
    workout_type: "strength",
    exercises: [{ ...emptyExercise }]
  });
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const editingWorkout = useMemo(
    () => workouts.find((workout) => workout.id === editingId),
    [editingId, workouts]
  );

  useEffect(() => {
    loadWorkouts();
  }, [user.id]);

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
    setForm({
      name: "",
      notes: "",
      workout_type: "strength",
      exercises: [{ ...emptyExercise }]
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
        tip: exercise.tip || ""
      }))
    });
    setMessage("");
    setMode("editor");
  }

  function updateExercise(index, field, value) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, [field]: value } : exercise
      )
    }));
  }

  function addExercise() {
    setForm((current) => ({
      ...current,
      exercises: [...current.exercises, { ...emptyExercise }]
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

  if (mode === "editor") {
    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout library</p>
          <h1>{editingWorkout ? "Edit workout" : "Build workout"}</h1>
          <p>Create strength templates first. Home, HIIT and running come after this base is solid.</p>
        </div>

        <form className="workout-editor panel" onSubmit={saveWorkout}>
          <div className="library-toolbar">
            <button className="primary-action" onClick={() => setMode("list")} type="button">
              Close
            </button>
            <button className="primary-action filled" disabled={saving} type="submit">
              {saving ? "Saving..." : "Save Workout"}
            </button>
          </div>

          {message ? <p className="form-message error">{message}</p> : null}

          <label>
            Workout name
            <input
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Chest + Triceps"
              value={form.name}
            />
          </label>

          <label>
            Notes
            <textarea
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Focus points, rest guidance, tempo, or coaching cues..."
              value={form.notes}
            />
          </label>

          <div className="exercise-list">
            <div className="section-row">
              <h2>Exercises</h2>
              <button className="primary-action compact" onClick={addExercise} type="button">
                Add Exercise
              </button>
            </div>

            {form.exercises.map((exercise, index) => (
              <div className="exercise-editor" key={`${index}-${exercise.id || "new"}`}>
                <div className="exercise-editor-head">
                  <strong>Exercise {index + 1}</strong>
                  <button
                    className="danger-link"
                    onClick={() => removeExercise(index)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>

                <label>
                  Exercise name
                  <input
                    onChange={(event) => updateExercise(index, "exercise_name", event.target.value)}
                    placeholder="e.g. Barbell Bench Press"
                    value={exercise.exercise_name}
                  />
                </label>

                <div className="form-grid four">
                  <label>
                    Muscle
                    <select
                      onChange={(event) => updateExercise(index, "muscle_group", event.target.value)}
                      value={exercise.muscle_group}
                    >
                      {["Chest", "Back", "Legs", "Shoulders", "Biceps", "Triceps", "Core"].map(
                        (muscle) => (
                          <option key={muscle}>{muscle}</option>
                        )
                      )}
                    </select>
                  </label>
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
                </div>

                <div className="form-grid two">
                  <label>
                    Starting kg
                    <input
                      min="0"
                      onChange={(event) => updateExercise(index, "start_kg", event.target.value)}
                      step="0.25"
                      type="number"
                      value={exercise.start_kg}
                    />
                  </label>
                  <label>
                    Rest seconds
                    <input
                      min="0"
                      onChange={(event) => updateExercise(index, "rest_seconds", event.target.value)}
                      type="number"
                      value={exercise.rest_seconds}
                    />
                  </label>
                </div>

                <label>
                  Tip
                  <input
                    onChange={(event) => updateExercise(index, "tip", event.target.value)}
                    placeholder="Optional cue"
                    value={exercise.tip}
                  />
                </label>
              </div>
            ))}
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
                  <button className="primary-action filled" type="button">
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
