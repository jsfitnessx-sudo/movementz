import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const moodOptions = [
  { value: 5, emoji: "\u{1F60A}", label: "Great", tone: "great" },
  { value: 4, emoji: "\u{1F642}", label: "Good", tone: "good" },
  { value: 3, emoji: "\u{1F610}", label: "Okay", tone: "okay" },
  { value: 2, emoji: "\u{1F61F}", label: "Low", tone: "low" },
  { value: 1, emoji: "\u{1F623}", label: "Struggling", tone: "hard" }
];
const affirmationThemes = ["Confidence", "Consistency", "Self-worth", "Stress", "Grief", "Discipline", "Recovery"];
const reminderHorizons = [3, 6, 9, 12];
const resourceTypes = ["Featured", "Video", "Article", "Podcast", "Support"];
const affirmations = {
  Confidence: ["I can handle today with courage.", "I trust myself to take the next step.", "I am allowed to take up space."],
  Consistency: ["Small actions repeated become strength.", "I do not need perfect. I need present.", "I can keep promises to myself today."],
  "Self-worth": ["I am enough before I achieve anything.", "My value is not measured by one hard day.", "I deserve care, patience and respect."],
  Stress: ["I can slow down and still move forward.", "One breath, one choice, one step.", "I can respond calmly instead of rushing."],
  Grief: ["I can carry love and still keep living.", "My feelings can be real without taking over.", "I give myself permission to move gently."],
  Discipline: ["Discipline is choosing the future I said I wanted.", "I do the next right thing.", "My standards guide me when motivation is quiet."],
  Recovery: ["Rest is part of progress.", "My body grows when I respect it.", "Recovery is productive."]
};
const defaultResources = [
  {
    id: "fallback-breathe",
    title: "Beyond The Noise",
    category: "Featured",
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
    weekly_focus: "",
    affirmation_themes: ["Confidence", "Consistency"],
    gratitude: "",
    reflection: ""
  };
}

function formatMindsetDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function dueDateFromMonths(months) {
  const due = new Date();
  due.setMonth(due.getMonth() + Number(months));
  return due.toISOString().slice(0, 10);
}

function scoreToMood(score) {
  return moodOptions.find((option) => option.value === Number(score)) || moodOptions[2];
}

function pickDailyAffirmation(themes) {
  const selected = themes?.length ? themes : ["Confidence"];
  const pool = selected.flatMap((theme) => affirmations[theme] || []);
  const options = pool.length ? pool : affirmations.Confidence;
  const dayNumber = Math.floor(new Date(`${todayIso()}T00:00:00`).getTime() / 86400000);
  return options[dayNumber % options.length];
}

function resourceIcon(category = "") {
  const value = category.toLowerCase();
  if (value.includes("video")) return "\u25B6";
  if (value.includes("article")) return "A";
  if (value.includes("podcast")) return "P";
  if (value.includes("support")) return "S";
  return "\u2605";
}

