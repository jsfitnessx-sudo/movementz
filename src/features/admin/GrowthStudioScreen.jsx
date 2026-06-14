import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const contentAudiences = ["PTs", "Gyms", "Online coaches", "Small studios", "Beta users", "Clients"];
const contentTones = ["Raw/human", "Funny", "Educational", "Motivational"];
const platforms = ["Instagram", "TikTok", "Facebook", "LinkedIn", "YouTube Shorts"];
const contentStatuses = ["Draft", "Ready", "Posted"];
const leadTypes = ["PT", "Gym", "Online coach", "Small studio", "Beta user"];
const leadStatuses = ["New", "Contacted", "Replied", "Follow-up", "Won", "Lost"];

const blankContentForm = {
  topic: "AI workout builder launch",
  audience: "PTs",
  tone: "Raw/human",
  platform: "Instagram",
  scheduled_date: "",
  notes: ""
};

const blankLeadForm = {
  name: "",
  business_name: "",
  lead_type: "PT",
  email: "",
  social_url: "",
  website_url: "",
  notes: "",
  status: "New"
};

const blankBrandVoice = {
  app_name: "MUVMENTZ",
  offer_summary: "A fitness app for workouts, coaching, progress, food logging and simple AI tools.",
  target_audiences: "PTs, gyms, online coaches, small studios, beta users and everyday clients.",
  tone_notes: "Raw, practical, direct, a bit funny, never corporate.",
  words_to_use: "MUVMENTZ, build, coach, members, progress, simple, real life",
  words_to_avoid: "METZ, hustle bro, miracle, guaranteed transformation",
  default_cta: "DM me MUVMENTZ if you want early access."
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function copyText(parts) {
  return parts.filter(Boolean).join("\n\n");
}

function fallbackContent({ topic, audience, tone }, brandVoice) {
  const appName = brandVoice.app_name || "MUVMENTZ";
  const cta = brandVoice.default_cta || "DM me if you want early access.";
  return {
    hook: `${appName} is being built for ${audience.toLowerCase()} who want less admin and better coaching.`,
    caption: [
      `${topic} is not about replacing the coach.`,
      "It is about removing the boring bits so coaches can spend more time coaching.",
      `For ${audience.toLowerCase()}, the win is simple: faster planning, clearer delivery and a better client experience.`,
      tone === "Funny" ? "Basically, less spreadsheet pain and fewer notes lost in the group chat." : "",
      cta
    ].filter(Boolean).join("\n\n"),
    reel_idea: "Film a quick screen recording of the feature, cut to you explaining the problem, then show the simple before/after.",
    script: [
      "Opening shot: you looking at the camera.",
      `Say: "If you coach people online, ${topic.toLowerCase()} should not take up your whole night."`,
      "Show the app screen or a quick mock workflow.",
      `Close with: "${cta}"`
    ].join("\n"),
    hashtags: ["#MUVMENTZ", "#PersonalTrainer", "#OnlineCoach", "#FitnessBusiness", "#FitnessApp"],
    cta
  };
}

function fallbackLeadMessage(lead, brandVoice, mode = "outreach") {
  const name = lead.name || "there";
  const business = lead.business_name ? ` at ${lead.business_name}` : "";
  const appName = brandVoice.app_name || "MUVMENTZ";
  if (mode === "follow_up") {
    return `Hey ${name}, just wanted to follow up on ${appName}.\n\nI am looking for a few ${String(lead.lead_type || "fitness pros").toLowerCase()} to test the app and give honest feedback before I push it harder.\n\nNo pressure at all, but if you want a look I can send it through.`;
  }
  return `Hey ${name}${business}, I am building ${appName}, a fitness app for coaches, clients and gym communities.\n\nI am looking for a few ${String(lead.lead_type || "fitness pros").toLowerCase()} to test the early version and tell me what is actually useful.\n\nWould you be open to having a quick look?`;
}

function normalizeGeneratedContent(payload, fallback) {
  const content = payload?.content || payload || {};
  return {
    hook: content.hook || fallback.hook,
    caption: content.caption || fallback.caption,
    reel_idea: content.reel_idea || fallback.reel_idea,
    script: content.script || fallback.script,
    hashtags: Array.isArray(content.hashtags) ? content.hashtags : fallback.hashtags,
    cta: content.cta || fallback.cta
  };
}

function formatDate(value) {
  if (!value) return "Unscheduled";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function GrowthStudioScreen({ sessionAccessToken = "", user }) {
  const [activeView, setActiveView] = useState("content");
  const [contentForm, setContentForm] = useState({ ...blankContentForm, scheduled_date: todayDate() });
  const [leadForm, setLeadForm] = useState(blankLeadForm);
  const [brandVoice, setBrandVoice] = useState(blankBrandVoice);
  const [contentDrafts, setContentDrafts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [generatedLeadMessage, setGeneratedLeadMessage] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || leads[0] || null, [leads, selectedLeadId]);
  const sortedContent = useMemo(() => [...contentDrafts].sort((a, b) => String(a.scheduled_date || "").localeCompare(String(b.scheduled_date || ""))), [contentDrafts]);

  const loadGrowthStudio = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    const [brandResponse, contentResponse, leadsResponse] = await Promise.all([
      supabase.from("growth_brand_voice").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("growth_content_posts").select("*").eq("user_id", user.id).order("scheduled_date", { ascending: true }).order("created_at", { ascending: false }).limit(120),
      supabase.from("growth_leads").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(120)
    ]);
    setLoading(false);
    if (brandResponse.error && brandResponse.error.code !== "PGRST116") {
      setMessage(`${brandResponse.error.message}. Run supabase/phase-45-growth-studio.sql in Supabase.`);
      return;
    }
    if (contentResponse.error || leadsResponse.error) {
      setMessage(`${contentResponse.error?.message || leadsResponse.error?.message}. Run supabase/phase-45-growth-studio.sql in Supabase.`);
      return;
    }
    if (brandResponse.data) setBrandVoice({ ...blankBrandVoice, ...brandResponse.data });
    setContentDrafts(contentResponse.data || []);
    setLeads(leadsResponse.data || []);
  }, [user.id]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      if (alive) await loadGrowthStudio();
    });
    return () => {
      alive = false;
    };
  }, [loadGrowthStudio]);

  async function requestGrowthCopy(payload) {
    if (!sessionAccessToken) throw new Error("Missing session token.");
    const response = await fetch("/api/generate-growth-copy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not generate copy.");
    return data;
  }

  async function generateContent(event) {
    event.preventDefault();
    const fallback = fallbackContent(contentForm, brandVoice);
    setSaving("generate-content");
    setMessage("");
    try {
      const data = await requestGrowthCopy({
        type: "content",
        topic: contentForm.topic,
        audience: contentForm.audience,
        tone: contentForm.tone,
        platform: contentForm.platform,
        notes: contentForm.notes,
        brandVoice
      });
      setGeneratedContent(normalizeGeneratedContent(data, fallback));
      setMessage("Content pack generated.");
    } catch (error) {
      setGeneratedContent(fallback);
      setMessage(`${error.message} Using a local draft for now.`);
    } finally {
      setSaving("");
    }
  }

  async function saveGeneratedContent() {
    if (!generatedContent) return;
    if (!supabase || user.id === "demo-user") {
      setMessage("Content draft ready. Connect Supabase to save it.");
      return;
    }
    setSaving("save-content");
    const payload = {
      user_id: user.id,
      topic: contentForm.topic.trim(),
      audience: contentForm.audience,
      tone: contentForm.tone,
      platform: contentForm.platform,
      scheduled_date: contentForm.scheduled_date || null,
      status: "Draft",
      hook: generatedContent.hook,
      caption: generatedContent.caption,
      reel_idea: generatedContent.reel_idea,
      script: generatedContent.script,
      hashtags: generatedContent.hashtags,
      cta: generatedContent.cta,
      notes: contentForm.notes.trim() || null
    };
    const { error } = await supabase.from("growth_content_posts").insert(payload);
    setSaving("");
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-45-growth-studio.sql in Supabase.`);
      return;
    }
    setMessage("Saved to content calendar.");
    await loadGrowthStudio();
  }

  async function updateContentStatus(post, status) {
    if (!supabase) return;
    const { error } = await supabase.from("growth_content_posts").update({ status, updated_at: new Date().toISOString() }).eq("id", post.id);
    if (error) setMessage(error.message);
    else setContentDrafts((current) => current.map((item) => item.id === post.id ? { ...item, status } : item));
  }

  async function saveLead(event) {
    event.preventDefault();
    if (!leadForm.name.trim() && !leadForm.business_name.trim()) {
      setMessage("Add a lead name or business.");
      return;
    }
    if (!supabase || user.id === "demo-user") {
      setMessage("Lead ready. Connect Supabase to save it.");
      return;
    }
    setSaving("lead");
    const payload = {
      ...leadForm,
      user_id: user.id,
      name: leadForm.name.trim() || null,
      business_name: leadForm.business_name.trim() || null,
      email: leadForm.email.trim() || null,
      social_url: leadForm.social_url.trim() || null,
      website_url: leadForm.website_url.trim() || null,
      notes: leadForm.notes.trim() || null
    };
    const { error } = await supabase.from("growth_leads").insert(payload);
    setSaving("");
    if (error) {
      setMessage(`${error.message}. Run supabase/phase-45-growth-studio.sql in Supabase.`);
      return;
    }
    setLeadForm(blankLeadForm);
    setMessage("Lead saved.");
    await loadGrowthStudio();
  }

  async function updateLeadStatus(lead, status) {
    if (!supabase) return;
    const { error } = await supabase.from("growth_leads").update({ status, updated_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) setMessage(error.message);
    else setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status } : item));
  }

  async function generateLeadMessage(mode) {
    if (!selectedLead) {
      setMessage("Add or select a lead first.");
      return;
    }
    const fallback = fallbackLeadMessage(selectedLead, brandVoice, mode);
    setSaving(mode);
    setMessage("");
    try {
      const data = await requestGrowthCopy({ type: mode, lead: selectedLead, brandVoice });
      setGeneratedLeadMessage(data.message || fallback);
      setMessage(mode === "follow_up" ? "Follow-up generated." : "Outreach generated.");
    } catch (error) {
      setGeneratedLeadMessage(fallback);
      setMessage(`${error.message} Using a local draft for now.`);
    } finally {
      setSaving("");
    }
  }

  async function saveBrandVoice(event) {
    event.preventDefault();
    if (!supabase || user.id === "demo-user") {
      setMessage("Brand voice ready. Connect Supabase to save it.");
      return;
    }
    setSaving("brand");
    const payload = { ...brandVoice, user_id: user.id, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("growth_brand_voice").upsert(payload, { onConflict: "user_id" });
    setSaving("");
    setMessage(error ? `${error.message}. Run supabase/phase-45-growth-studio.sql in Supabase.` : "Brand voice saved.");
  }

  return (
    <section className="screen-stack growth-studio-screen">
      <div className="screen-heading">
        <p className="eyebrow">Admin</p>
        <h1>MUVMENTZ Growth Studio</h1>
        <p>Create content packs, organise leads and keep your beta-user outreach in one place.</p>
      </div>

      <div className="growth-tabs" role="tablist" aria-label="Growth Studio sections">
        {[
          ["content", "Content Agent"],
          ["calendar", "Calendar"],
          ["leads", "Lead Agent"],
          ["brand", "Brand Voice"]
        ].map(([id, label]) => (
          <button className={activeView === id ? "active" : ""} key={id} onClick={() => setActiveView(id)} type="button">
            {label}
          </button>
        ))}
      </div>

      {message ? <p className={message.includes("Run supabase") || message.includes("Missing") ? "form-message error" : "form-message success"}>{message}</p> : null}
      {loading ? <p className="form-message success">Loading Growth Studio...</p> : null}

      {activeView === "content" ? (
        <div className="growth-grid">
          <form className="panel growth-panel growth-form" onSubmit={generateContent}>
            <div className="section-row">
              <h2>Content Agent</h2>
              <span className="status-pill">Level 2</span>
            </div>
            <label>Topic<input value={contentForm.topic} onChange={(event) => setContentForm((current) => ({ ...current, topic: event.target.value }))} /></label>
            <div className="growth-form-row">
              <label>Audience<select value={contentForm.audience} onChange={(event) => setContentForm((current) => ({ ...current, audience: event.target.value }))}>{contentAudiences.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Tone<select value={contentForm.tone} onChange={(event) => setContentForm((current) => ({ ...current, tone: event.target.value }))}>{contentTones.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="growth-form-row">
              <label>Platform<select value={contentForm.platform} onChange={(event) => setContentForm((current) => ({ ...current, platform: event.target.value }))}>{platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Date<input type="date" value={contentForm.scheduled_date} onChange={(event) => setContentForm((current) => ({ ...current, scheduled_date: event.target.value }))} /></label>
            </div>
            <label>Notes<textarea value={contentForm.notes} onChange={(event) => setContentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Feature details, offer, objection to handle or rough idea" /></label>
            <button className="primary-action filled" disabled={saving === "generate-content"} type="submit">{saving === "generate-content" ? "Generating..." : "Generate content pack"}</button>
          </form>

          <section className="panel growth-panel growth-output">
            <div className="section-row">
              <h2>Generated Pack</h2>
              {generatedContent ? <button className="primary-action compact" disabled={saving === "save-content"} onClick={saveGeneratedContent} type="button">{saving === "save-content" ? "Saving..." : "Save"}</button> : null}
            </div>
            {generatedContent ? (
              <>
                <article><strong>Hook</strong><p>{generatedContent.hook}</p></article>
                <article><strong>Caption</strong><pre>{generatedContent.caption}</pre></article>
                <article><strong>Reel idea</strong><p>{generatedContent.reel_idea}</p></article>
                <article><strong>Script</strong><pre>{generatedContent.script}</pre></article>
                <article><strong>Hashtags</strong><p>{generatedContent.hashtags?.join(" ")}</p></article>
                <textarea readOnly value={copyText([generatedContent.hook, generatedContent.caption, generatedContent.cta, generatedContent.hashtags?.join(" ")])} />
              </>
            ) : (
              <p className="compact-help">Generate a pack to get a caption, hook, reel idea, script, CTA and hashtags.</p>
            )}
          </section>
        </div>
      ) : null}

      {activeView === "calendar" ? (
        <section className="panel growth-panel">
          <div className="section-row">
            <h2>Content Calendar</h2>
            <span className="status-pill">{sortedContent.length}</span>
          </div>
          <div className="growth-calendar-list">
            {sortedContent.map((post) => (
              <article key={post.id}>
                <div>
                  <span>{formatDate(post.scheduled_date)} · {post.platform}</span>
                  <strong>{post.topic}</strong>
                  <p>{post.hook}</p>
                </div>
                <select value={post.status} onChange={(event) => updateContentStatus(post, event.target.value)}>
                  {contentStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </article>
            ))}
            {!sortedContent.length ? <p className="compact-help">Saved content packs will appear here.</p> : null}
          </div>
        </section>
      ) : null}

      {activeView === "leads" ? (
        <div className="growth-grid">
          <form className="panel growth-panel growth-form" onSubmit={saveLead}>
            <div className="section-row">
              <h2>Lead Agent</h2>
              <span className="status-pill">Manual MVP</span>
            </div>
            <div className="growth-form-row">
              <label>Name<input value={leadForm.name} onChange={(event) => setLeadForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Business<input value={leadForm.business_name} onChange={(event) => setLeadForm((current) => ({ ...current, business_name: event.target.value }))} /></label>
            </div>
            <div className="growth-form-row">
              <label>Type<select value={leadForm.lead_type} onChange={(event) => setLeadForm((current) => ({ ...current, lead_type: event.target.value }))}>{leadTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Status<select value={leadForm.status} onChange={(event) => setLeadForm((current) => ({ ...current, status: event.target.value }))}>{leadStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label>Email<input value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label>Instagram/social<input value={leadForm.social_url} onChange={(event) => setLeadForm((current) => ({ ...current, social_url: event.target.value }))} /></label>
            <label>Website<input value={leadForm.website_url} onChange={(event) => setLeadForm((current) => ({ ...current, website_url: event.target.value }))} /></label>
            <label>Notes<textarea value={leadForm.notes} onChange={(event) => setLeadForm((current) => ({ ...current, notes: event.target.value }))} placeholder="What do they do, why are they a fit, what should the message mention?" /></label>
            <button className="primary-action filled" disabled={saving === "lead"} type="submit">{saving === "lead" ? "Saving..." : "Save lead"}</button>
          </form>

          <section className="panel growth-panel">
            <div className="section-row">
              <h2>Outreach</h2>
              <span className="status-pill">{leads.length}</span>
            </div>
            <label className="growth-select-label">Lead<select value={selectedLead?.id || ""} onChange={(event) => setSelectedLeadId(event.target.value)}>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name || lead.business_name || lead.email || "Lead"} · {lead.status}</option>)}</select></label>
            <div className="growth-action-row">
              <button className="primary-action compact" disabled={!selectedLead || saving === "outreach"} onClick={() => generateLeadMessage("outreach")} type="button">First message</button>
              <button className="primary-action compact" disabled={!selectedLead || saving === "follow_up"} onClick={() => generateLeadMessage("follow_up")} type="button">Follow-up</button>
            </div>
            {generatedLeadMessage ? <textarea className="growth-message-box" readOnly value={generatedLeadMessage} /> : <p className="compact-help">Select a lead to generate outreach or follow-up copy.</p>}
            <div className="growth-lead-list">
              {leads.map((lead) => (
                <article key={lead.id}>
                  <button type="button" onClick={() => setSelectedLeadId(lead.id)}>
                    <strong>{lead.name || lead.business_name || "Unnamed lead"}</strong>
                    <span>{lead.business_name || lead.email || lead.social_url || lead.lead_type}</span>
                  </button>
                  <select value={lead.status} onChange={(event) => updateLeadStatus(lead, event.target.value)}>
                    {leadStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeView === "brand" ? (
        <form className="panel growth-panel growth-form" onSubmit={saveBrandVoice}>
          <div className="section-row">
            <h2>Brand Voice</h2>
            <span className="status-pill">MUVMENTZ</span>
          </div>
          <label>App name<input value={brandVoice.app_name} onChange={(event) => setBrandVoice((current) => ({ ...current, app_name: event.target.value }))} /></label>
          <label>Offer summary<textarea value={brandVoice.offer_summary} onChange={(event) => setBrandVoice((current) => ({ ...current, offer_summary: event.target.value }))} /></label>
          <label>Target audiences<textarea value={brandVoice.target_audiences} onChange={(event) => setBrandVoice((current) => ({ ...current, target_audiences: event.target.value }))} /></label>
          <label>Tone notes<textarea value={brandVoice.tone_notes} onChange={(event) => setBrandVoice((current) => ({ ...current, tone_notes: event.target.value }))} /></label>
          <div className="growth-form-row">
            <label>Words to use<textarea value={brandVoice.words_to_use} onChange={(event) => setBrandVoice((current) => ({ ...current, words_to_use: event.target.value }))} /></label>
            <label>Words to avoid<textarea value={brandVoice.words_to_avoid} onChange={(event) => setBrandVoice((current) => ({ ...current, words_to_avoid: event.target.value }))} /></label>
          </div>
          <label>Default CTA<input value={brandVoice.default_cta} onChange={(event) => setBrandVoice((current) => ({ ...current, default_cta: event.target.value }))} /></label>
          <button className="primary-action filled" disabled={saving === "brand"} type="submit">{saving === "brand" ? "Saving..." : "Save brand voice"}</button>
        </form>
      ) : null}
    </section>
  );
}
