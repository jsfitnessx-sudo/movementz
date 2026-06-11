import { paidFeatureLabels } from "../../lib/access/paidAccess.js";

export function UpgradePromptScreen({ featureTab, onNavigate }) {
  const featureName = paidFeatureLabels[featureTab] || "this feature";

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
        <button className="primary-action filled" onClick={() => onNavigate("home")} type="button">
          Upgrade coming soon
        </button>
        <button className="primary-action" onClick={() => onNavigate("home")} type="button">
          Back home
        </button>
      </section>
    </section>
  );
}
