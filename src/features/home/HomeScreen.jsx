import { useEffect, useState } from "react";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { hasFullUserAccess } from "../../lib/access/paidAccess.js";
import { supabase } from "../../lib/supabase/client.js";

const archivedRetentionDays = 30;
const achievementRules = [
  { id: "first-workout", label: "First Workout", test: (data) => data.monthWorkoutCount >= 1 },
  { id: "three-week", label: "3 This Week", test: (data) => data.weekWorkoutCount >= 3 },
  { id: "mood-check", label: "Mood Check-In", test: (data) => data.todayMoodScore > 0 },
  { id: "habits", label: "Habit Log", test: (data) => data.habitsTodayPercent > 0 },
  { id: "active-plan", label: "Active Plan", test: (data) => data.activePlanCount > 0 }
];

const blankHomeData = {
  weeklyFocus: "",
  gratitude: "",
  gratitudeLog: [],
  futureReminders: [],
  moodStreak: 0,
  todayMoodScore: 0,
  habitsTodayPercent: 0,
  weekWorkoutCount: 0,
  monthWorkoutCount: 0,
  activePlanCount: 0,
  sessionsCompletedWeek: 0,
  sessionsCompletedToday: 0,
  sessionsScheduledToday: 0,
  foodLoggedToday: 0,
  checkinsDueToday: 0,
  checkinsSubmittedToday: 0,
  todaySessions: [],
  achievementsUnlocked: 0,
  nextBadges: []
};

const blankCoachHomeData = {
  stats: {
    struggle_moods_week: 0,
    low_moods_week: 0,
    client_workouts_today: 0,
    habit_logging_today: 0,
    habit_compliant_today: 0,
    total_clients: 0,
    new_clients_week: 0,
    lost_clients: 0
  },
  affirmation: "Be Yourself",
  due_soon: [],
  activity: []
};

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getPlanWindow(plan, assignedAt) {
  const start = new Date(plan.created_at || assignedAt || Date.now());
  if (Number.isNaN(start.getTime()) || plan.plan_type !== "block") {
    return { start, end: null, status: "active" };
  }

  const end = addDays(start, (Number(plan.block_weeks) || 4) * 7);
  const archiveUntil = addDays(end, archivedRetentionDays);
  const now = new Date();

  if (now <= end) return { start, end, status: "active" };
  if (now <= archiveUntil) return { start, end, status: "archived" };
  return { start, end, status: "expired" };
}

function normalisePlan(assignment, source) {
  const plan = source === "assigned" ? assignment.plan || {} : assignment;
  return {
    assignedAt: assignment.assigned_at || plan.created_at,
    plan,
    source,
    window: getPlanWindow(plan, assignment.assigned_at)
  };
}

function formatTodayDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

function countMoodStreak(logs) {
  let streak = 0;
  for (const log of logs) {
    if (!log.mood_score) break;
    streak += 1;
  }
  return streak;
}

function buildScheduledSessions(ownPlans, assignedPlans) {
  const selectedDay = new Date().toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
  const activePlans = [
    ...ownPlans.map((plan) => normalisePlan(plan, "own")),
    ...assignedPlans.map((assignment) => normalisePlan(assignment, "assigned"))
  ].filter((entry) => entry.window.status === "active" && entry.plan.status !== "archived");

  const sessions = activePlans.flatMap((entry) => {
    const plan = entry.plan;
    return (plan.training_plan_workouts || [])
      .filter((workout) => {
        const days = Array.isArray(workout.scheduled_days) ? workout.scheduled_days : [];
        return days.includes(selectedDay);
      })
      .map((workout) => ({
        id: workout.id || `${plan.id}-${workout.position}`,
        name: workout.name || "Scheduled workout",
        planName: plan.name || (entry.source === "assigned" ? "Coach plan" : "My plan"),
        summary: workout.summary || workout.workout_type || "Workout",
        source: entry.source,
        exerciseCount: Array.isArray(workout.exercises) ? workout.exercises.length : null,
        position: workout.position || 0
      }));
  });

  return {
    activePlanCount: activePlans.length,
    todaySessions: sessions.sort((a, b) => a.position - b.position)
  };
}

