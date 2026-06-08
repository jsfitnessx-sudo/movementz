import { useEffect, useState } from "react";
import { StatCard } from "../../components/ui/StatCard.jsx";
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
  moodStreak: 0,
  todayMoodScore: 0,
  habitsTodayPercent: 0,
  weekWorkoutCount: 0,
  monthWorkoutCount: 0,
  activePlanCount: 0,
  sessionsCompletedWeek: 0,
  sessionsScheduledToday: 0,
  todaySessions: [],
  achievementsUnlocked: 0,
  nextBadges: []
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

export function HomeScreen({ onNavigate, role, user }) {
  const isCoach = role === "coach";
  const isClientLike = role === "client" || role === "normal_user";
  const [coachClientCount, setCoachClientCount] = useState(0);
  const [homeData, setHomeData] = useState(blankHomeData);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(async () => {
      if (!isCoach || !supabase || user.id === "demo-user") {
        if (alive) setCoachClientCount(0);
        return;
      }

      const { data } = await supabase.rpc("get_my_coach_clients");
      if (alive) {
        setCoachClientCount((data || []).filter((client) => client.status === "active").length);
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
      const weekStart = startOfWeek(now);
      const monthStart = startOfMonth(now);
      const focusStart = addDays(now, -6);
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
        ownPlanQuery
      ];

      if (role === "client") requests.push(supabase.rpc("get_my_assigned_plans"));

      const [mindsetResult, habitResult, weekSessionResult, monthSessionResult, ownPlanResult, assignedPlanResult] = await Promise.all(requests);
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
        moodStreak: countMoodStreak(mindsetLogs),
        todayMoodScore: Number(mindsetLogs.find((log) => log.log_date === today)?.mood_score) || 0,
        habitsTodayPercent: Number(habitResult.data?.completion_percent) || 0,
        weekWorkoutCount: (weekSessionResult.data || []).length,
        monthWorkoutCount: (monthSessionResult.data || []).length,
        activePlanCount: schedule.activePlanCount,
        sessionsCompletedWeek: (weekSessionResult.data || []).length,
        sessionsScheduledToday: schedule.todaySessions.length,
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
    return (
      <section className="screen-stack">
        <div className="screen-heading">
          <p className="eyebrow">Coach workspace</p>
          <h1>Dashboard</h1>
          <p>Client signals, appointments and coaching actions in one place.</p>
        </div>

        <div className="action-row">
          <button className="primary-action" onClick={() => onNavigate("clients")} type="button">
            Add Client
          </button>
          <button className="primary-action filled" onClick={() => onNavigate("plans")} type="button">
            Build Plan
          </button>
        </div>

        <div className="stats-grid">
          <StatCard label="Clients" value={String(coachClientCount)} tone="gold" />
          <StatCard label="Client workouts today" value="0" tone="teal" />
          <StatCard label="Habit compliance" value="0%" tone="red" />
        </div>

        <div className="panel">
          <h2>Coach home is next</h2>
          <p>We will build the coach dashboard after the client home summary is stable.</p>
        </div>
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

      <div className="home-quick-grid">
        <button className="home-checkin-card" onClick={() => onNavigate("mindset")} type="button">
          <span>Mood check-in</span>
          <strong>{homeData.todayMoodScore ? `${homeData.todayMoodScore}/5` : "Log today"}</strong>
          <em>{homeData.moodStreak} day streak</em>
        </button>
        <button className="home-checkin-card" onClick={() => onNavigate("habits")} type="button">
          <span>Habits</span>
          <strong>{homeData.habitsTodayPercent}%</strong>
          <em>today complete</em>
        </button>
      </div>

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
          <strong>{homeData.sessionsCompletedWeek}/{homeData.sessionsScheduledToday}</strong>
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
