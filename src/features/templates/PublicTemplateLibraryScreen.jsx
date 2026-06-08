import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

function formatTemplateType(template) {
  if (template.workout_type === "hiit") {
    const timer = template.hiit_timer_type === "for_time"
      ? "For Time"
      : template.hiit_timer_type === "tabata"
        ? "Tabata"
        : "Interval";
    return `HIIT - ${timer}`;
  }
  return "Strength";
}

function formatExerciseLine(exercise, workoutType) {
  if (workoutType === "hiit") {
    return `Target: ${exercise.target_value || 10} ${exercise.target_type || "reps"}`;
  }
  return `${exercise.sets || 1} sets - ${exercise.rep_min || 8}-${exercise.rep_max || 12} reps`;
}

export function PublicTemplateLibraryScreen({ onBack, user }) {
  const [templateType, setTemplateType] = useState("all");
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [copyingId, setCopyingId] = useState("");
  const [message, setMessage] = useState("");

  const filteredTemplates = useMemo(() => templates, [templates]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(async () => {
      if (!supabase || user.id === "demo-user") {
        if (alive) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setMessage("");
      const { data, error } = await supabase.rpc("get_public_workout_templates", {
        template_kind: templateType
      });

      if (!alive) return;
      setLoading(false);
      if (error) {
        setMessage(`${error.message}. Run supabase/phase-26-public-template-library.sql in Supabase.`);
        setTemplates([]);
      } else {
        setTemplates(Array.isArray(data) ? data : []);
      }
    });

    return () => {
      alive = false;
    };
  }, [templateType, user.id]);

  async function copyTemplate(template) {
    if (!supabase || user.id === "demo-user") return;
    setCopyingId(template.id);
    setMessage("");
    const { error } = await supabase.rpc("copy_public_workout_template", {
      source_template_id: template.id
    });
    setCopyingId("");
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-26-public-template-library.sql in Supabase.`);
      return;
    }
    setMessage(`${template.name} added to your Workout Library.`);
  }

  return (
    <section className="screen-stack public-template-screen">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Template library</p>
          <h1>Public templates</h1>
          <p>Use Movementz templates, then edit them in your own workout library.</p>
        </div>
        <button className="primary-action compact" onClick={onBack} type="button">
          Back
        </button>
      </div>

      {message ? <p className={message.includes("Run supabase") ? "form-message error" : "form-message success"}>{message}</p> : null}

      <div className="library-tabs">
        {[
          ["all", "All"],
          ["strength", "Strength"],
          ["hiit", "HIIT"]
        ].map(([value, label]) => (
          <button
            className={templateType === value ? "active" : ""}
            key={value}
            onClick={() => setTemplateType(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="form-message success">Loading templates...</p> : null}

      {!loading && !filteredTemplates.length ? (
        <div className="panel empty-state">
          <h2>No public templates yet</h2>
          <p>Admin can publish workouts from the Workout Library menu.</p>
        </div>
      ) : (
        <div className="workout-card-list">
          {filteredTemplates.map((template) => {
            const exercises = Array.isArray(template.workout_template_exercises) ? template.workout_template_exercises : [];
            return (
              <article className="workout-card prototype-workout-card public-template-card" key={template.id}>
                <div className="workout-card-head prototype-workout-head">
                  <div>
                    <p className="eyebrow">{formatTemplateType(template)}</p>
                    <h2>{template.name}</h2>
                    <p>{exercises.length} exercises</p>
                  </div>
                  <span className="status-pill active">Public</span>
                </div>
                {template.notes ? <p className="workout-notes">{template.notes}</p> : null}
                <div className="workout-exercise-summary prototype-exercise-preview">
                  {exercises.slice(0, 5).map((exercise) => (
                    <div key={exercise.id || `${template.id}-${exercise.position}`}>
                      <strong>{exercise.exercise_name}</strong>
                      <span>{formatExerciseLine(exercise, template.workout_type)}</span>
                    </div>
                  ))}
                  {exercises.length > 5 ? <p className="compact-help">+ {exercises.length - 5} more exercises</p> : null}
                </div>
                <button
                  className="primary-action filled"
                  disabled={copyingId === template.id}
                  onClick={() => copyTemplate(template)}
                  type="button"
                >
                  {copyingId === template.id ? "Adding..." : "Use Template"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
