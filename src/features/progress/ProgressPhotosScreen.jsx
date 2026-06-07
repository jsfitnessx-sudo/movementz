import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const poses = ["front", "side", "back"];
const bucketName = "progress-photos";

function labelPose(pose) {
  return pose.slice(0, 1).toUpperCase() + pose.slice(1);
}

function formatPhotoDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function photoLabel(photo) {
  if (!photo) return "";
  return `${labelPose(photo.pose)} - ${formatPhotoDate(photo.taken_at)}`;
}

async function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImage(file, maxWidth, quality) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = imageUrl;
  await image.decode();

  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(imageUrl);

  const webpBlob = await canvasToBlob(canvas, "image/webp", quality);
  if (webpBlob) return webpBlob;

  return canvasToBlob(canvas, "image/jpeg", quality);
}

export function ProgressPhotosScreen({ role = "normal_user", user }) {
  const [photos, setPhotos] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [pose, setPose] = useState("front");
  const [note, setNote] = useState("");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  const targetUserId = role === "coach" ? selectedClientId : user.id;
  const canUpload = role !== "coach";

  const counts = useMemo(() => {
    return Object.fromEntries(poses.map((nextPose) => [nextPose, photos.filter((photo) => photo.pose === nextPose).length]));
  }, [photos]);

  const beforePhoto = useMemo(() => photos.find((photo) => photo.id === beforeId), [beforeId, photos]);
  const afterPhoto = useMemo(() => photos.find((photo) => photo.id === afterId), [afterId, photos]);

  const loadClients = useCallback(async () => {
    if (role !== "coach" || !supabase || user.id === "demo-user") {
      setClients([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_coach_clients");
    if (error) {
      setClients([]);
      return;
    }

    const activeClients = (data || []).filter((client) => client.status === "active");
    setClients(activeClients);
    setSelectedClientId((current) => current || activeClients[0]?.client_id || "");
  }, [role, user.id]);

  const signPhotoUrls = useCallback(async (rows) => {
    if (!supabase || !rows.length) return rows;

    const signedRows = await Promise.all(
      rows.map(async (photo) => {
        const [{ data: thumbData }, { data: fullData }] = await Promise.all([
          supabase.storage.from(bucketName).createSignedUrl(photo.thumbnail_path, 60 * 60),
          supabase.storage.from(bucketName).createSignedUrl(photo.image_path, 60 * 60)
        ]);

        return {
          ...photo,
          image_url: fullData?.signedUrl || "",
          thumbnail_url: thumbData?.signedUrl || ""
        };
      })
    );

    return signedRows;
  }, []);

  const loadPhotos = useCallback(async () => {
    if (!targetUserId || !supabase || user.id === "demo-user") {
      setPhotos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("progress_photos")
      .select("id,user_id,pose,note,image_path,thumbnail_path,taken_at,created_at")
      .eq("user_id", targetUserId)
      .order("taken_at", { ascending: false })
      .limit(60);

    setLoading(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-12-progress-photos.sql in Supabase.`);
      setPhotos([]);
      return;
    }

    const signedPhotos = await signPhotoUrls(data || []);
    setPhotos(signedPhotos);
    setBeforeId((current) => current || signedPhotos[1]?.id || signedPhotos[0]?.id || "");
    setAfterId((current) => current || signedPhotos[0]?.id || "");
  }, [signPhotoUrls, targetUserId, user.id]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadClients();
    });
    return () => {
      alive = false;
    };
  }, [loadClients]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadPhotos();
    });
    return () => {
      alive = false;
    };
  }, [loadPhotos]);

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase || user.id === "demo-user") return;

    setUploading(true);
    setMessage("");

    try {
      const [imageBlob, thumbnailBlob] = await Promise.all([
        compressImage(file, 1200, 0.72),
        compressImage(file, 420, 0.65)
      ]);

      const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const imagePath = `${user.id}/${stamp}-${pose}.webp`;
      const thumbnailPath = `${user.id}/${stamp}-${pose}-thumb.webp`;

      const imageUpload = await supabase.storage.from(bucketName).upload(imagePath, imageBlob, {
        contentType: imageBlob.type || "image/webp",
        upsert: false
      });
      if (imageUpload.error) throw imageUpload.error;

      const thumbUpload = await supabase.storage.from(bucketName).upload(thumbnailPath, thumbnailBlob, {
        contentType: thumbnailBlob.type || "image/webp",
        upsert: false
      });
      if (thumbUpload.error) throw thumbUpload.error;

      const { error } = await supabase.from("progress_photos").insert({
        user_id: user.id,
        pose,
        note: note.trim() || null,
        image_path: imagePath,
        thumbnail_path: thumbnailPath
      });
      if (error) throw error;

      setNote("");
      setMessage(`${labelPose(pose)} photo uploaded.`);
      await loadPhotos();
    } catch (error) {
      setMessage(`${error.message}. Run supabase/phase-12-progress-photos.sql in Supabase.`);
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo) {
    if (!window.confirm("Delete this progress photo?")) return;

    const { error } = await supabase.from("progress_photos").delete().eq("id", photo.id).eq("user_id", user.id);
    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.storage.from(bucketName).remove([photo.image_path, photo.thumbnail_path]);
    await loadPhotos();
  }

  return (
    <section className="screen-stack progress-screen">
      <div className="screen-heading progress-heading">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>Progress <span>Photos</span></h1>
          <p>Private front, side and back photos so you can compare changes over time.</p>
        </div>
      </div>

      {role === "coach" ? (
        <label className="progress-client-select">
          Client
          <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
            {clients.length ? null : <option value="">No active clients</option>}
            {clients.map((client) => (
              <option key={client.client_id} value={client.client_id}>
                {client.client_name || client.client_email || "Client"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {message ? <p className={message.includes("uploaded") ? "form-message success" : "form-message error"}>{message}</p> : null}
      {loading ? <p className="form-message success">Loading progress photos...</p> : null}

      {canUpload ? (
        <section className="progress-upload-card">
          <p className="eyebrow">Add progress photo</p>
          <div className="progress-pose-tabs">
            {poses.map((nextPose) => (
              <button className={pose === nextPose ? "active" : ""} key={nextPose} onClick={() => setPose(nextPose)} type="button">
                {labelPose(nextPose)}
              </button>
            ))}
          </div>
          <textarea
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note - weight, week, how you're feeling..."
            value={note}
          />
          <input accept="image/*" hidden onChange={uploadPhoto} ref={fileInputRef} type="file" />
          <button className="primary-action filled progress-upload-button" disabled={uploading} onClick={() => fileInputRef.current?.click()} type="button">
            {uploading ? "Uploading..." : "Choose Photo"}
          </button>
          <p className="compact-help">Photos are compressed before upload and kept private by default.</p>
        </section>
      ) : null}

      <div className="progress-count-grid">
        {poses.map((nextPose) => (
          <div className="progress-count-card" key={nextPose}>
            <strong>{counts[nextPose] || 0}</strong>
            <span>{labelPose(nextPose)}</span>
          </div>
        ))}
      </div>

      <section className="progress-compare-card">
        <p className="eyebrow">Compare mode</p>
        <div className="progress-compare-selects">
          <select value={beforeId} onChange={(event) => setBeforeId(event.target.value)}>
            <option value="">Before photo</option>
            {photos.map((photo) => (
              <option key={photo.id} value={photo.id}>{photoLabel(photo)}</option>
            ))}
          </select>
          <select value={afterId} onChange={(event) => setAfterId(event.target.value)}>
            <option value="">After photo</option>
            {photos.map((photo) => (
              <option key={photo.id} value={photo.id}>{photoLabel(photo)}</option>
            ))}
          </select>
        </div>
        {beforePhoto && afterPhoto ? (
          <div className="progress-compare-grid">
            <PhotoCompareCard label="Before" photo={beforePhoto} />
            <PhotoCompareCard label="After" photo={afterPhoto} />
          </div>
        ) : (
          <p className="compact-help">Pick two photos to compare.</p>
        )}
      </section>

      <div className="section-row">
        <p className="eyebrow">Photo history</p>
        <button className="primary-action compact" onClick={loadPhotos} type="button">Refresh</button>
      </div>

      {photos.length ? (
        <div className="progress-photo-grid">
          {photos.map((photo) => (
            <article className="progress-photo-card" key={photo.id}>
              <img alt={`${photo.pose} progress`} src={photo.thumbnail_url || photo.image_url} />
              <div className="progress-photo-meta">
                <strong>{labelPose(photo.pose)}</strong>
                {photo.user_id === user.id ? (
                  <button className="danger-link" onClick={() => deletePhoto(photo)} type="button">Delete</button>
                ) : null}
              </div>
              <span>{formatPhotoDate(photo.taken_at)}</span>
              {photo.note ? <p>{photo.note}</p> : null}
            </article>
          ))}
        </div>
      ) : !loading ? (
        <div className="panel empty-state">
          <p>No progress photos yet.</p>
        </div>
      ) : null}
    </section>
  );
}

function PhotoCompareCard({ label, photo }) {
  return (
    <article className="progress-compare-photo">
      <img alt={`${label} ${photo.pose}`} src={photo.image_url || photo.thumbnail_url} />
      <div>
        <strong>{label} - {labelPose(photo.pose)}</strong>
        <span>{formatPhotoDate(photo.taken_at)}</span>
      </div>
    </article>
  );
}
