import { useCallback, useEffect, useMemo, useState } from "react";
import { buildSignupLink, copyTextToClipboard } from "../../lib/brandAssets.js";
import { supabase } from "../../lib/supabase/client.js";

const resourceCategories = ["Featured", "Video", "Podcast", "Article", "Support"];
const affirmationThemes = ["Confidence", "Consistency", "Self-worth", "Stress", "Grief", "Discipline", "Recovery"];
const testAccounts = [
  { label: "Joe Salaivao - Admin", email: "jsfitnessx@gmail.com", fallbackRole: "admin" },
  { label: "Joe Coach", email: "metzmvmnt@gmail.com", fallbackRole: "coach" },
  { label: "Tom Salaivao - Client", email: "joseph.sal79@gmail.com", fallbackRole: "client" },
  { label: "Tom Salaivao - Normal user", email: "imperfect.mvmnt@gmail.com", fallbackRole: "normal_user" }
];

const blankResource = {
  id: "",
  title: "",
  category: "Featured",
  description: "",
  url: "",
  thumbnail_url: "",
  is_active: true
};

function blankAffirmation() {
  return {
    id: "",
    theme: "Confidence",
    text: "",
    is_active: true
  };
}

function toProfileOption(profile) {
  return {
    id: profile.id,
    name: profile.full_name || profile.email || "Movementz user",
    email: profile.email || "",
    role: profile.role || "normal_user",
    avatarUrl: profile.avatar_url || null
  };
}

