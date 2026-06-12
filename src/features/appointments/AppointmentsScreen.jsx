import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const itemTypes = ["appointment", "task", "reminder", "checkin"];

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

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function missingExclusionTableMessage() {
  return "Single-date delete needs supabase/phase-34-calendar-checkin-deletes.sql. Use Delete future for now, or run the SQL to delete only this date.";
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
    time: "09:00",
    recurrence_frequency: "none",
    recurrence_until: selectedDate
  };
}

function expandCalendarItems(items, days, exclusionsByItem) {
  const visibleDays = new Set(days.map((day) => day.key));
  const expanded = [];

  for (const item of items) {
    const startDate = localDateKey(new Date(item.starts_at));
    const recurrenceUntil = item.recurrence_until || startDate;
    const excludedDates = exclusionsByItem[item.id] || new Set();
    if (item.item_type !== "checkin" || item.recurrence_frequency !== "weekly") {
      if (visibleDays.has(startDate) && !excludedDates.has(startDate)) expanded.push({ ...item, occurrence_date: startDate, occurrence_key: item.id });
      continue;
    }

    let nextDate = new Date(`${startDate}T00:00:00`);
    const endDate = new Date(`${recurrenceUntil}T00:00:00`);
    while (nextDate <= endDate) {
      const key = localDateKey(nextDate);
      if (visibleDays.has(key) && !excludedDates.has(key)) {
        expanded.push({ ...item, starts_at: `${key}T${new Date(item.starts_at).toTimeString().slice(0, 8)}`, occurrence_date: key, occurrence_key: `${item.id}-${key}` });
      }
      nextDate.setDate(nextDate.getDate() + 7);
    }
  }

  return expanded;
}

