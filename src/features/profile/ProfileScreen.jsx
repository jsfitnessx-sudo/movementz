import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const baseRoleOptions = [
  { value: "normal_user", label: "Normal user" },
  { value: "client", label: "Client" },
  { value: "coach", label: "Coach" }
];

const experienceOptions = [
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

const blankCoachProfile = {
  qualification: "",
  experience_areas: [],
  about_me: "",
  years_experience: ""
};

function toProfileForm(profile, user) {
  return {
    full_name: profile?.full_name || user?.name || "",
    email: profile?.email || user?.email || "",
    role: profile?.role || "normal_user",
    gender: profile?.gender || "",
    age: profile?.age ?? "",
    location: profile?.location || ""
  };
}

export function ProfileScreen({ onProfileSaved, onSignOut, profile, user }) {
  const [profileForm, setProfileForm] = useState(() => toProfileForm(profile, user));
  const [coachForm, setCoachForm] = useState(blankCoachProfile);
  const [coachProfileExists, setCoachProfileExists] = useState(false);
  const [loadingCoach, setLoadingCoach] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isCoach = profileForm.role === "coach";
  const roleOptions =
    profile?.role === "admin"
      ? [...baseRoleOptions, { value: "admin", label: "Admin" }]
      : baseRoleOptions;
  const initials = useMemo(
    () => (profileForm.full_name || profileForm.email || "M").slice(0, 1).toUpperCase(),
    [profileForm.email, profileForm.full_name]
  );

  useEffect(() => {
    Promise.resolve().then(() => setProfileForm(toProfileForm(profile, user)));
  }, [profile, user]);

  useEffect(() => {
    let alive = true;

    async function loadCoachProfile() {
      if (!supabase || !user?.id || !isCoach) {
        setCoachForm(blankCoachProfile);
        setCoachProfileExists(false);
        return;
      }

      setLoadingCoach(true);
      const { data, error: coachError } = await supabase
        .from("coach_profiles")
        .select("qualification,experience_areas,about_me,years_experience")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!alive) return;
      setLoadingCoach(false);

      if (coachError) {
        setError(coachError.message);
        return;
      }

      setCoachForm({
        qualification: data?.qualification || "",
        experience_areas: Array.isArray(data?.experience_areas) ? data.experience_areas : [],
        about_me: data?.about_me || "",
        years_experience: data?.years_experience ?? ""
      });
      setCoachProfileExists(Boolean(data));
    }

    loadCoachProfile();

    return () => {
      alive = false;
    };
  }, [isCoach, user?.id]);

  function updateProfile(field, value) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function updateCoach(field, value) {
    setCoachForm((current) => ({ ...current, [field]: value }));
  }

  function toggleExperience(area) {
    setCoachForm((current) => ({
      ...current,
      experience_areas: current.experience_areas.includes(area)
        ? current.experience_areas.filter((item) => item !== area)
        : [...current.experience_areas, area]
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!supabase || !user?.id) return;

    setSaving(true);
    setMessage("");
    setError("");

    const fullName = profileForm.full_name.trim();
    if (!fullName) {
      setSaving(false);
      setError("Full name is required.");
      return;
    }

    if (isCoach && !coachForm.qualification.trim()) {
      setSaving(false);
      setError("Qualification is required for coach profiles.");
      return;
    }

    const profilePayload = {
      id: user.id,
      email: profileForm.email || user.email,
      full_name: fullName,
      role: profileForm.role,
      gender: profileForm.gender || null,
      age: profileForm.age === "" ? null : Number(profileForm.age),
      location: profileForm.location.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data: savedProfile, error: profileError } = await supabase
      .from("profiles")
      .upsert(profilePayload)
      .select("id,email,full_name,first_name,last_name,role,avatar_url,gender,age,location")
      .single();

    if (profileError) {
      setSaving(false);
      setError(profileError.message);
      return;
    }

    if (isCoach) {
      const coachPayload = {
        user_id: user.id,
        qualification: coachForm.qualification.trim(),
        experience_areas: coachForm.experience_areas,
        about_me: coachForm.about_me.trim() || null,
        years_experience:
          coachForm.years_experience === "" ? null : Number(coachForm.years_experience),
        updated_at: new Date().toISOString()
      };

      const coachSave = coachProfileExists
        ? await supabase
            .from("coach_profiles")
            .update(coachPayload)
            .eq("user_id", user.id)
        : await supabase.from("coach_profiles").insert(coachPayload);

      const { error: coachError } = coachSave;

      if (coachError) {
        setSaving(false);
        setError(coachError.message);
        return;
      }

      setCoachProfileExists(true);
    }

    setSaving(false);
    setMessage("Profile saved.");
    onProfileSaved(savedProfile);
  }

  return (
    <section className="screen-stack">
      <div className="screen-heading">
        <p className="eyebrow">Account</p>
        <h1>My profile</h1>
        <p>Keep your Movementz details accurate as we build the next layers.</p>
      </div>

      <form className="profile-panel" onSubmit={handleSave}>
        <div className="profile-hero">
          <div className="profile-avatar">{initials}</div>
          <div>
            <h2>{profileForm.full_name || "Movementz athlete"}</h2>
            <p>{profileForm.email}</p>
          </div>
        </div>

        <div className="form-section">
          <h3>Basic details</h3>
          <label>
            Full name *
            <input
              value={profileForm.full_name}
              onChange={(event) => updateProfile("full_name", event.target.value)}
              placeholder="Your full name"
            />
          </label>

          <label>
            Email
            <input disabled value={profileForm.email} />
          </label>

          <div className="auth-form-grid">
            <label>
              Age
              <input
                inputMode="numeric"
                value={profileForm.age}
                onChange={(event) => updateProfile("age", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Gender
              <select
                value={profileForm.gender}
                onChange={(event) => updateProfile("gender", event.target.value)}
              >
                <option value="">Optional</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="rather_not_say">Rather not say</option>
              </select>
            </label>
          </div>

          <label>
            Location
            <input
              value={profileForm.location}
              onChange={(event) => updateProfile("location", event.target.value)}
              placeholder="City or area"
            />
          </label>

          <label>
            Account type
            <select
              value={profileForm.role}
              onChange={(event) => updateProfile("role", event.target.value)}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isCoach ? (
          <div className="form-section">
            <h3>Coach profile</h3>
            {loadingCoach ? <p className="muted-note">Loading coach profile...</p> : null}
            <label>
              Qualification *
              <input
                value={coachForm.qualification}
                onChange={(event) => updateCoach("qualification", event.target.value)}
                placeholder="e.g. Cert III/IV Fitness"
              />
            </label>
            <label>
              Years experience
              <input
                inputMode="numeric"
                value={coachForm.years_experience}
                onChange={(event) => updateCoach("years_experience", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <div className="field-group">
              <span>Experience in</span>
              <div className="chip-grid">
                {experienceOptions.map((area) => (
                  <button
                    className={coachForm.experience_areas.includes(area) ? "chip active" : "chip"}
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
                value={coachForm.about_me}
                onChange={(event) => updateCoach("about_me", event.target.value)}
                placeholder="Tell clients who you help and how."
              />
            </label>
            <div className="coach-verification-note">
              Coach verification placeholder: certificate upload and review will be added later.
            </div>
          </div>
        ) : null}

        {error ? <p className="form-message error">{error}</p> : null}
        {message ? <p className="form-message success">{message}</p> : null}

        <div className="profile-actions">
          <button className="primary-action filled" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save profile"}
          </button>
          <button className="primary-action" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </form>
    </section>
  );
}