export function AdminSettingsScreen({ onPreviewAccount, previewAccount, user }) {
  const [resources, setResources] = useState([]);
  const [resourceDraft, setResourceDraft] = useState(blankResource);
  const [affirmations, setAffirmations] = useState([]);
  const [affirmationDraft, setAffirmationDraft] = useState(blankAffirmation);
  const [profiles, setProfiles] = useState([]);
  const [selectedResetId, setSelectedResetId] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const signupLink = useMemo(() => buildSignupLink(), []);

  const selectedResetProfile = profiles.find((profile) => profile.id === selectedResetId);
  const testProfiles = useMemo(() => {
    return testAccounts.map((account) => {
      const match = profiles.find((profile) => profile.email?.toLowerCase() === account.email.toLowerCase());
      return match
        ? { ...toProfileOption(match), label: account.label }
        : { id: "", name: account.label, email: account.email, role: account.fallbackRole, label: account.label };
    });
  }, [profiles]);

  const loadAdminSettings = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const [resourceResponse, affirmationResponse, profileResponse] = await Promise.all([
      supabase
        .from("mindset_resources")
        .select("id,title,category,description,url,thumbnail_url,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("mindset_affirmations")
        .select("id,theme,text,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("profiles")
        .select("id,email,full_name,role,avatar_url")
        .order("full_name", { ascending: true })
        .limit(100)
    ]);

    setLoading(false);

    if (resourceResponse.error) {
      setMessage(`${resourceResponse.error.message}. Run supabase/phase-19-admin-settings.sql in Supabase.`);
      return;
    }

    setResources(resourceResponse.data || []);

    if (affirmationResponse.error) {
      setMessage(`${affirmationResponse.error.message}. Run supabase/phase-19-admin-settings.sql in Supabase.`);
    } else {
      setAffirmations(affirmationResponse.data || []);
    }

    if (!profileResponse.error) setProfiles(profileResponse.data || []);
  }, [user.id]);

  useEffect(() => {
    const load = Promise.resolve().then(loadAdminSettings);
    return () => {
      void load;
    };
  }, [loadAdminSettings]);

  function editResource(resource) {
    setResourceDraft({
      id: resource.id,
      title: resource.title || "",
      category: resource.category || "Featured",
      description: resource.description || "",
      url: resource.url || "",
      thumbnail_url: resource.thumbnail_url || "",
      is_active: resource.is_active !== false
    });
  }

  async function saveResource(event) {
    event.preventDefault();
    if (!supabase) return;
    if (!resourceDraft.title.trim() || !resourceDraft.url.trim()) {
      setMessage("Add a resource title and link.");
      return;
    }

    setSaving("resource");
    setMessage("");

    const payload = {
      title: resourceDraft.title.trim(),
      category: resourceDraft.category,
      description: resourceDraft.description.trim() || null,
      url: resourceDraft.url.trim(),
      thumbnail_url: resourceDraft.thumbnail_url.trim() || null,
      is_active: resourceDraft.is_active,
      created_by: user.id
    };

    const request = resourceDraft.id
      ? supabase.from("mindset_resources").update(payload).eq("id", resourceDraft.id)
      : supabase.from("mindset_resources").insert(payload);
    const { error } = await request;

    setSaving("");

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-19-admin-settings.sql in Supabase.`);
      return;
    }

    setResourceDraft(blankResource);
    setMessage("Resource saved.");
    await loadAdminSettings();
  }

  async function archiveResource(resourceId) {
    if (!supabase) return;
    setSaving(resourceId);
    const { error } = await supabase.rpc("admin_hide_mindset_resource", { resource_id: resourceId });
    let finalError = error;
    if (error) {
      const { error: fallbackError } = await supabase
        .from("mindset_resources")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", resourceId);
      finalError = fallbackError;
    }
    setSaving("");
    if (finalError) setMessage(`${finalError.message}. Run supabase/phase-21-coach-home.sql in Supabase.`);
    else {
      setResources((current) => current.filter((resource) => resource.id !== resourceId));
      if (resourceDraft.id === resourceId) setResourceDraft(blankResource);
      setMessage("Resource hidden.");
    }
  }

  async function saveAffirmation(event) {
    event.preventDefault();
    if (!supabase) return;
    if (!affirmationDraft.text.trim()) {
      setMessage("Add affirmation text.");
      return;
    }

    setSaving("affirmation");
    setMessage("");

    const payload = {
      theme: affirmationDraft.theme,
      text: affirmationDraft.text.trim(),
      is_active: affirmationDraft.is_active,
      created_by: user.id
    };

    const request = affirmationDraft.id
      ? supabase.from("mindset_affirmations").update(payload).eq("id", affirmationDraft.id)
      : supabase.from("mindset_affirmations").insert(payload);
    const { error } = await request;

    setSaving("");

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-19-admin-settings.sql in Supabase.`);
      return;
    }

    setAffirmationDraft(blankAffirmation());
    setMessage("Affirmation saved.");
    await loadAdminSettings();
  }

  async function archiveAffirmation(affirmationId) {
    if (!supabase) return;
    setSaving(affirmationId);
    const { error } = await supabase.rpc("admin_hide_mindset_affirmation", { affirmation_id: affirmationId });
    let finalError = error;
    if (error) {
      const { error: fallbackError } = await supabase
        .from("mindset_affirmations")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", affirmationId);
      finalError = fallbackError;
    }
    setSaving("");
    if (finalError) setMessage(`${finalError.message}. Run supabase/phase-21-coach-home.sql in Supabase.`);
    else {
      setAffirmations((current) => current.filter((affirmation) => affirmation.id !== affirmationId));
      if (affirmationDraft.id === affirmationId) setAffirmationDraft(blankAffirmation());
      setMessage("Affirmation hidden.");
    }
  }

  async function factoryResetAccount() {
    if (!supabase || !selectedResetId || resetConfirm !== "RESET") return;

    setSaving("reset");
    setMessage("");

    const { data, error } = await supabase.rpc("admin_factory_reset_account", {
      target_user_id: selectedResetId
    });

    setSaving("");

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-19-admin-settings.sql in Supabase.`);
      return;
    }

    setResetConfirm("");
    setMessage(`Factory reset complete. Deleted ${data?.[0]?.deleted_rows ?? 0} rows for ${selectedResetProfile?.full_name || selectedResetProfile?.email || "selected account"}.`);
  }

  async function copySignupLink() {
    const copied = await copyTextToClipboard(signupLink);
    setMessage(copied ? "Signup link copied." : signupLink);
  }

  return (
    <section className="screen-stack admin-settings-screen">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Settings</h1>
          <p>Manage mindset resources, affirmations and test-account tools.</p>
        </div>
        <button className="primary-action" onClick={loadAdminSettings} type="button">Refresh</button>
      </div>

      {message ? <p className={message.includes("Run supabase") ? "form-message error" : "form-message success"}>{message}</p> : null}

      {previewAccount ? (
        <div className="panel admin-preview-banner">
          <div>
            <p className="eyebrow">Preview active</p>
            <h2>Viewing as {previewAccount.name}</h2>
            <p>This changes app context for testing. It does not sign into that Supabase Auth account.</p>
          </div>
          <button className="primary-action filled" onClick={() => onPreviewAccount(null)} type="button">Exit preview</button>
        </div>
      ) : null}

      <section className="panel admin-settings-panel signup-link-panel">
        <div>
          <p className="eyebrow">New user signup</p>
          <h2>Shareable signup link</h2>
          <p>This link always opens the user signup screen and clears any local logged-in session first.</p>
        </div>
        <div className="copy-link-row">
          <input readOnly value={signupLink} />
          <button className="primary-action filled" onClick={copySignupLink} type="button">
            Copy
          </button>
        </div>
      </section>

      <section className="panel admin-settings-panel">
        <div className="section-row">
          <div>
            <p className="eyebrow">Test account preview</p>
            <h2>Switch app view</h2>
            <p>Quickly preview the four known build/test accounts without logging out.</p>
          </div>
        </div>
        <div className="admin-test-grid">
          {testProfiles.map((profile) => (
            <article key={profile.email}>
              <div>
                <strong>{profile.label}</strong>
                <span>{profile.email}</span>
                <em>{profile.id ? profile.role : "Not found in profiles"}</em>
              </div>
              <button
                className="primary-action compact"
                disabled={!profile.id}
                onClick={() => onPreviewAccount(profile)}
                type="button"
              >
                View as
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-settings-panel">
        <div>
          <p className="eyebrow">Mindset resources</p>
          <h2>Resource library</h2>
          <p>Use one of the five panels. Each panel can contain any resource link type.</p>
        </div>
        <form className="admin-settings-form" onSubmit={saveResource}>
          <div className="form-grid two">
            <label>Title<input onChange={(event) => setResourceDraft((current) => ({ ...current, title: event.target.value }))} value={resourceDraft.title} /></label>
            <label>Panel<select onChange={(event) => setResourceDraft((current) => ({ ...current, category: event.target.value }))} value={resourceDraft.category}>{resourceCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          </div>
          <label>Link<input onChange={(event) => setResourceDraft((current) => ({ ...current, url: event.target.value }))} placeholder="YouTube, article, website or podcast link" value={resourceDraft.url} /></label>
          <label>Thumbnail URL<input onChange={(event) => setResourceDraft((current) => ({ ...current, thumbnail_url: event.target.value }))} placeholder="Optional low-size thumbnail URL" value={resourceDraft.thumbnail_url} /></label>
          <label>Summary<textarea onChange={(event) => setResourceDraft((current) => ({ ...current, description: event.target.value }))} value={resourceDraft.description} /></label>
          <div className="form-footer-actions">
            <button className="primary-action filled" disabled={saving === "resource"} type="submit">{resourceDraft.id ? "Update Resource" : "Add Resource"}</button>
            <button className="primary-action" onClick={() => setResourceDraft(blankResource)} type="button">Clear</button>
          </div>
        </form>
        <div className="admin-resource-list">
          {resourceCategories.map((category) => (
            <section key={category}>
              <p className="eyebrow">{category}</p>
              {(resources.filter((resource) => (resource.category || "Featured") === category).length
                ? resources.filter((resource) => (resource.category || "Featured") === category)
                : []
              ).map((resource) => (
                <article key={resource.id}>
                  <div>
                    <strong>{resource.title}</strong>
                    <span>{resource.description || "No summary"}</span>
                  </div>
                  <button className="primary-action compact" onClick={() => editResource(resource)} type="button">Edit</button>
                  <button className="primary-action compact danger" disabled={saving === resource.id} onClick={() => archiveResource(resource.id)} type="button">Hide</button>
                </article>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section className="panel admin-settings-panel">
        <div>
          <p className="eyebrow">Affirmations</p>
          <h2>Daily affirmation bank</h2>
          <p>Submitted affirmations are grouped by theme and used by the Mindset daily affirmation picker.</p>
        </div>
        <form className="admin-settings-form" onSubmit={saveAffirmation}>
          <label>Theme<select onChange={(event) => setAffirmationDraft((current) => ({ ...current, theme: event.target.value }))} value={affirmationDraft.theme}>{affirmationThemes.map((theme) => <option key={theme}>{theme}</option>)}</select></label>
          <label>Affirmation<textarea onChange={(event) => setAffirmationDraft((current) => ({ ...current, text: event.target.value }))} placeholder="Write one affirmation..." value={affirmationDraft.text} /></label>
          <div className="form-footer-actions">
            <button className="primary-action filled" disabled={saving === "affirmation"} type="submit">{affirmationDraft.id ? "Update Affirmation" : "Add Affirmation"}</button>
            <button className="primary-action" onClick={() => setAffirmationDraft(blankAffirmation())} type="button">Clear</button>
          </div>
        </form>
        <div className="admin-affirmation-list">
          {affirmationThemes.map((theme) => (
            <section key={theme}>
              <p className="eyebrow">{theme}</p>
              {affirmations.filter((affirmation) => affirmation.theme === theme).slice(0, 8).map((affirmation) => (
                <article key={affirmation.id}>
                  <span>{affirmation.text}</span>
                  <button className="primary-action compact" onClick={() => setAffirmationDraft(affirmation)} type="button">Edit</button>
                  <button className="primary-action compact danger" disabled={saving === affirmation.id} onClick={() => archiveAffirmation(affirmation.id)} type="button">Hide</button>
                </article>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section className="panel admin-settings-panel danger-zone">
        <div>
          <p className="eyebrow">Factory reset</p>
          <h2>Wipe app data for an account</h2>
          <p>This clears Movementz app records for the selected profile, but keeps the Supabase Auth login and profile shell.</p>
        </div>
        <label>Account<select onChange={(event) => setSelectedResetId(event.target.value)} value={selectedResetId}><option value="">Choose account...</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email} - {profile.email}</option>)}</select></label>
        <label>Type RESET to confirm<input onChange={(event) => setResetConfirm(event.target.value)} value={resetConfirm} /></label>
        <button className="primary-action danger" disabled={!selectedResetId || resetConfirm !== "RESET" || saving === "reset"} onClick={factoryResetAccount} type="button">
          {saving === "reset" ? "Resetting..." : "Factory Reset Account"}
        </button>
      </section>

      {loading ? <p className="compact-help">Loading admin settings...</p> : null}
    </section>
  );
}
