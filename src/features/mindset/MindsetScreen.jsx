import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const moodOptions = [
  { value: 5, label: "Great", tone: "great" },
  { value: 4, label: "Good", tone: "good" },
  { value: 3, label: "Okay", tone: "okay" },
  { value: 2, label: "Low", tone: "low" },
  { value: 1, label: "Struggling", tone: "hard" }
];
const supportOptions = ["Confidence", "Consistency", "Self-worth", "Stress", "Grief", "Discipline", "Recovery"];
const defaultResources = [
  {
    id: "fallback-breathe",
    title: "Beyond The Noise",
    category: "Featured podcast",
    description: "A calm mindset reset for pressure, discipline and the moments where training feels heavier than expected.",
    url: "https://www.youtube.com/results?search_query=fitness+mindset+discipline+motivation"
  }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function blankForm() {
  return {
    mood_score: 3,
    mood_note: "",
    support_need: "",
    affirmation: "Be Yourself",
    morning_focus: "",
    reminder_minutes: 15,
    support_tags: [],
    gratitude: "",
    reflection: ""
  };
}

function formatMindsetDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function scoreToMood(score) {
  return moodOptions.find((option) => option.value === Number(score)) || moodOptions[2];
}

export function MindsetScreen({ role = "normal_user", user }) {
  const [form, setForm] = useState(blankForm);
  const [logs, setLogs] = useState([]);
  const [resources, setResources] = useState(defaultResources);
  const [resourceForm, setResourceForm] = useState({ title: "", category: "", description: "", url: "" });
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [savingResource, setSavingResource] = useState(false);
  const [message, setMessage] = useState("");
  const logDate = todayIso();
  const canManageResources = role === "coach" || role === "admin";
  const currentMood = useMemo(() => scoreToMood(form.mood_score), [form.mood_score]);
  const moodStreak = useMemo(() => logs.filter((log) => Number(log.mood_score) >= 3).length, [logs]);

  const loadMindset = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const [logsResponse, resourcesResponse] = await Promise.all([
      supabase
        .from("daily_mindset_logs")
        .select("id,log_date,mood_score,mood_note,support_need,affirmation,morning_focus,reminder_minutes,support_tags,gratitude,reflection")
        .eq("user_id", user.id)
        .order("log_date", { ascending: false })
        .limit(14),
      supabase
        .from("mindset_resources")
        .select("id,title,category,description,url,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(12)
    ]);

    setLoading(false);

    if (logsResponse.error) {
      setMessage(`${logsResponse.error.message}. Run supabase/phase-18-mindset.sql in Supabase.`);
      return;
    }

    const nextLogs = logsResponse.data || [];
    setLogs(nextLogs);
    const today = nextLogs.find((log) => log.log_date === logDate);
    if (today) {
      setForm({
        mood_score: today.mood_score ?? 3,
        mood_note: today.mood_note || "",
        support_need: today.support_need || "",
        affirmation: today.affirmation || "Be Yourself",
        morning_focus: today.morning_focus || "",
        reminder_minutes: today.reminder_minutes ?? 15,
        support_tags: today.support_tags || [],
        gratitude: today.gratitude || "",
        reflection: today.reflection || ""
      });
    }

    if (!resourcesResponse.error && resourcesResponse.data?.length) {
      setResources(resourcesResponse.data);
    }
  }, [logDate, user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (alive) loadMindset();
    });

    return () => {
      alive = false;
    };
  }, [loadMindset]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleTag(tag) {
    setForm((current) => {
      const tags = new Set(current.support_tags || []);
      if (tags.has(tag)) tags.delete(tag);
      else tags.add(tag);
      return { ...current, support_tags: [...tags] };
    });
  }

  async function saveMindset() {
    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to save mindset.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("daily_mindset_logs").upsert({
      user_id: user.id,
      log_date: logDate,
      mood_score: Number(form.mood_score) || 3,
      mood_note: form.mood_note || null,
      support_need: form.support_need || null,
      affirmation: form.affirmation || null,
      morning_focus: form.morning_focus || null,
      reminder_minutes: Number(form.reminder_minutes) || null,
      support_tags: form.support_tags || [],
      gratitude: form.gratitude || null,
      reflection: form.reflection || null
    }, { onConflict: "user_id,log_date" });

    setSaving(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-18-mindset.sql in Supabase.`);
      return;
    }

    setMessage("Mindset saved.");
    await loadMindset();
  }

  async function saveResource(event) {
    event.preventDefault();
    if (!supabase || !canManageResources) return;
    if (!resourceForm.title.trim() || !resourceForm.url.trim()) {
      setMessage("Add a resource title and link.");
      return;
    }

    setSavingResource(true);
    setMessage("");

    const { error } = await supabase.from("mindset_resources").insert({
      title: resourceForm.title.trim(),
      category: resourceForm.category.trim() || "Resource",
      description: resourceForm.description.trim() || null,
      url: resourceForm.url.trim(),
      created_by: user.id
    });

    setSavingResource(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-18-mindset.sql in Supabase.`);
      return;
    }

    setResourceForm({ title: "", category: "", description: "", url: "" });
    setMessage("Resource added.");
    await loadMindset();
  }

  return (
    <section className="screen-stack mindset-screen">
      <div className="mindset-shell">
        <div className="mindset-title">
          <p className="eyebrow">Mindset</p>
          <h1>Daily check-in, support and resources.</h1>
        </div>

        {message ? <p className={message.includes("Run supabase") ? "form-message error" : "form-message success"}>{message}</p> : null}

        <div className="mindset-stat-grid">
          <article>
            <strong>{moodStreak}</strong>
            <span>Mood streak</span>
          </article>
          <article className="gold">
            <strong>{logs.length}</strong>
            <span>Mindset saves</span>
          </article>
        </div>

        <section className="mindset-card mood-card">
          <p className="eyebrow">Mood check-in</p>
          <h2>How are you feeling today?</h2>
          <p>A quick check-in helps you notice patterns before they build up.</p>
          <div className="mood-options">
            {moodOptions.map((option) => (
              <button className={Number(form.mood_score) === option.value ? `active ${option.tone}` : option.tone} key={option.value} onClick={() => updateField("mood_score", option.value)} type="button">
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
          <textarea onChange={(event) => updateField("mood_note", event.target.value)} placeholder="Optional: what's on your mind?" value={form.mood_note} />
        </section>

        <section className="mindset-card support-card">
          <p className="eyebrow">You do not have to sit with this alone.</p>
          <h2>{currentMood.value <= 2 ? "Support may help today" : "You are checking in"}</h2>
          <textarea onChange={(event) => updateField("support_need", event.target.value)} placeholder="What would support look like today?" value={form.support_need} />
        </section>

        <section className="mindset-card affirmation-card">
          <p className="eyebrow">Daily affirmation</p>
          <h2>{form.affirmation || "Be Yourself"}</h2>
          <input onChange={(event) => updateField("affirmation", event.target.value)} placeholder="Personalise your affirmation..." value={form.affirmation} />
        </section>

        <section className="mindset-card resources-card">
          <p className="eyebrow">Resources</p>
          <p>Curated podcasts, videos and support links.</p>
          <div className="resource-list">
            {resources.map((resource) => (
              <article key={resource.id}>
                <span>{resource.category || "Resource"}</span>
                <strong>{resource.title}</strong>
                <p>{resource.description || "Open this resource when you need it."}</p>
                <a href={resource.url} rel="noreferrer" target="_blank">Open Resource</a>
              </article>
            ))}
          </div>
        </section>

        <section className="mindset-card why-card">
          <p className="eyebrow">My why</p>
          <label>
            What gets you up in the morning?
            <input onChange={(event) => updateField("morning_focus", event.target.value)} placeholder="Family, ambition and work" value={form.morning_focus} />
          </label>
          <div>
            <span>How often should we remind you?</span>
            {[5, 15, 30, 60].map((minutes) => (
              <button className={Number(form.reminder_minutes) === minutes ? "active" : ""} key={minutes} onClick={() => updateField("reminder_minutes", minutes)} type="button">
                {minutes} minutes
              </button>
            ))}
          </div>
          <div className="support-tags">
            {supportOptions.map((tag) => (
              <button className={form.support_tags?.includes(tag) ? "active" : ""} key={tag} onClick={() => toggleTag(tag)} type="button">
                {tag}
              </button>
            ))}
          </div>
        </section>

        <section className="mindset-card gratitude-card">
          <p className="eyebrow">Gratitude + journal</p>
          <textarea onChange={(event) => updateField("gratitude", event.target.value)} placeholder="One thing I am grateful for today..." value={form.gratitude} />
          <textarea onChange={(event) => updateField("reflection", event.target.value)} placeholder="A quick thought, reflection, or something I need to get out of my head..." value={form.reflection} />
          <button className="primary-action filled" disabled={saving || loading} onClick={saveMindset} type="button">
            {saving ? "Saving..." : "Save Mindset"}
          </button>
        </section>

        {canManageResources ? (
          <form className="mindset-card resource-editor" onSubmit={saveResource}>
            <p className="eyebrow">Add resource</p>
            <input onChange={(event) => setResourceForm((current) => ({ ...current, title: event.target.value }))} placeholder="Resource title" value={resourceForm.title} />
            <input onChange={(event) => setResourceForm((current) => ({ ...current, category: event.target.value }))} placeholder="Podcast, video, article..." value={resourceForm.category} />
            <input onChange={(event) => setResourceForm((current) => ({ ...current, url: event.target.value }))} placeholder="YouTube or website link" value={resourceForm.url} />
            <textarea onChange={(event) => setResourceForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short description" value={resourceForm.description} />
            <button className="primary-action filled" disabled={savingResource} type="submit">
              {savingResource ? "Adding..." : "Add Resource"}
            </button>
          </form>
        ) : null}

        <section className="mindset-card mood-history-card">
          <div>
            <p className="eyebrow">Mood history</p>
            <span>Last 7</span>
          </div>
          <div className="mood-history-list">
            {logs.slice(0, 7).map((log) => (
              <article className={scoreToMood(log.mood_score).tone} key={log.id}>
                <strong>{scoreToMood(log.mood_score).label}</strong>
                <span>{formatMindsetDate(log.log_date)}</span>
              </article>
            ))}
            {!logs.length ? <p className="compact-help">No mindset logs yet.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
