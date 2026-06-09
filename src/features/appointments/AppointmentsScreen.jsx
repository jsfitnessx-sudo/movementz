import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const itemTypes = ["appointment", "task", "reminder"];

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function timeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function buildMonthDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const startOffset = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: day,
      key: localDateKey(day),
      inMonth: day.getMonth() === date.getMonth()
    };
  });
}

function blankForm(selectedDate) {
  return {
    item_type: "appointment",
    client_id: "",
    title: "",
    notes: "",
    date: selectedDate,
    time: "09:00"
  };
}

export function AppointmentsScreen({ user }) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [clients, setClients] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => blankForm(localDateKey(new Date())));
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const days = useMemo(() => buildMonthDays(monthDate), [monthDate]);
  const itemsByDay = useMemo(() => {
    return items.reduce((grouped, item) => {
      const key = localDateKey(new Date(item.starts_at));
      grouped[key] = [...(grouped[key] || []), item];
      return grouped;
    }, {});
  }, [items]);
  const selectedItems = itemsByDay[selectedDate] || [];

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(async () => {
      if (!supabase || user.id === "demo-user") {
        if (alive) setLoading(false);
        return;
      }

      setLoading(true);
      setMessage("");

      const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const [clientResult, itemResult] = await Promise.all([
        supabase.rpc("get_my_coach_clients"),
        supabase
          .from("coach_calendar_items")
          .select("id,item_type,title,notes,starts_at,ends_at,status,client_id,profiles:client_id(full_name,email)")
          .eq("coach_id", user.id)
          .gte("starts_at", start.toISOString())
          .lt("starts_at", end.toISOString())
          .order("starts_at", { ascending: true })
      ]);

      if (!alive) return;
      setLoading(false);

      if (clientResult.error) {
        setMessage(`${clientResult.error.message}. Run supabase/phase-7-coach-client-links.sql in Supabase.`);
      } else {
        setClients(clientResult.data || []);
      }

      if (itemResult.error) {
        setMessage(`${itemResult.error.message}. Run supabase/phase-29-calendar-admin-summaries.sql in Supabase.`);
        setItems([]);
      } else {
        setItems(itemResult.data || []);
      }
    });

    return () => {
      alive = false;
    };
  }, [monthDate, user.id]);

  function changeMonth(direction) {
    const next = new Date(monthDate);
    next.setMonth(monthDate.getMonth() + direction);
    setMonthDate(next);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to save calendar items.");
      return;
    }
    if (!form.title.trim()) {
      setMessage("Add a title first.");
      return;
    }

    setSaving(true);
    setMessage("");
    const startsAt = new Date(`${form.date}T${form.time || "09:00"}`);
    const { error } = await supabase.from("coach_calendar_items").insert({
      coach_id: user.id,
      client_id: form.client_id || null,
      item_type: form.item_type,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      starts_at: startsAt.toISOString()
    });
    setSaving(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-29-calendar-admin-summaries.sql in Supabase.`);
      return;
    }

    setMessage("Calendar item saved.");
    setForm(blankForm(form.date));
    const refreshMonth = new Date(monthDate);
    setMonthDate(new Date(refreshMonth));
  }

  async function markDone(item) {
    if (!supabase || user.id === "demo-user") return;
    const { error } = await supabase
      .from("coach_calendar_items")
      .update({ status: item.status === "done" ? "scheduled" : "done" })
      .eq("id", item.id)
      .eq("coach_id", user.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: item.status === "done" ? "scheduled" : "done" } : entry));
  }

  return (
    <section className="screen-stack appointments-screen">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Coach calendar</p>
          <h1>Appointments</h1>
          <p>Book clients, reminders and tasks into your month.</p>
        </div>
      </div>

      {message ? <p className={message.includes("saved") ? "form-message success" : "form-message error"}>{message}</p> : null}
      {loading ? <p className="form-message success">Loading calendar...</p> : null}

      <section className="panel calendar-panel">
        <div className="calendar-head">
          <button className="icon-button" onClick={() => changeMonth(-1)} type="button" aria-label="Previous month">&lt;</button>
          <h2>{monthLabel(monthDate)}</h2>
          <button className="icon-button" onClick={() => changeMonth(1)} type="button" aria-label="Next month">&gt;</button>
        </div>
        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const dayItems = itemsByDay[day.key] || [];
            return (
              <button
                className={`${day.inMonth ? "" : "muted"} ${selectedDate === day.key ? "active" : ""}`.trim()}
                key={day.key}
                onClick={() => {
                  setSelectedDate(day.key);
                  setForm((current) => ({ ...current, date: day.key }));
                }}
                type="button"
              >
                <strong>{day.date.getDate()}</strong>
                {dayItems.slice(0, 3).map((item) => <i className={item.item_type} key={item.id} />)}
              </button>
            );
          })}
        </div>
      </section>

      <div className="calendar-detail-grid">
        <section className="panel day-detail-panel">
          <div className="section-row">
            <div>
              <p className="eyebrow">Selected day</p>
              <h2>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h2>
            </div>
            <span className="status-pill">{selectedItems.length}</span>
          </div>
          {selectedItems.length ? selectedItems.map((item) => (
            <article className={item.status === "done" ? "calendar-item done" : "calendar-item"} key={item.id}>
              <div>
                <span>{item.item_type} - {timeLabel(item.starts_at)}</span>
                <strong>{item.title}</strong>
                {item.profiles?.full_name ? <em>{item.profiles.full_name}</em> : null}
                {item.notes ? <p>{item.notes}</p> : null}
              </div>
              <button className="primary-action compact" onClick={() => markDone(item)} type="button">
                {item.status === "done" ? "Undo" : "Done"}
              </button>
            </article>
          )) : <p className="compact-help">No appointments, tasks or reminders for this day.</p>}
        </section>

        <form className="panel calendar-form" onSubmit={saveItem}>
          <p className="eyebrow">Add item</p>
          <label>
            Type
            <select value={form.item_type} onChange={(event) => updateForm("item_type", event.target.value)}>
              {itemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Client
            <select value={form.client_id} onChange={(event) => updateForm("client_id", event.target.value)}>
              <option value="">No client</option>
              {clients.map((client) => <option key={client.client_id} value={client.client_id}>{client.client_name}</option>)}
            </select>
          </label>
          <div className="form-grid two">
            <label>
              Date
              <input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} />
            </label>
            <label>
              Time
              <input type="time" value={form.time} onChange={(event) => updateForm("time", event.target.value)} />
            </label>
          </div>
          <label>
            Title
            <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Session, check-in, reminder..." />
          </label>
          <label>
            Notes
            <textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Optional detail" />
          </label>
          <button className="primary-action filled" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save item"}
          </button>
        </form>
      </div>
    </section>
  );
}
