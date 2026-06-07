import { StatCard } from "../../components/ui/StatCard.jsx";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

export function HomeScreen({ onNavigate, role, user }) {
  const isCoach = role === "coach";
  const [coachClientCount, setCoachClientCount] = useState(0);

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
          <h2>Next build step</h2>
          <p>
            Phase 1 will connect Supabase auth, profiles and role-based routing
            before any workout or plan code is added.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack">
      <div className="screen-heading">
        <p className="eyebrow">Home</p>
        <h1>Good to see you, {user.name}</h1>
        <p>Today, mood, achievements and quick build actions will live here.</p>
      </div>

      <div className="action-row">
        <button className="primary-action" onClick={() => onNavigate("workouts")} type="button">
          Build Workout
        </button>
        <button className="primary-action filled" onClick={() => onNavigate("plans")} type="button">
          Build Plan
        </button>
      </div>

      <div className="stats-grid">
        <StatCard label="Workouts" value="0" tone="gold" />
        <StatCard label="Mood streak" value="0" tone="teal" />
        <StatCard label="Habits today" value="0%" tone="blue" />
      </div>

      <div className="panel">
        <h2>Foundation ready</h2>
        <p>
          This clean shell separates user, client, coach and admin experiences
          so the rebuild does not become one large tangled file again.
        </p>
      </div>
    </section>
  );
}