export function MindsetScreen({ role = "normal_user", user }) {
  const [form, setForm] = useState(blankForm);
  const [logs, setLogs] = useState([]);
  const [resources, setResources] = useState(defaultResources);
  const [resourceViewOpen, setResourceViewOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title: "", category: "Video", description: "", url: "" });
  const [reminders, setReminders] = useState([]);
  const [selectedHorizon, setSelectedHorizon] = useState(3);
  const [futureText, setFutureText] = useState("");
  const [allowSupportAlerts, setAllowSupportAlerts] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [savingResource, setSavingResource] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [message, setMessage] = useState("");
  const logDate = todayIso();
  const canManageResources = role === "coach" || role === "admin";
  const moodStreak = useMemo(() => logs.filter((log) => Number(log.mood_score) >= 3).length, [logs]);
  const strugglingStreak = useMemo(() => {
    let streak = 0;
    for (const log of logs) {
      if (Number(log.mood_score) !== 1) break;
      streak += 1;
    }
    return streak;
  }, [logs]);
  const dailyAffirmation = useMemo(() => pickDailyAffirmation(form.affirmation_themes), [form.affirmation_themes]);
  const selectedReminder = reminders.find((reminder) => Number(reminder.horizon_months) === Number(selectedHorizon));
  const dueReminders = reminders.filter((reminder) => reminder.status === "hidden" && reminder.due_date <= logDate && reminder.message);

  const loadMindset = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const [logsResponse, resourcesResponse, remindersResponse] = await Promise.all([
      supabase
        .from("daily_mindset_logs")
        .select("id,log_date,mood_score,mood_note,support_need,weekly_focus,affirmation_themes,gratitude,reflection")
        .eq("user_id", user.id)
        .order("log_date", { ascending: false })
        .limit(14),
      supabase
        .from("mindset_resources")
        .select("id,title,category,description,url,thumbnail_url,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("mindset_future_reminders")
        .select("id,horizon_months,message,due_date,status,created_at")
        .eq("user_id", user.id)
        .order("horizon_months", { ascending: true })
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
        weekly_focus: today.weekly_focus || "",
        affirmation_themes: today.affirmation_themes?.length ? today.affirmation_themes : ["Confidence", "Consistency"],
        gratitude: today.gratitude || "",
        reflection: today.reflection || ""
      });
    }

    if (!resourcesResponse.error && resourcesResponse.data?.length) setResources(resourcesResponse.data);
    if (!remindersResponse.error) {
      const nextReminders = remindersResponse.data || [];
      setReminders(nextReminders);
      setFutureText(nextReminders.find((reminder) => Number(reminder.horizon_months) === selectedHorizon)?.message || "");
    }
  }, [logDate, selectedHorizon, user.id]);

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

  function toggleTheme(theme) {
    setForm((current) => {
      const themes = new Set(current.affirmation_themes || []);
      if (themes.has(theme)) themes.delete(theme);
      else themes.add(theme);
      return { ...current, affirmation_themes: [...themes] };
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
      weekly_focus: form.weekly_focus || null,
      affirmation: dailyAffirmation,
      affirmation_themes: form.affirmation_themes || [],
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

  async function saveFutureReminder(skipped = false) {
    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to save reminders.");
      return;
    }
    if (!skipped && !futureText.trim()) {
      setMessage(`Write your ${selectedHorizon}-month reminder or choose N/A.`);
      return;
    }

    setSavingReminder(true);
    setMessage("");

    const { error } = await supabase.from("mindset_future_reminders").upsert({
      user_id: user.id,
      horizon_months: selectedHorizon,
      message: skipped ? null : futureText.trim(),
      due_date: dueDateFromMonths(selectedHorizon),
      status: skipped ? "skipped" : "hidden"
    }, { onConflict: "user_id,horizon_months" });

    setSavingReminder(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-18-mindset.sql in Supabase.`);
      return;
    }

    setMessage(skipped ? "Reminder marked N/A." : `Your ${selectedHorizon}-month reminder is hidden until it is due.`);
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
      thumbnail_url: null,
      created_by: user.id
    });

    setSavingResource(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-18-mindset.sql in Supabase.`);
      return;
    }

    setResourceForm({ title: "", category: "Video", description: "", url: "" });
    setMessage("Resource added.");
    await loadMindset();
  }

  async function markReminderShown(reminderId) {
    if (!supabase || user.id === "demo-user") return;
    setMessage("");
    const { error } = await supabase
      .from("mindset_future_reminders")
      .update({ status: "shown" })
      .eq("id", reminderId)
      .eq("user_id", user.id);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-18-mindset.sql in Supabase.`);
      return;
    }

    await loadMindset();
  }

  if (resourceViewOpen) {
    return (
      <ResourcesLibrary
        canManageResources={canManageResources}
        onBack={() => setResourceViewOpen(false)}
        onResourceForm={setResourceForm}
        onSaveResource={saveResource}
        resourceForm={resourceForm}
        resources={resources}
        savingResource={savingResource}
      />
    );
  }

  return (
    <section className="screen-stack mindset-screen">
      <div className="mindset-shell">
        <div className="mindset-title">
          <p className="eyebrow">Mindset</p>
          <h1>Daily check-in, support and resources.</h1>
        </div>

        {message ? <p className={message.includes("Run supabase") ? "form-message error" : "form-message success"}>{message}</p> : null}

        {dueReminders.length ? (
          <section className="mindset-card due-reminder-card">
            <p className="eyebrow">Future self reminder</p>
            {dueReminders.map((reminder) => (
              <article key={reminder.id}>
                <span>{reminder.horizon_months} months ago you wrote</span>
                <strong>{reminder.message}</strong>
                <button className="primary-action compact" onClick={() => markReminderShown(reminder.id)} type="button">Mark seen</button>
              </article>
            ))}
          </section>
        ) : null}

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
                <span aria-hidden="true">{option.emoji}</span>
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
          <textarea onChange={(event) => updateField("mood_note", event.target.value)} placeholder="Optional: what's on your mind?" value={form.mood_note} />
        </section>

        {strugglingStreak >= 5 ? (
          <section className="mindset-card support-card">
            <p className="eyebrow">You do not have to sit with this alone.</p>
            <h2>You have logged several hard days.</h2>
            <p>If you need immediate help or feel unsafe, contact local emergency services or a crisis support line now.</p>
            <div className="support-actions">
              <button className="primary-action filled" type="button">Message coach</button>
              <button className="primary-action" onClick={() => setResourceViewOpen(true)} type="button">Support resources</button>
            </div>
            <label className="support-alert-toggle">
              <input checked={allowSupportAlerts} onChange={(event) => setAllowSupportAlerts(event.target.checked)} type="checkbox" />
              Allow future support alerts if I log low mood several days in a row.
            </label>
            <textarea onChange={(event) => updateField("support_need", event.target.value)} placeholder="What would support look like today?" value={form.support_need} />
          </section>
        ) : null}

        <section className="mindset-card affirmation-card">
          <p className="eyebrow">Daily affirmation</p>
          <h2>{dailyAffirmation}</h2>
          <p>Personalised from your selected themes.</p>
          <div className="support-tags">
            {affirmationThemes.map((theme) => (
              <button className={form.affirmation_themes?.includes(theme) ? "active" : ""} key={theme} onClick={() => toggleTheme(theme)} type="button">
                {form.affirmation_themes?.includes(theme) ? "\u2713 " : ""}{theme}
              </button>
            ))}
          </div>
        </section>

        <section className="mindset-card resources-card">
          <p className="eyebrow">Resources</p>
          <p>Curated videos, articles, podcasts and support links.</p>
          <button className="primary-action filled" onClick={() => setResourceViewOpen(true)} type="button">Open Resource Library</button>
        </section>

        <section className="mindset-card why-card">
          <p className="eyebrow">Personal focus</p>
          <label>
            What is your personal focus for the week?
            <input onChange={(event) => updateField("weekly_focus", event.target.value)} placeholder="This week's focus..." value={form.weekly_focus} />
          </label>
          <div className="future-reminder-head">
            <strong>Future self reminders</strong>
            <span>Hidden until due</span>
          </div>
          <div className="future-reminder-tabs">
            {reminderHorizons.map((months) => (
              <button
                className={Number(selectedHorizon) === months ? "active" : ""}
                key={months}
                onClick={() => {
                  setSelectedHorizon(months);
                  setFutureText(reminders.find((reminder) => Number(reminder.horizon_months) === months)?.message || "");
                }}
                type="button"
              >
                {months} months
              </button>
            ))}
          </div>
          <label>
            Where do you want to be in {selectedHorizon} months?
            <textarea disabled={selectedReminder?.status === "hidden"} onChange={(event) => setFutureText(event.target.value)} placeholder="Write it, then METZ will hide it and bring it back on the date." value={futureText} />
          </label>
          <div className="future-reminder-actions">
            <button className="primary-action filled" disabled={savingReminder || selectedReminder?.status === "hidden"} onClick={() => saveFutureReminder(false)} type="button">Save + hide</button>
            <button className="primary-action" disabled={savingReminder} onClick={() => saveFutureReminder(true)} type="button">N/A</button>
          </div>
        </section>

        <section className="mindset-card gratitude-card">
          <p className="eyebrow">Gratitude + journal</p>
          <textarea onChange={(event) => updateField("gratitude", event.target.value)} placeholder="One gratitude to show on Home today..." value={form.gratitude} />
          <textarea onChange={(event) => updateField("reflection", event.target.value)} placeholder="A quick thought, reflection, or something I need to get out of my head..." value={form.reflection} />
          <button className="primary-action filled" disabled={saving || loading} onClick={saveMindset} type="button">
            {saving ? "Saving..." : "Save Mindset"}
          </button>
        </section>

        <section className="mindset-card mood-history-card">
          <div>
            <p className="eyebrow">Mood history</p>
            <span>Last 7</span>
          </div>
          <div className="mood-history-list">
            {logs.slice(0, 7).map((log) => (
              <article className={scoreToMood(log.mood_score).tone} key={log.id}>
                <strong>{scoreToMood(log.mood_score).emoji}</strong>
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

function ResourcesLibrary({ canManageResources, onBack, onResourceForm, onSaveResource, resourceForm, resources, savingResource }) {
  const groupedResources = resourceTypes.map((type) => ({
    type,
    resources: resources.filter((resource) => (resource.category || "Featured").toLowerCase().includes(type.toLowerCase()))
  }));

  return (
    <section className="screen-stack mindset-screen">
      <div className="mindset-shell resource-library-shell">
        <div className="mindset-title resource-library-title">
          <p className="eyebrow">Resources</p>
          <h1>Videos, articles, podcasts and support links.</h1>
          <button className="primary-action compact" onClick={onBack} type="button">Back</button>
        </div>

        {groupedResources.map((group) => (
          <section className="mindset-card resource-category-panel" key={group.type}>
            <p className="eyebrow">{group.type}</p>
            <div className="resource-grid">
              {(group.resources.length ? group.resources : resources.slice(0, group.type === "Featured" ? 4 : 0)).map((resource) => (
                <article className="resource-library-card" key={`${group.type}-${resource.id}`}>
                  <div className="resource-thumb">{resource.thumbnail_url ? <img alt="" src={resource.thumbnail_url} /> : <span>{resourceIcon(resource.category)}</span>}</div>
                  <div>
                    <span>{resource.category || group.type}</span>
                    <strong>{resource.title}</strong>
                    <p>{resource.description || "Open this resource when you need it."}</p>
                    <a href={resource.url} rel="noreferrer" target="_blank">Open</a>
                  </div>
                </article>
              ))}
              {!group.resources.length && group.type !== "Featured" ? <p className="compact-help">No {group.type.toLowerCase()} resources yet.</p> : null}
            </div>
          </section>
        ))}

        {canManageResources ? (
          <form className="mindset-card resource-editor" onSubmit={onSaveResource}>
            <p className="eyebrow">Admin resource upload</p>
            <input onChange={(event) => onResourceForm((current) => ({ ...current, title: event.target.value }))} placeholder="Resource title" value={resourceForm.title} />
            <select onChange={(event) => onResourceForm((current) => ({ ...current, category: event.target.value }))} value={resourceForm.category}>
              {resourceTypes.filter((type) => type !== "Featured").map((type) => <option key={type}>{type}</option>)}
            </select>
            <input onChange={(event) => onResourceForm((current) => ({ ...current, url: event.target.value }))} placeholder="YouTube or website link" value={resourceForm.url} />
            <textarea onChange={(event) => onResourceForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short summary" value={resourceForm.description} />
            <button className="primary-action filled" disabled={savingResource} type="submit">
              {savingResource ? "Adding..." : "Add Resource"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