function calculateAchievements(data) {
  const unlocked = achievementRules.filter((rule) => rule.test(data));
  const nextBadges = achievementRules.filter((rule) => !rule.test(data)).slice(0, 3).map((rule) => rule.label);
  return {
    achievementsUnlocked: unlocked.length,
    nextBadges
  };
}

function formatActivityDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function coachInitial(name) {
  return (name || "M").trim().slice(0, 1).toUpperCase();
}

function activityBadge(type) {
  if (type === "pr") return "PR";
  if (type === "mood") return "Mood";
  if (type === "habit") return "Habit";
  if (type === "checkin") return "Check-in";
  return "Workout";
}

function buildTodayChecklist(data) {
  const dueReminders = data.futureReminders.filter((reminder) => reminder.due_date && reminder.due_date <= isoDate(new Date()));
  const workoutTitle = data.sessionsScheduledToday
    ? data.todaySessions.slice(0, 2).map((session) => session.name).join(", ")
    : "No workout scheduled";

  const items = [
    {
      id: "workout",
      label: "Training",
      title: workoutTitle,
      detail: data.sessionsScheduledToday
        ? `${Math.min(data.sessionsCompletedToday, data.sessionsScheduledToday)} of ${data.sessionsScheduledToday} scheduled sessions completed`
        : "Start a quick workout if you train off-plan.",
      complete: data.sessionsScheduledToday ? data.sessionsCompletedToday >= data.sessionsScheduledToday : data.sessionsCompletedToday > 0,
      target: "today"
    },
    {
      id: "habits",
      label: "Habits",
      title: data.habitsTodayPercent ? `${data.habitsTodayPercent}% logged` : "Log daily habits",
      detail: "Steps, water, protein, sleep, food and mindset.",
      complete: data.habitsTodayPercent > 0,
      target: "habits"
    },
    {
      id: "nutrition",
      label: "Nutrition",
      title: data.foodLoggedToday ? `${data.foodLoggedToday} food ${data.foodLoggedToday === 1 ? "entry" : "entries"} logged` : "Log food today",
      detail: "Keep calories and macros up to date.",
      complete: data.foodLoggedToday > 0,
      target: "food"
    },
    {
      id: "mood",
      label: "Mindset",
      title: data.todayMoodScore ? `Mood checked in: ${data.todayMoodScore}/5` : "Complete mood check-in",
      detail: "Track stress, recovery and mental state.",
      complete: data.todayMoodScore > 0,
      target: "mindset"
    },
    {
      id: "gratitude",
      label: "Gratitude",
      title: data.gratitude ? "Gratitude logged" : "Add one gratitude",
      detail: data.gratitude || "One short reflection keeps the streak alive.",
      complete: Boolean(data.gratitude),
      target: "mindset"
    }
  ];

  if (dueReminders.length) {
    items.push({
      id: "reminders",
      label: "Reminder",
      title: `${dueReminders.length} future-self ${dueReminders.length === 1 ? "reminder" : "reminders"} due`,
      detail: "Open Mindset to review and mark seen.",
      complete: false,
      target: "mindset",
      urgent: true
    });
  }

  if (data.checkinsDueToday > 0) {
    items.unshift({
      id: "coach-checkin",
      label: "Coach check-in",
      title: data.checkinsSubmittedToday >= data.checkinsDueToday ? "Check-in submitted" : `${data.checkinsDueToday} check-in ${data.checkinsDueToday === 1 ? "due" : "due"}`,
      detail: data.checkinsSubmittedToday >= data.checkinsDueToday ? "Your coach can review your update." : "Open Today to reply and submit.",
      complete: data.checkinsSubmittedToday >= data.checkinsDueToday,
      target: "today",
      urgent: data.checkinsSubmittedToday < data.checkinsDueToday
    });
  }

  return items;
}