export function AppointmentsScreen({ user }) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [clients, setClients] = useState([]);
  const [items, setItems] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [form, setForm] = useState(() => blankForm(localDateKey(new Date())));
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [checkinDeleteReady, setCheckinDeleteReady] = useState(true);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const days = useMemo(() => buildMonthDays(monthDate), [monthDate]);
  const exclusionsByItem = useMemo(() => {
    return exclusions.reduce((grouped, exclusion) => {
      if (!grouped[exclusion.calendar_item_id]) grouped[exclusion.calendar_item_id] = new Set();
      grouped[exclusion.calendar_item_id].add(exclusion.occurrence_date);
      return grouped;
    }, {});
  }, [exclusions]);
  const calendarItems = useMemo(() => expandCalendarItems(items, days, exclusionsByItem), [days, exclusionsByItem, items]);
  const itemsByDay = useMemo(() => {
    return calendarItems.reduce((grouped, item) => {
      const key = item.occurrence_date || localDateKey(new Date(item.starts_at));
      grouped[key] = [...(grouped[key] || []), item];
      return grouped;
    }, {});
  }, [calendarItems]);
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
      const visibleStart = days[0]?.key || localDateKey(start);
      const visibleEnd = days[days.length - 1]?.key || localDateKey(end);
      const [clientResult, itemResult, exclusionResult] = await Promise.all([
        supabase.rpc("get_my_coach_clients"),
        supabase
          .from("coach_calendar_items")
          .select("id,item_type,title,notes,starts_at,ends_at,status,client_id,recurrence_frequency,recurrence_until,profiles:client_id(full_name,email)")
          .eq("coach_id", user.id)
          .lte("starts_at", end.toISOString())
          .or(`recurrence_until.is.null,recurrence_until.gte.${localDateKey(start)}`)
          .order("starts_at", { ascending: true }),
        supabase
          .from("coach_calendar_item_exclusions")
          .select("calendar_item_id,occurrence_date")
          .eq("coach_id", user.id)
          .gte("occurrence_date", visibleStart)
          .lte("occurrence_date", visibleEnd)
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

      if (exclusionResult.error) {
        setExclusions([]);
        setCheckinDeleteReady(false);
      } else {
        setCheckinDeleteReady(true);
        setExclusions(exclusionResult.data || []);
      }
    });

    return () => {
      alive = false;
    };
  }, [calendarRefreshKey, days, monthDate, user.id]);

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
    if (form.item_type === "checkin" && !form.client_id) {
      setMessage("Choose a client for the check-in.");
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
      starts_at: startsAt.toISOString(),
      recurrence_frequency: form.item_type === "checkin" ? form.recurrence_frequency : "none",
      recurrence_until: form.item_type === "checkin" && form.recurrence_frequency === "weekly" ? form.recurrence_until : null
    });
    setSaving(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-29-calendar-admin-summaries.sql in Supabase.`);
      return;
    }

    setMessage("Calendar item saved.");
    setForm(blankForm(form.date));
    setCalendarRefreshKey((current) => current + 1);
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

  async function deleteCheckinOccurrence(item) {
    if (!supabase || user.id === "demo-user") return;
    if (item.item_type !== "checkin") return;
    if ((item.occurrence_date || selectedDate) < localDateKey(new Date())) {
      setMessage("Only future check-ins can be deleted from the calendar.");
      return;
    }

    const occurrenceDate = item.occurrence_date || localDateKey(new Date(item.starts_at));
    const confirmed = window.confirm(`Delete this check-in on ${occurrenceDate}?`);
    if (!confirmed) return;

    setMessage("");

    if (item.recurrence_frequency === "weekly") {
      if (!checkinDeleteReady) {
        setMessage(missingExclusionTableMessage());
        return;
      }

      const { error } = await supabase.from("coach_calendar_item_exclusions").upsert(
        {
          calendar_item_id: item.id,
          coach_id: user.id,
          client_id: item.client_id,
          occurrence_date: occurrenceDate,
          reason: "coach_deleted"
        },
        { onConflict: "calendar_item_id,occurrence_date" }
      );

      if (error) {
        setMessage(`${error.message}. Run supabase/phase-34-calendar-checkin-deletes.sql in Supabase.`);
        return;
      }
    } else {
      const { error } = await supabase
        .from("coach_calendar_items")
        .update({ status: "cancelled" })
        .eq("id", item.id)
        .eq("coach_id", user.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Check-in date deleted.");
    setCalendarRefreshKey((current) => current + 1);
  }

  async function deleteFutureCheckins(item) {
    if (!supabase || user.id === "demo-user") return;
    if (item.item_type !== "checkin") return;
    const fromDate = item.occurrence_date || localDateKey(new Date(item.starts_at));
    if (fromDate < localDateKey(new Date())) {
      setMessage("Only future check-ins can be deleted from the calendar.");
      return;
    }

    const confirmed = window.confirm(`Delete this check-in and all future check-ins from ${fromDate}?`);
    if (!confirmed) return;

    setMessage("");
    const startDate = localDateKey(new Date(item.starts_at));
    let query = supabase.from("coach_calendar_items").update({ status: "cancelled" }).eq("id", item.id).eq("coach_id", user.id);

    if (item.recurrence_frequency === "weekly" && fromDate > startDate) {
      query = supabase
        .from("coach_calendar_items")
        .update({ recurrence_until: addDays(fromDate, -1) })
        .eq("id", item.id)
        .eq("coach_id", user.id);
    }

    const { error } = await query;

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Future check-ins deleted.");
    setCalendarRefreshKey((current) => current + 1);
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

      {message ? <p className={message.includes("saved") || message.includes("deleted") ? "form-message success" : "form-message error"}>{message}</p> : null}
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
                {dayItems.slice(0, 3).map((item) => <i className={item.item_type} key={item.occurrence_key || item.id} />)}
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
            <article className={item.status === "done" ? "calendar-item done" : "calendar-item"} key={item.occurrence_key || item.id}>
              <div>
                <span>{item.item_type} - {timeLabel(item.starts_at)}</span>
                <strong>{item.title}</strong>
                {item.profiles?.full_name ? <em>{item.profiles.full_name}</em> : null}
                {item.item_type === "checkin" && item.recurrence_frequency === "weekly" ? <em>Weekly until {item.recurrence_until}</em> : null}
                {item.notes ? <p>{item.notes}</p> : null}
              </div>
              <div className="calendar-item-actions">
                <button className="primary-action compact" onClick={() => markDone(item)} type="button">
                  {item.status === "done" ? "Undo" : "Done"}
                </button>
                {item.item_type === "checkin" && item.occurrence_date >= localDateKey(new Date()) ? (
                  <>
                    <button className="danger-link" onClick={() => deleteCheckinOccurrence(item)} type="button">Delete date</button>
                    <button className="danger-link" onClick={() => deleteFutureCheckins(item)} type="button">Delete future</button>
                  </>
                ) : null}
              </div>
            </article>
          )) : <p className="compact-help">No appointments, tasks or reminders for this day.</p>}
        </section>

        <form className="panel calendar-form" onSubmit={saveItem}>
          <p className="eyebrow">Add item</p>
          <label>
            Type
            <select
              value={form.item_type}
              onChange={(event) => {
                const itemType = event.target.value;
                setForm((current) => ({
                  ...current,
                  item_type: itemType,
                  title: itemType === "checkin" && !current.title ? "Coach check-in" : current.title,
                  recurrence_frequency: itemType === "checkin" ? "weekly" : "none"
                }));
              }}
            >
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
            <textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder={form.item_type === "checkin" ? "Questions or focus for the client check-in..." : "Optional detail"} />
          </label>
          {form.item_type === "checkin" ? (
            <div className="form-grid two">
              <label>
                Repeat
                <select value={form.recurrence_frequency} onChange={(event) => updateForm("recurrence_frequency", event.target.value)}>
                  <option value="none">Once</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label>
                End date
                <input type="date" value={form.recurrence_until} onChange={(event) => updateForm("recurrence_until", event.target.value)} disabled={form.recurrence_frequency !== "weekly"} />
              </label>
            </div>
          ) : null}
          <button className="primary-action filled" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save item"}
          </button>
        </form>
      </div>
    </section>
  );
}
