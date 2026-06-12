import { useEffect, useMemo, useState } from "react";
import { BrandName } from "../../components/brand/BrandMark.jsx";
import { buildAuthRedirectUrl, movementzIconSrc } from "../../lib/brandAssets.js";
import { hasSupabaseConfig, supabase } from "../../lib/supabase/client.js";

const coachExperienceOptions = [
  "Strength Training",
  "Weightloss",
  "Sports training",
  "Bodybuilding",
  "Powerlifting",
  "Crossfit",
  "Hyrox",
  "Endurance",
  "Other"
];

const blankForm = {
  email: "",
  password: "",
  fullName: "",
  age: "",
  gender: "",
  location: "",
  qualification: "",
  aboutMe: ""
};

const COACH_SIGNUP_INTENT_KEY = "movementz.pendingCoachSignupEmail";

function rememberCoachSignupIntent(email) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COACH_SIGNUP_INTENT_KEY, String(email || "").trim().toLowerCase());
}

export function AuthScreen({ coachInviteCode = "", initialMode = "login", onAuthComplete, onDemoLogin }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(blankForm);
  const [experienceAreas, setExperienceAreas] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isCoachSignup = mode === "coach";
  const heading = useMemo(() => {
    if (!hasSupabaseConfig) return "Preview Movementz";
    if (mode === "login") return "Welcome back";
    return "Create account";
  }, [mode]);

  useEffect(() => {
    Promise.resolve().then(() => setMode(initialMode));
  }, [initialMode]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleExperience(area) {
    setExperienceAreas((current) =>
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area]
    );
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError("");
    setStatus("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password
    });

    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    if (data.session) {
      onAuthComplete(data.session);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError("");
    setStatus("");

    const role = isCoachSignup ? "coach" : "normal_user";
    const metadata = {
      role,
      intended_role: isCoachSignup ? "coach" : role,
      full_name: form.fullName.trim(),
      age: form.age,
      gender: form.gender,
      location: form.location.trim(),
      qualification: form.qualification.trim(),
      experience_areas: experienceAreas,
      about_me: form.aboutMe.trim()
    };

    if (!metadata.full_name) {
      setSubmitting(false);
      setError("Full name is required.");
      return;
    }

    if (isCoachSignup && !metadata.qualification) {
      setSubmitting(false);
      setError("Qualification is required for coach signup.");
      return;
    }

    const signupEmail = form.email.trim();
    if (isCoachSignup) rememberCoachSignupIntent(signupEmail);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: signupEmail,
      password: form.password,
      options: {
        data: metadata,
        emailRedirectTo: buildAuthRedirectUrl(
          coachInviteCode
            ? `/?coach_invite=${encodeURIComponent(coachInviteCode)}`
            : isCoachSignup
              ? "/"
              : "/"
        )
      }
    });

    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      onAuthComplete(data.session);
      return;
    }

    setStatus(isCoachSignup
      ? "Coach account created. Confirm your email if asked, then log in here to complete the coach subscription."
      : "Account created. Check your email if Supabase asks you to confirm it, then log in."
    );
    setMode("login");
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="auth-brand">
            <img className="brand-loading-icon" src={movementzIconSrc} alt="" />
            <h1><BrandName /></h1>
            <p>Clean rebuild foundation</p>
          </div>

          <div className="auth-actions">
            <button type="button" onClick={() => onDemoLogin("normal_user")}>
              Preview User
            </button>
            <button type="button" onClick={() => onDemoLogin("client")}>
              Preview Client
            </button>
            <button type="button" onClick={() => onDemoLogin("coach")}>
              Preview Coach
            </button>
            <button type="button" onClick={() => onDemoLogin("admin")}>
              Preview Admin
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <img className="brand-loading-icon" src={movementzIconSrc} alt="" />
          <strong className="auth-brand-name"><BrandName /></strong>
          <h1>{heading}</h1>
          <p>{isCoachSignup ? "Build your coaching workspace." : "Move, train and grow."}</p>
        </div>

        <div className="auth-mode-tabs" aria-label="Account mode">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            className={mode === "user" ? "active" : ""}
            type="button"
            onClick={() => setMode("user")}
          >
            User
          </button>
          {coachInviteCode || initialMode === "coach" ? (
            <button
              className={mode === "coach" ? "active" : ""}
              type="button"
              onClick={() => setMode("coach")}
            >
              Coach
            </button>
          ) : null}
        </div>

        <form className="auth-form" onSubmit={mode === "login" ? handleLogin : handleSignup}>
          {mode !== "login" ? (
            <label>
              Full name *
              <input
                autoComplete="name"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                placeholder="e.g. Joseph Salaivao"
              />
            </label>
          ) : null}

          <label>
            Email *
            <input
              autoComplete="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="you@email.com"
            />
          </label>

          <label>
            Password *
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="Minimum 6 characters"
            />
          </label>

          {mode !== "login" ? (
            <div className="auth-form-grid">
              <label>
                Age
                <input
                  inputMode="numeric"
                  value={form.age}
                  onChange={(event) => updateField("age", event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Gender
                <select
                  value={form.gender}
                  onChange={(event) => updateField("gender", event.target.value)}
                >
                  <option value="">Optional</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="rather_not_say">Rather not say</option>
                </select>
              </label>
            </div>
          ) : null}

          {isCoachSignup ? (
            <>
              <label>
                Location
                <input
                  value={form.location}
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder="City or area"
                />
              </label>
              <label>
                Qualification *
                <input
                  value={form.qualification}
                  onChange={(event) => updateField("qualification", event.target.value)}
                  placeholder="e.g. Cert III/IV Fitness"
                />
              </label>
              <div className="field-group">
                <span>Experience in</span>
                <div className="chip-grid">
                  {coachExperienceOptions.map((area) => (
                    <button
                      className={experienceAreas.includes(area) ? "chip active" : "chip"}
                      key={area}
                      type="button"
                      onClick={() => toggleExperience(area)}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                About me
                <textarea
                  value={form.aboutMe}
                  onChange={(event) => updateField("aboutMe", event.target.value)}
                  placeholder="Tell clients what you help with."
                />
              </label>
            </>
          ) : null}

          {error ? <p className="form-message error">{error}</p> : null}
          {status ? <p className="form-message success">{status}</p> : null}

          <button className="primary-action filled" disabled={submitting} type="submit">
            {submitting ? "Working..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