export function HomeScreen({ onNavigate, profile, role, user }) {
  const isCoach = role === "coach";
  const isClientLike = role === "client" || role === "normal_user";
  const hasPaidAccess = hasFullUserAccess(profile, role);
  const [coachHomeData, setCoachHomeData] = useState(blankCoachHomeData);
  const [homeData, setHomeData] = useState(blankHomeData);
  const [templatePreview, setTemplatePreview] = useState([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [coachLoading, setCoachLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");
  const todayChecklist = hasPaidAccess && isClientLike ? buildTodayChecklist(homeData) : [];
  const todayChecklistDone = todayChecklist.filter((item) => item.complete).length;

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(async () => {
      if (!isCoach || !supabase || user.id === "demo-user") {
        if (alive) {
          setCoachHomeData(blankCoachHomeData);
          setCoachLoading(false);
        }
        return;
      }

      setCoachLoading(true);
      setMessage("");
      const { data, error } = await supabase.rpc("get_coach_home_summary");
      if (alive) {
        setCoachLoading(false);
        if (error) {
          setMessage(`${error.message}. Run supabase/phase-21-coach-home.sql in Supabase.`);
          setCoachHomeData(blankCoachHomeData);
        } else {
          setCoachHomeData({
            ...blankCoachHomeData,
            ...(data || {}),
            stats: { ...blankCoachHomeData.stats, ...((data || {}).stats || {}) },
            due_soon: Array.isArray(data?.due_soon) ? data.due_soon : [],
            activity: Array.isArray(data?.activity) ? data.activity : []
          });
        }
      }
    });

    return () => {
      alive = false;
    };
  }, [isCoach, user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(async () => {
      if (!isClientLike || !supabase || user.id === "demo-user") {
        if (alive) setTemplatePreview([]);
        return;
      }

      const { data, error } = await supabase.rpc("get_public_workout_template_preview", {
        preview_limit: 2
      });

      if (!alive) return;
      setTemplatePreview(error || !Array.isArray(data) ? [] : data);
    });

    return () => {
      alive = false;
    };
  }, [isClientLike, user.id]);

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(async () => {
      if (!isClientLike || !supabase || user.id === "demo-user") {
        if (alive) {
          setHomeData(blankHomeData);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setMessage("");

      const now = new Date();
      const today = isoDate(now);
      const tomorrow = isoDate(addDays(now, 1));
      const weekStart = startOfWeek(now);
      const monthStart = startOfMonth(now);
      const focusStart = addDays(now, -6);
      const gratitudeStart = addDays(now, -6);
      const moodStart = addDays(now, -20);

      const ownPlanQuery = supabase
        .from("training_plans")
        .select("id,name,status,plan_type,block_weeks,created_at,training_plan_workouts(id,position,name,workout_type,summary,scheduled_days)")
        .eq("owner_id", user.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(50);

      const requests = [
        supabase
          .from("daily_mindset_logs")
          .select("log_date,mood_score,weekly_focus,gratitude")
          .eq("user_id", user.id)
          .gte("log_date", isoDate(moodStart))
          .order("log_date", { ascending: false })
          .limit(21),
        supabase
          .from("daily_habit_logs")
          .select("log_date,completion_percent")
          .eq("user_id", user.id)
          .eq("log_date", today)
          .maybeSingle(),
        supabase
          .from("session_logs")
          .select("id,completed_at")
          .eq("owner_id", user.id)
          .gte("completed_at", `${today}T00:00:00`)
          .lt("completed_at", `${tomorrow}T00:00:00`)
          .order("completed_at", { ascending: false })
          .limit(50),
        supabase
          .from("session_logs")
          .select("id,completed_at")
          .eq("owner_id", user.id)
          .gte("completed_at", weekStart.toISOString())
          .order("completed_at", { ascending: false })
          .limit(50),
        supabase
          .from("session_logs")
          .select("id,completed_at")
          .eq("owner_id", user.id)
          .gte("completed_at", monthStart.toISOString())
          .order("completed_at", { ascending: false })
          .limit(120),
        ownPlanQuery,
        supabase
          .from("mindset_future_reminders")
          .select("id,horizon_months,message,due_date,status")
          .eq("user_id", user.id)
          .eq("status", "hidden")
          .not("message", "is", null)
          .order("due_date", { ascending: true }),
        supabase
          .from("food_log_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("log_date", today)
          .limit(20),
        supabase.rpc("get_my_due_checkins", { target_date: today })
      ];

      if (role === "client") requests.push(supabase.rpc("get_my_assigned_plans"));

      const [
        mindsetResult,
        habitResult,
        todaySessionResult,
        weekSessionResult,
        monthSessionResult,
        ownPlanResult,
        remindersResult,
        foodResult,
        checkinResult,
        assignedPlanResult
      ] = await Promise.all(requests);
      if (!alive) return;

      setLoading(false);

      if (mindsetResult.error) {
        setMessage(`${mindsetResult.error.message}. Run supabase/phase-20-home-admin-privacy.sql in Supabase.`);
        return;
      }

      const mindsetLogs = mindsetResult.data || [];
      const ownPlans = (ownPlanResult.data || []).map((plan) => ({
        ...plan,
        training_plan_workouts: (plan.training_plan_workouts || []).sort((a, b) => a.position - b.position)
      }));
      const assignedPlans = assignedPlanResult?.error ? [] : assignedPlanResult?.data || [];
      const schedule = buildScheduledSessions(ownPlans, assignedPlans);
      const baseData = {
        weeklyFocus: mindsetLogs.find((log) => log.weekly_focus && log.log_date >= isoDate(focusStart))?.weekly_focus || "",
        gratitude: mindsetLogs.find((log) => log.log_date === today)?.gratitude || "",
        gratitudeLog: mindsetLogs
          .filter((log) => log.gratitude && log.log_date >= isoDate(gratitudeStart))
          .slice(0, 7),
        futureReminders: remindersResult?.error ? [] : remindersResult?.data || [],
        moodStreak: countMoodStreak(mindsetLogs),
        todayMoodScore: Number(mindsetLogs.find((log) => log.log_date === today)?.mood_score) || 0,
        habitsTodayPercent: Number(habitResult.data?.completion_percent) || 0,
        weekWorkoutCount: (weekSessionResult.data || []).length,
        monthWorkoutCount: (monthSessionResult.data || []).length,
        activePlanCount: schedule.activePlanCount,
        sessionsCompletedWeek: (weekSessionResult.data || []).length,
        sessionsCompletedToday: (todaySessionResult.data || []).length,
        sessionsScheduledToday: schedule.todaySessions.length,
        foodLoggedToday: foodResult?.error ? 0 : (foodResult.data || []).length,
        checkinsDueToday: checkinResult?.error ? 0 : (checkinResult.data || []).length,
        checkinsSubmittedToday: checkinResult?.error ? 0 : (checkinResult.data || []).filter((checkin) => checkin.response_id).length,
        todaySessions: schedule.todaySessions
      };

      setHomeData({
        ...blankHomeData,
        ...baseData,
        ...calculateAchievements(baseData)
      });
    });

    return () => {
      alive = false;
    };
  }, [isClientLike, role, user.id]);

  if (isCoach) {
    const stats = coachHomeData.stats || blankCoachHomeData.stats;
    return (
      <section className="screen-stack coach-home-screen">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Coach workspace</p>
            <h1>Dashboard</h1>
            <p>Client signals, due plans and recent activity.</p>
          </div>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}
        {coachLoading ? <p className="form-message success">Loading coach dashboard...</p> : null}

        <div className="coach-home-actions">
          <button className="primary-action filled build-home-action" onClick={() => onNavigate("workouts", "build")} type="button">
            + Build Workout
          </button>
          <button className="primary-action filled build-home-action" onClick={() => onNavigate("plans")} type="button">
            + Build Plan
          </button>
          <button className="primary-action filled compact quick-home-action" onClick={() => onNavigate("workouts", "quick")} type="button">
            + Quick Workout
          </button>
        </div>

        <div className="coach-signal-grid">
          <StatCard label="Struggle moods this week" value={String(stats.struggle_moods_week || 0)} tone="red" />
          <StatCard label="Low moods this week" value={String(stats.low_moods_week || 0)} tone="gold" />
          <StatCard label="Client workouts today" value={String(stats.client_workouts_today || 0)} tone="blue" />
          <StatCard label="Habit logging today" value={`${stats.habit_logging_today || 0}%`} tone="gold" />
          <StatCard label="Habit compliant today" value={`${stats.habit_compliant_today || 0}%`} tone="teal" />
        </div>

        <section className="panel coach-affirmation-card">
          <p className="eyebrow">Affirmation of the day</p>
          <strong>"{coachHomeData.affirmation || "Be Yourself"}"</strong>
        </section>

        <div className="coach-home-two-col">
          <section className="panel coach-analytics-card">
            <h2>Client analytics</h2>
            <p>Client movement at a glance.</p>
            <div className="coach-analytics-grid">
              <StatCard label="Total clients" value={String(stats.total_clients || 0)} tone="gold" />
              <StatCard label="New this week" value={String(stats.new_clients_week || 0)} tone="gold" />
              <StatCard label="Lost clients" value={String(stats.lost_clients || 0)} tone="red" />
            </div>
          </section>

          <section className="panel coach-due-card">
            <div className="section-row">
              <h2>Due soon</h2>
              <span>{coachHomeData.due_soon.length}</span>
            </div>
            {coachHomeData.due_soon.length ? (
              coachHomeData.due_soon.map((item) => (
                <article key={`${item.assignment_id}-${item.plan_id}`}>
                  <div>
                    <strong>{item.client_name}</strong>
                    <em>{item.plan_name}</em>
                  </div>
                  <span>{item.days_left <= 0 ? "today" : `${item.days_left}d`}</span>
                </article>
              ))
            ) : (
              <p className="compact-help">No plans due in the next 7 days.</p>
            )}
          </section>
        </div>

        <section className="panel coach-activity-feed">
          <div className="section-row">
            <div>
              <h2>Recent client activity</h2>
              <p>Workout completions, mood updates, PRs and check-ins.</p>
            </div>
            <button className="primary-action compact" onClick={() => onNavigate("plans")} type="button">Plan</button>
          </div>
          {coachHomeData.activity.length ? (
            coachHomeData.activity.map((item) => (
              <article className="coach-feed-item" key={`${item.type}-${item.id}`}>
                <div className="coach-feed-avatar">
                  {item.avatar_url ? <img alt="" src={item.avatar_url} /> : <span>{coachInitial(item.client_name)}</span>}
                  <i />
                </div>
                <div>
                  <span className={`coach-feed-type ${item.type || "workout"}`}>{activityBadge(item.type)}</span>
                  <strong>
                    <span>{item.client_name}</span> {item.title}
                  </strong>
                  <p>{item.detail}</p>
                  <em>{formatActivityDate(item.created_at)}</em>
                  <div className="coach-feed-actions">
                    <button type="button">Like</button>
                    <button type="button">Comment</button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="compact-help">No client activity yet.</p>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="screen-stack home-dashboard-screen">
      <div className="screen-heading">
        <p className="eyebrow">Home</p>
        <h1>Good to see you, {user.name}</h1>
        <p>{formatTodayDate()}</p>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loading ? <p className="form-message success">Loading home...</p> : null}

      <div className="home-build-actions">
        <button className="primary-action filled build-home-action" onClick={() => onNavigate("workouts", "build")} type="button">
          + Build Workout
        </button>
        <button className="primary-action filled build-home-action" onClick={() => onNavigate("plans")} type="button">
          + Build Plan
        </button>
        <button className="primary-action filled compact quick-home-action" onClick={() => onNavigate("workouts", "quick")} type="button">
          + Quick Workout
        </button>
      </div>

      {hasPaidAccess && isClientLike ? (
        <section className="panel today-checklist-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Today checklist</p>
              <h2>{todayChecklistDone} of {todayChecklist.length} complete</h2>
            </div>
            <span>{Math.round((todayChecklistDone / Math.max(todayChecklist.length, 1)) * 100)}%</span>
          </div>
          <div className="today-checklist-list">
            {todayChecklist.map((item) => (
              <button
                className={`${item.complete ? "done" : ""}${item.urgent ? " urgent" : ""}`}
                key={item.id}
                onClick={() => onNavigate(item.target)}
                type="button"
              >
                <i>{item.complete ? "✓" : ""}</i>
                <span>
                  <em>{item.label}</em>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <button className="panel home-template-cta" onClick={() => onNavigate("templates")} type="button">
        <div>
          <p className="eyebrow">Public templates</p>
          <strong>Browse Movementz workouts</strong>
          <span>Strength and HIIT templates you can copy into your library.</span>
          {templatePreview.length ? (
            <div className="home-template-preview-list">
              {templatePreview.map((template) => (
                <span key={template.id}>
                  <b>{template.name}</b>
                  <small>
                    {template.workout_type === "hiit" ? "HIIT" : "Strength"} - {template.exercise_count || 0} exercises
                  </small>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <em>Open</em>
      </button>

      <div className="home-quick-grid">
        <button className="home-checkin-card" onClick={() => onNavigate("mindset")} type="button">
          <span>Mood check-in</span>
          <strong>{homeData.todayMoodScore ? `${homeData.todayMoodScore}/5` : "Log today"}</strong>
          <em>{homeData.moodStreak} day streak</em>
        </button>
        <button className={`home-checkin-card${hasPaidAccess ? "" : " locked"}`} onClick={() => onNavigate("habits")} type="button">
          <span>Habits</span>
          <strong>{hasPaidAccess ? `${homeData.habitsTodayPercent}%` : "Locked"}</strong>
          <em>{hasPaidAccess ? "today complete" : "upgrade to unlock"}</em>
        </button>
      </div>

      {!hasPaidAccess ? (
        <section className="panel home-upgrade-preview">
          <div>
            <p className="eyebrow">Paid access</p>
            <h2>Unlock the full app</h2>
            <p>Progress, Habits, Feed, Nutrition, Messages and mutual invites unlock after upgrade or admin access.</p>
          </div>
          <button className="primary-action filled" onClick={() => onNavigate("progress")} type="button">
            View upgrade
          </button>
        </section>
      ) : null}

      <div className="stats-grid">
        <StatCard label="This week" value={String(homeData.weekWorkoutCount)} tone="gold" />
        <StatCard label="Active plans" value={String(homeData.activePlanCount)} tone="teal" />
        <StatCard label="Scheduled today" value={String(homeData.sessionsScheduledToday)} tone="blue" />
      </div>

      <div className="panel home-mindset-card">
        <p className="eyebrow">Mindset today</p>
        <div>
          <span>Weekly focus</span>
          <strong>{homeData.weeklyFocus || "Add your focus in Mindset"}</strong>
        </div>
        <div>
          <span>Gratitude</span>
          <strong>{homeData.gratitude || "Log one gratitude today"}</strong>
        </div>
      </div>

      {homeData.futureReminders.length ? (
        <section className="panel home-reminder-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Future reminders</p>
              <h2>Future Goals</h2>
            </div>
            <button className="primary-action compact" onClick={() => onNavigate("mindset")} type="button">Open</button>
          </div>
          {homeData.futureReminders.slice(0, 3).map((reminder) => (
            <article key={reminder.id}>
              <span>{reminder.horizon_months} months</span>
              <strong>{reminder.message}</strong>
              <em>Due {formatActivityDate(reminder.due_date)}</em>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel home-gratitude-feed">
        <div className="section-row">
          <div>
            <p className="eyebrow">Gratitude log</p>
            <h2>Last 7 days</h2>
          </div>
          <button className="primary-action compact" onClick={() => onNavigate("mindset")} type="button">Add</button>
        </div>
        {homeData.gratitudeLog.length ? (
          homeData.gratitudeLog.map((log) => (
            <article key={log.log_date}>
              <span>{formatActivityDate(log.log_date)}</span>
              <strong>{log.gratitude}</strong>
            </article>
          ))
        ) : (
          <p className="compact-help">No gratitude entries from the last 7 days yet.</p>
        )}
      </section>

      <section className="panel home-achievement-card">
        <div className="section-row">
          <div>
            <p className="eyebrow">Achievements</p>
            <h2>Badges unlocked</h2>
          </div>
          <strong>{homeData.achievementsUnlocked}</strong>
        </div>
        <div className="home-badge-row">
          {achievementRules.filter((rule) => rule.test(homeData)).map((rule) => (
            <span key={rule.id}>{rule.label}</span>
          ))}
          {!homeData.achievementsUnlocked ? <em>No badges yet</em> : null}
        </div>
        <div className="home-next-badges">
          <span>Next badges</span>
          {(homeData.nextBadges.length ? homeData.nextBadges : ["Keep going"]).map((badge) => (
            <em key={badge}>{badge}</em>
          ))}
        </div>
      </section>

      <section className="panel home-session-summary">
        <div className="section-row">
          <div>
            <p className="eyebrow">Today</p>
            <h2>Scheduled sessions</h2>
          </div>
          <strong>{homeData.sessionsScheduledToday}</strong>
        </div>
        {homeData.todaySessions.length ? (
          homeData.todaySessions.slice(0, 4).map((session) => (
            <article key={session.id}>
              <span>{session.planName}</span>
              <strong>{session.name}</strong>
              <em>{session.exerciseCount ? `${session.exerciseCount} exercises` : session.summary}</em>
            </article>
          ))
        ) : (
          <p className="compact-help">No sessions scheduled today.</p>
        )}
      </section>
    </section>
  );
}

