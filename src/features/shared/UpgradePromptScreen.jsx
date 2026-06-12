import { useState } from "react";
import { paidFeatureLabels } from "../../lib/access/paidAccess.js";
import { supabase } from "../../lib/supabase/client.js";

export function UpgradePromptScreen({ featureTab, onNavigate }) {
  const featureName = paidFeatureLabels[featureTab] || "this feature";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function startUpgrade() {
    if (!supabase) {
      setMessage("Connect Supabase before starting checkout.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      setLoading(false);
      setMessage("Log in before upgrading.");
      return;
    }

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ type: "paid_user" })
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not start checkout.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  return (
    <section className="screen-stack upgrade-screen">
      <div className="screen-heading">
        <p className="eyebrow">Upgrade</p>
        <h1>Unlock {featureName}</h1>
        <p>Progress, Habits, Feed, Nutrition, Messages and mutual invites are included with paid access.</p>
      </div>

      <section className="panel upgrade-panel">
        <div className="upgrade-lock-mark" aria-hidden="true">Lock</div>
        <h2>Full Movementz access</h2>
        <p>Free accounts can keep training with Home, Today, Workouts, Plans and Mindset. Upgrade when you are ready to unlock the full app.</p>
        {message ? <p className="form-message error">{message}</p> : null}
        <button className="primary-action filled" disabled={loading} onClick={startUpgrade} type="button">
          {loading ? "Opening checkout..." : "Upgrade now"}
        </button>
        <button className="primary-action" onClick={() => onNavigate("home")} type="button">
          Back home
        </button>
      </section>
    </section>
  );
}
