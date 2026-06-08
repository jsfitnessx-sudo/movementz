import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const todayIso = () => new Date().toISOString().slice(0, 10);
const mindsetRows = [
  { key: "gratitude", title: "Gratitude", detail: "Name one good thing in 10 seconds." },
  { key: "personal_development", title: "Personal development", detail: "Read or listen for 10 minutes." },
  { key: "mindfulness", title: "Mindfulness", detail: "Meditation, breathing, or calm time." },
  { key: "positive_checkin", title: "Positive check-in", detail: "Name your daily mood and win." },
  { key: "daily_win", title: "Daily win", detail: "One thing that moved you forward today." }
];
const waterOptions = [0.5, 1, 2, 3, 4];

function blankForm() {
  return {
    workout_completed: false,
    steps: "",
    water_liters: "",
    protein_g: "",
    sleep_hours: "",
    nutrition_compliance: "",
    mindset: {}
  };
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function completionScore(form) {
  const checks = [
    form.workout_completed,
    numberOrNull(form.steps) !== null,
    numberOrNull(form.water_liters) !== null,
    numberOrNull(form.protein_g) !== null,
    numberOrNull(form.sleep_hours) !== null,
    Boolean(form.nutrition_compliance),
    ...mindsetRows.map((row) => Boolean(form.mindset?.[row.key]))
  ];
  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}

function formatHabitDate(value) {
  if (!value) return "Today";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function HabitsScreen({ user }) {
  const [form, setForm] = useState(blankForm);
  const [weekLogs, setWeekLogs] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const habitDate = todayIso();
  const dailyScore = useMemo(() => completionScore(form), [form]);
  const weekAverage = useMemo(() => {
    if (!weekLogs.length) return dailyScore;
    const scores = weekLogs.map((log) => Number(log.completion_percent || 0));
    if (!weekLogs.some((log) => log.log_date === habitDate)) scores.push(dailyScore);
    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  }, [dailyScore, habitDate, weekLogs]);

  const loadHabits = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setLoading(false);
      return;
    }

    setLoading(true);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const { data, error } = await supabase
      .from("daily_habit_logs")
      .select("id,log_date,completion_percent,workout_completed,steps,water_liters,protein_g,sleep_hours,nutrition_compliance,mindset")
      .eq("user_id", user.id)
      .gte("log_date", sevenDaysAgo.toISOString().slice(0, 10))
      .order("log_date", { ascending: false })
      .limit(7);

    setLoading(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-17-daily-habits.sql in Supabase.`);
      return;
    }

    const logs = data || [];
    setWeekLogs(logs);
    const today = logs.find((log) => log.log_date === habitDate);
    if (today) {
      setForm({
        workout_completed: Boolean(today.workout_completed),
        steps: today.steps ?? "",
        water_liters: today.water_liters ?? "",
        protein_g: today.protein_g ?? "",
        sleep_hours: today.sleep_hours ?? "",
        nutrition_compliance: today.nutrition_compliance || "",
        mindset: today.mindset || {}
      });
    }
  }, [habitDate, user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadHabits();
    });

    return () => {
      alive = false;
    };
  }, [loadHabits]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleMindset(key) {
    setForm((current) => ({
      ...current,
      mindset: { ...(current.mindset || {}), [key]: !current.mindset?.[key] }
    }));
  }

  async function saveHabits() {
    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to save habits.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      user_id: user.id,
      log_date: habitDate,
      completion_percent: dailyScore,
      workout_completed: form.workout_completed,
      steps: numberOrNull(form.steps),
      water_liters: numberOrNull(form.water_liters),
      protein_g: numberOrNull(form.protein_g),
      sleep_hours: numberOrNull(form.sleep_hours),
      nutrition_compliance: form.nutrition_compliance || null,
      mindset: form.mindset || {}
    };

    const { error } = await supabase
      .from("daily_habit_logs")
      .upsert(payload, { onConflict: "user_id,log_date" });

    setSaving(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-17-daily-habits.sql in Supabase.`);
      return;
    }

    setMessage("Habits saved.");
    await loadHabits();
  }

  return (
    <section className="screen-stack habits-screen">
      <div className="screen-heading compact-heading">
        <div>
          <p className="eyebrow">Daily habits</p>
          <h1>Daily <span>Habits</span></h1>
          <p>{formatHabitDate(habitDate)}</p>
        </div>
        <div className="habit-week-score">
          <strong>{weekAverage}%</strong>
          <span>Week avg</span>
        </div>
      </div>

      {message ? <p className={message.includes("Run supabase") ? "form-message error" : "form-message success"}>{message}</p> : null}

      <section className="panel habit-daily-panel">
        <div className="habit-progress-bar">
          <span style={{ width: `${dailyScore}%` }} />
          <strong>{dailyScore}% daily complete</strong>
        </div>

        <div className="habit-section">
          <p className="eyebrow">Mindset</p>
          {mindsetRows.map((row) => (
            <button className={form.mindset?.[row.key] ? "habit-mindset-row done" : "habit-mindset-row"} key={row.key} onClick={() => toggleMindset(row.key)} type="button">
              <span>
                <strong>{row.title}</strong>
                <em>{row.detail}</em>
              </span>
              <small>{form.mindset?.[row.key] ? "Done" : "Open"}</small>
            </button>
          ))}
        </div>

        <div className="habit-section">
          <p className="eyebrow">Health and fitness</p>
          <HabitToggle checked={form.workout_completed} label="Workout complete" onChange={() => updateField("workout_completed", !form.workout_completed)} />
          <HabitInput label="Steps" placeholder="Enter steps" target="10000" value={form.steps} onChange={(value) => updateField("steps", value)} />
          <div className="habit-input-block">
            <div>
              <strong>Water</strong>
              <span>Target 3L</span>
            </div>
            <div className="habit-water-buttons">
              {waterOptions.map((value) => (
                <button className={Number(form.water_liters) === value ? "active" : ""} key={value} onClick={() => updateField("water_liters", value)} type="button">
                  {value}L
                </button>
              ))}
            </div>
          </div>
          <HabitInput label="Protein" placeholder="Enter protein" target="180g" value={form.protein_g} onChange={(value) => updateField("protein_g", value)} />
          <HabitInput label="Sleep" placeholder="Enter sleep" target="8h" value={form.sleep_hours} onChange={(value) => updateField("sleep_hours", value)} />
          <div className="habit-input-block">
            <div>
              <strong>Nutrition compliance</strong>
              <span>How did food go today?</span>
            </div>
            <div className="habit-segment">
              {["yes", "mostly", "no"].map((option) => (
                <button className={form.nutrition_compliance === option ? "active" : ""} key={option} onClick={() => updateField("nutrition_compliance", option)} type="button">
                  {option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="primary-action filled" disabled={saving || loading} onClick={saveHabits} type="button">
          {saving ? "Saving..." : "Save Habits"}
        </button>
      </section>
    </section>
  );
}

function HabitToggle({ checked, label, onChange }) {
  return (
    <button className={checked ? "habit-toggle done" : "habit-toggle"} onClick={onChange} type="button">
      <span>
        <strong>{label}</strong>
        <em>{checked ? "Completed today" : "Open"}</em>
      </span>
      <small>{checked ? "Done" : "Open"}</small>
    </button>
  );
}

function HabitInput({ label, onChange, placeholder, target, value }) {
  return (
    <label className="habit-input-block">
      <div>
        <strong>{label}</strong>
        <span>Target {target}</span>
      </div>
      <input inputMode="decimal" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </label>
  );
}
