import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const poses = ["front", "side", "back"];
const bucketName = "progress-photos";
const maxImageBytes = 900 * 1024;
const maxThumbBytes = 90 * 1024;
const goalTypes = [
  { value: "lose_weight", label: "Lose weight", detail: "Target fat loss and scale weight drop" },
  { value: "gain_muscle", label: "Gain muscle", detail: "Build size with a calorie surplus" },
  { value: "recomp", label: "Recomp", detail: "Lose fat while gaining or keeping muscle" },
  { value: "get_fit", label: "Get fit", detail: "Improve consistency, fitness and body composition" }
];
const activityLevels = [
  { value: "sedentary", label: "Sedentary", multiplier: 1.2 },
  { value: "light", label: "Light activity", multiplier: 1.375 },
  { value: "moderate", label: "Moderately active", multiplier: 1.55 },
  { value: "very", label: "Very active", multiplier: 1.725 },
  { value: "athlete", label: "Athlete", multiplier: 1.9 }
];
const deficitStyles = [
  { value: "conservative", label: "Conservative", calories: 250 },
  { value: "moderate", label: "Moderate", calories: 500 },
  { value: "aggressive", label: "Aggressive", calories: 750 }
];
const trackerDurations = [4, 6, 8, 10, 12];
const measurementFields = [
  ["neck_cm", "Neck cm"],
  ["chest_cm", "Chest cm"],
  ["waist_cm", "Waist cm"],
  ["hips_cm", "Hips cm"],
  ["left_bicep_cm", "Left bicep cm"],
  ["right_bicep_cm", "Right bicep cm"],
  ["left_thigh_cm", "Left thigh cm"],
  ["right_thigh_cm", "Right thigh cm"]
];
const trackerSelect =
  "id,user_id,goal_name,goal_type,gender,age,height_cm,activity_level,start_weight_kg,goal_weight_kg,deficit_style,maintenance_calories,target_calories,body_fat_percent,fat_kg,muscle_kg,neck_cm,chest_cm,waist_cm,hips_cm,left_bicep_cm,right_bicep_cm,left_thigh_cm,right_thigh_cm,duration_weeks,start_date,status,initial_photo_ids,completed_at,archived_at,final_summary,created_at";

function blankTrackerForm(profile) {
  return {
    goal_name: "Body Transformation",
    goal_type: "lose_weight",
    gender: profile?.gender || "",
    age: profile?.age ?? "",
    height_cm: "",
    activity_level: "moderate",
    start_weight_kg: "",
    goal_weight_kg: "",
    deficit_style: "moderate",
    body_fat_percent: "",
    fat_kg: "",
    muscle_kg: "",
    neck_cm: "",
    chest_cm: "",
    waist_cm: "",
    hips_cm: "",
    left_bicep_cm: "",
    right_bicep_cm: "",
    left_thigh_cm: "",
    right_thigh_cm: "",
    duration_weeks: 8,
    start_date: new Date().toISOString().slice(0, 10)
  };
}

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateCalories(form) {
  const weight = numericOrNull(form.start_weight_kg);
  const height = numericOrNull(form.height_cm);
  const age = numericOrNull(form.age);
  const gender = form.gender;
  if (!weight || !height || !age || !gender) return null;

  const genderOffset = gender === "female" ? -161 : 5;
  const bmr = Math.round(10 * weight + 6.25 * height - 5 * age + genderOffset);
  const activity = activityLevels.find((level) => level.value === form.activity_level) || activityLevels[2];
  const maintenance = Math.round(bmr * activity.multiplier);
  const deficit = deficitStyles.find((style) => style.value === form.deficit_style)?.calories || 500;
  const target =
    form.goal_type === "gain_muscle"
      ? maintenance + Math.max(200, Math.round(deficit / 2))
      : form.goal_type === "get_fit" || form.goal_type === "recomp"
        ? maintenance
        : maintenance - deficit;

  return { bmr, maintenance, target };
}

function formatTrackerDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function buildWeekRows(tracker, checkins) {
  if (!tracker) return [];
  return Array.from({ length: tracker.duration_weeks || 0 }, (_, index) => {
    const weekNumber = index + 1;
    const checkin = checkins.find((row) => row.week_number === weekNumber);
    const dueDate = new Date(`${tracker.start_date}T00:00:00`);
    dueDate.setDate(dueDate.getDate() + index * 7);
    return {
      weekNumber,
      checkin,
      dueDate: dueDate.toISOString().slice(0, 10)
    };
  });
}

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

function imageExtension(blob) {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  return "jpg";
}

function drawCompressedCanvas(image, maxLongEdge) {
  const longestEdge = Math.max(image.width, image.height);
  const scale = Math.min(1, maxLongEdge / longestEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  context.fillStyle = "#061018";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function encodeSmallest(canvas, quality) {
  const blobs = await Promise.all([
    canvasToBlob(canvas, "image/jpeg", quality),
    canvasToBlob(canvas, "image/webp", quality)
  ]);

  return blobs.filter(Boolean).sort((left, right) => left.size - right.size)[0] || null;
}

async function compressImage(file, maxLongEdge, quality, maxBytes) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = imageUrl;
    await image.decode();

    const edgeSteps = [maxLongEdge, 1280, 1120, 960, 840, 720, 640, 560, 480, 420, 360];
    const qualitySteps = [quality, 0.68, 0.6, 0.52, 0.44, 0.36, 0.3, 0.24];
    let smallestResult = null;

    for (const edge of edgeSteps) {
      const canvas = drawCompressedCanvas(image, edge);
      for (const nextQuality of qualitySteps) {
        const result = await encodeSmallest(canvas, nextQuality);
        if (!result) continue;
        if (!smallestResult || result.size < smallestResult.size) smallestResult = result;
        if (result.size <= maxBytes) return result;
      }
    }

    if (!smallestResult) throw new Error("Could not compress this photo.");
    if (smallestResult.size <= maxBytes * 1.15) return smallestResult;
    throw new Error("This photo is unusually large. Try a different photo or crop it first.");
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function uploadStorageObject(path, blob) {
  return supabase.storage.from(bucketName).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false
  });
}

function formatProgressPhotoError(error) {
  const message = error?.message || "Something went wrong.";
  const isCompressionError = /compress|large|crop|photo/i.test(message);
  if (isCompressionError) return message;
  return `${message}. Run supabase/phase-12-progress-photos.sql in Supabase.`;
}

function formatTrackerPhotoError(error) {
  const message = error?.message || "Something went wrong.";
  if (/compress|large|crop|photo/i.test(message)) return message;
  return `${message}. Run supabase/phase-14-tracker-photos.sql in Supabase.`;
}

function isSuccessMessage(message) {
  return /saved|started|updated|completed|archived|deleted|uploaded/i.test(message || "");
}

function estimateOneRepMax(kg, reps) {
  const weight = Number(kg) || 0;
  const repCount = Number(reps) || 0;
  if (!weight || !repCount) return 0;
  return weight * (1 + repCount / 30);
}

function formatRecordDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatRecordDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return minutes ? `${minutes}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;
}

function buildProgressRecords(sessions) {
  const maxWeightByExercise = new Map();
  const bestOneRepByExercise = new Map();
  const forTimeByWorkout = new Map();
  let bestVolume = null;

  for (const session of sessions || []) {
    if (!bestVolume || Number(session.total_volume_kg || 0) > Number(bestVolume.total_volume_kg || 0)) {
      bestVolume = session;
    }

    if (session.workout_type === "hiit" && Number(session.duration_seconds) > 0) {
      const current = forTimeByWorkout.get(session.name);
      if (!current || Number(session.duration_seconds) < Number(current.duration_seconds)) {
        forTimeByWorkout.set(session.name, session);
      }
    }

    for (const exercise of session.session_log_exercises || []) {
      for (const set of exercise.session_log_sets || []) {
        if (!set.completed || !set.kg || !set.reps) continue;
        const exerciseName = exercise.exercise_name || "Exercise";
        const heaviest = maxWeightByExercise.get(exerciseName);
        if (!heaviest || Number(set.kg) > Number(heaviest.kg)) {
          maxWeightByExercise.set(exerciseName, {
            exerciseName,
            kg: Number(set.kg),
            reps: Number(set.reps),
            sessionName: session.name,
            date: session.completed_at
          });
        }

        const estimatedOneRepMax = estimateOneRepMax(set.kg, set.reps);
        const bestOneRep = bestOneRepByExercise.get(exerciseName);
        if (!bestOneRep || estimatedOneRepMax > bestOneRep.estimatedOneRepMax) {
          bestOneRepByExercise.set(exerciseName, {
            exerciseName,
            estimatedOneRepMax,
            kg: Number(set.kg),
            reps: Number(set.reps),
            sessionName: session.name,
            date: session.completed_at
          });
        }
      }
    }
  }

  return {
    bestVolume,
    count: maxWeightByExercise.size + bestOneRepByExercise.size + forTimeByWorkout.size + (bestVolume ? 1 : 0),
    forTime: [...forTimeByWorkout.values()].slice(0, 5),
    maxWeight: [...maxWeightByExercise.values()].sort((left, right) => right.kg - left.kg).slice(0, 6),
    oneRepMax: [...bestOneRepByExercise.values()]
      .sort((left, right) => right.estimatedOneRepMax - left.estimatedOneRepMax)
      .slice(0, 6)
  };
}

export function ProgressPhotosScreen({ profile, role = "normal_user", user }) {
  const [photos, setPhotos] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [pose, setPose] = useState("front");
  const [note, setNote] = useState("");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [progressView, setProgressView] = useState("hub");
  const [tracker, setTracker] = useState(null);
  const [completedTrackers, setCompletedTrackers] = useState([]);
  const [progressRecords, setProgressRecords] = useState(() => buildProgressRecords([]));
  const [checkins, setCheckins] = useState([]);
  const [trackerForm, setTrackerForm] = useState(() => blankTrackerForm(profile));
  const [checkinForm, setCheckinForm] = useState({});
  const [initialPhotoFiles, setInitialPhotoFiles] = useState({});
  const [weekPhotoFiles, setWeekPhotoFiles] = useState({});
  const [editingWeek, setEditingWeek] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadingTracker, setLoadingTracker] = useState(Boolean(supabase));
  const [loadingRecords, setLoadingRecords] = useState(Boolean(supabase));
  const [uploading, setUploading] = useState(false);
  const [savingTracker, setSavingTracker] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  const targetUserId = role === "coach" ? selectedClientId : user.id;
  const canUpload = role !== "coach";

  const counts = useMemo(() => {
    return Object.fromEntries(poses.map((nextPose) => [nextPose, photos.filter((photo) => photo.pose === nextPose).length]));
  }, [photos]);

  const beforePhoto = useMemo(() => photos.find((photo) => photo.id === beforeId), [beforeId, photos]);
  const afterPhoto = useMemo(() => photos.find((photo) => photo.id === afterId), [afterId, photos]);
  const calorieEstimate = useMemo(() => calculateCalories(trackerForm), [trackerForm]);
  const weekRows = useMemo(() => buildWeekRows(tracker, checkins), [checkins, tracker]);
  const latestCheckin = useMemo(() => [...checkins].sort((a, b) => b.week_number - a.week_number)[0], [checkins]);
  const currentWeight = latestCheckin?.weight_kg ?? tracker?.start_weight_kg ?? null;
  const weightChange = currentWeight && tracker?.start_weight_kg ? Number(currentWeight) - Number(tracker.start_weight_kg) : null;
  const goalProgress = useMemo(() => {
    if (!tracker?.start_weight_kg || !tracker?.goal_weight_kg || currentWeight === null) return null;
    const total = Number(tracker.goal_weight_kg) - Number(tracker.start_weight_kg);
    const done = Number(currentWeight) - Number(tracker.start_weight_kg);
    if (!total) return null;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [currentWeight, tracker]);

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

  const signCheckinPhotoThumbs = useCallback(async (rows) => {
    if (!supabase || !rows.length) return rows;
    const photoIds = rows.flatMap((row) => poses.map((nextPose) => row.photo_ids?.[nextPose]).filter(Boolean));
    if (!photoIds.length) return rows;

    const { data, error } = await supabase
      .from("progress_photos")
      .select("id,pose,thumbnail_path,taken_at")
      .in("id", photoIds);

    if (error || !data?.length) return rows;

    const signed = await Promise.all(
      data.map(async (photo) => {
        const { data: thumbData } = await supabase.storage.from(bucketName).createSignedUrl(photo.thumbnail_path, 60 * 60);
        return { ...photo, thumbnail_url: thumbData?.signedUrl || "" };
      })
    );
    const byId = Object.fromEntries(signed.map((photo) => [photo.id, photo]));

    return rows.map((row) => ({
      ...row,
      photo_thumbnails: poses.map((nextPose) => byId[row.photo_ids?.[nextPose]]).filter(Boolean)
    }));
  }, []);

  const signFinalSummaryPhotos = useCallback(async (rows) => {
    if (!supabase || !rows.length) return rows;
    const photoIds = rows.flatMap((row) => {
      const summary = row.final_summary || {};
      return [
        ...poses.map((nextPose) => summary.initial_photo_ids?.[nextPose]).filter(Boolean),
        ...poses.map((nextPose) => summary.final_photo_ids?.[nextPose]).filter(Boolean)
      ];
    });

    if (!photoIds.length) return rows;

    const { data, error } = await supabase
      .from("progress_photos")
      .select("id,pose,thumbnail_path,taken_at")
      .in("id", photoIds);

    if (error || !data?.length) return rows;

    const signed = await Promise.all(
      data.map(async (photo) => {
        const { data: thumbData } = await supabase.storage.from(bucketName).createSignedUrl(photo.thumbnail_path, 60 * 60);
        return { ...photo, thumbnail_url: thumbData?.signedUrl || "" };
      })
    );
    const byId = Object.fromEntries(signed.map((photo) => [photo.id, photo]));

    return rows.map((row) => {
      const summary = row.final_summary || {};
      return {
        ...row,
        final_summary: {
          ...summary,
          initial_photos: poses.map((nextPose) => byId[summary.initial_photo_ids?.[nextPose]]).filter(Boolean),
          final_photos: poses.map((nextPose) => byId[summary.final_photo_ids?.[nextPose]]).filter(Boolean)
        }
      };
    });
  }, []);

  const loadCompletedTrackers = useCallback(async () => {
    if (!targetUserId || !supabase || user.id === "demo-user") {
      setCompletedTrackers([]);
      return;
    }

    const { data, error } = await supabase
      .from("goal_trackers")
      .select(trackerSelect)
      .eq("user_id", targetUserId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(6);

    if (error) {
      setCompletedTrackers([]);
      setMessage(`${error.message}. Run supabase/phase-15-tracker-completion.sql in Supabase.`);
      return;
    }

    setCompletedTrackers(await signFinalSummaryPhotos(data || []));
  }, [signFinalSummaryPhotos, targetUserId, user.id]);

  const loadProgressRecords = useCallback(async () => {
    if (!targetUserId || !supabase || user.id === "demo-user") {
      setProgressRecords(buildProgressRecords([]));
      setLoadingRecords(false);
      return;
    }

    setLoadingRecords(true);

    const { data, error } = await supabase
      .from("session_logs")
      .select(
        "id,name,workout_type,completed_at,duration_seconds,total_exercises,completed_sets,total_volume_kg,session_log_exercises(id,exercise_name,split_duration_seconds,session_log_sets(id,set_number,kg,reps,completed))"
      )
      .eq("owner_id", targetUserId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(60);

    setLoadingRecords(false);

    if (error) {
      setProgressRecords(buildProgressRecords([]));
      setMessage(`${error.message}. Run supabase/phase-3-session-logging.sql in Supabase.`);
      return;
    }

    setProgressRecords(buildProgressRecords(data || []));
  }, [targetUserId, user.id]);

  const loadTracker = useCallback(async () => {
    if (!targetUserId || !supabase || user.id === "demo-user") {
      setTracker(null);
      setCheckins([]);
      setLoadingTracker(false);
      return;
    }

    setLoadingTracker(true);

    const { data, error } = await supabase
      .from("goal_trackers")
      .select(trackerSelect)
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setTracker(null);
      setCheckins([]);
      setLoadingTracker(false);
      setMessage(`${error.message}. Run supabase/phase-13-goal-trackers.sql and supabase/phase-14-tracker-photos.sql in Supabase.`);
      return;
    }

    setTracker(data || null);
    if (!data) {
      setCheckins([]);
      setLoadingTracker(false);
      return;
    }

    const { data: checkinRows, error: checkinError } = await supabase
      .from("goal_tracker_checkins")
      .select("id,tracker_id,user_id,week_number,checkin_date,weight_kg,body_fat_percent,fat_kg,muscle_kg,neck_cm,chest_cm,waist_cm,hips_cm,left_bicep_cm,right_bicep_cm,left_thigh_cm,right_thigh_cm,energy,mood,notes,photo_ids,created_at")
      .eq("tracker_id", data.id)
      .order("week_number", { ascending: true });

    if (checkinError) {
      setCheckins([]);
      setMessage(`${checkinError.message}. Run supabase/phase-13-goal-trackers.sql and supabase/phase-14-tracker-photos.sql in Supabase.`);
    } else {
      setCheckins(await signCheckinPhotoThumbs(checkinRows || []));
    }
    setLoadingTracker(false);
  }, [signCheckinPhotoThumbs, targetUserId, user.id]);

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

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadTracker();
    });
    return () => {
      alive = false;
    };
  }, [loadTracker]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadCompletedTrackers();
    });
    return () => {
      alive = false;
    };
  }, [loadCompletedTrackers]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadProgressRecords();
    });
    return () => {
      alive = false;
    };
  }, [loadProgressRecords]);

  function updateTrackerForm(field, value) {
    setTrackerForm((current) => ({ ...current, [field]: value }));
  }

  function updateCheckinForm(field, value) {
    setCheckinForm((current) => ({ ...current, [field]: value }));
  }

  function updateInitialPhotoFile(nextPose, file) {
    setInitialPhotoFiles((current) => ({ ...current, [nextPose]: file || null }));
  }

  function updateWeekPhotoFile(nextPose, file) {
    setWeekPhotoFiles((current) => ({ ...current, [nextPose]: file || null }));
  }

  async function uploadTrackerPhotoFile({ context, file, note: photoNote, nextPose, trackerId, weekNumber = null }) {
    let [imageBlob, thumbnailBlob] = await Promise.all([
      compressImage(file, 1400, 0.72, maxImageBytes),
      compressImage(file, 360, 0.56, maxThumbBytes)
    ]);

    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let imagePath = `${user.id}/${stamp}-${context}-${nextPose}.${imageExtension(imageBlob)}`;
    const thumbnailPath = `${user.id}/${stamp}-${context}-${nextPose}-thumb.${imageExtension(thumbnailBlob)}`;

    let imageUpload = await uploadStorageObject(imagePath, imageBlob);
    if (imageUpload.error && /size|exceed|large/i.test(imageUpload.error.message || "")) {
      imageBlob = await compressImage(file, 960, 0.58, 650 * 1024);
      imagePath = `${user.id}/${stamp}-${context}-${nextPose}-small.${imageExtension(imageBlob)}`;
      imageUpload = await uploadStorageObject(imagePath, imageBlob);
    }
    if (imageUpload.error) throw imageUpload.error;

    const thumbUpload = await uploadStorageObject(thumbnailPath, thumbnailBlob);
    if (thumbUpload.error) throw thumbUpload.error;

    const { data, error } = await supabase
      .from("progress_photos")
      .insert({
        user_id: user.id,
        pose: nextPose,
        note: photoNote,
        image_path: imagePath,
        thumbnail_path: thumbnailPath,
        tracker_id: trackerId,
        tracker_week_number: weekNumber,
        photo_context: context
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  async function startTracker(event) {
    event.preventDefault();
    if (!supabase || user.id === "demo-user") return;

    const calories = calculateCalories(trackerForm);
    const payload = {
      user_id: user.id,
      goal_name: trackerForm.goal_name.trim() || "Body Transformation",
      goal_type: trackerForm.goal_type,
      gender: trackerForm.gender || null,
      age: numericOrNull(trackerForm.age),
      height_cm: numericOrNull(trackerForm.height_cm),
      activity_level: trackerForm.activity_level,
      start_weight_kg: numericOrNull(trackerForm.start_weight_kg),
      goal_weight_kg: numericOrNull(trackerForm.goal_weight_kg),
      deficit_style: trackerForm.deficit_style,
      maintenance_calories: calories?.maintenance || null,
      target_calories: calories?.target || null,
      body_fat_percent: numericOrNull(trackerForm.body_fat_percent),
      fat_kg: numericOrNull(trackerForm.fat_kg),
      muscle_kg: numericOrNull(trackerForm.muscle_kg),
      duration_weeks: Number(trackerForm.duration_weeks),
      start_date: trackerForm.start_date
    };
    measurementFields.forEach(([field]) => {
      payload[field] = numericOrNull(trackerForm[field]);
    });

    setSavingTracker(true);
    setMessage("");
    try {
      const { data, error } = await supabase.from("goal_trackers").insert(payload).select(trackerSelect).single();
      if (error) throw error;

      const initialPhotoIds = {};
      for (const nextPose of poses) {
        if (initialPhotoFiles[nextPose]) {
          initialPhotoIds[nextPose] = await uploadTrackerPhotoFile({
            context: "tracker_initial",
            file: initialPhotoFiles[nextPose],
            nextPose,
            note: `Initial ${labelPose(nextPose)} tracker photo`,
            trackerId: data.id
          });
        }
      }

      const { data: updatedTracker, error: updateError } = await supabase
        .from("goal_trackers")
        .update({ initial_photo_ids: initialPhotoIds })
        .eq("id", data.id)
        .eq("user_id", user.id)
        .select(trackerSelect)
        .single();
      if (updateError) throw updateError;

      setTracker(updatedTracker);
      setCheckins([]);
      setInitialPhotoFiles({});
      setProgressView("tracker");
      setMessage("Goal tracker started.");
      await loadPhotos();
    } catch (error) {
      setMessage(formatTrackerPhotoError(error));
    } finally {
      setSavingTracker(false);
    }
  }

  function openWeekLog(week) {
    const source = week.checkin || {};
    setEditingWeek(week.weekNumber);
    setCheckinForm({
      checkin_date: source.checkin_date || new Date().toISOString().slice(0, 10),
      weight_kg: source.weight_kg ?? "",
      body_fat_percent: source.body_fat_percent ?? "",
      fat_kg: source.fat_kg ?? "",
      muscle_kg: source.muscle_kg ?? "",
      neck_cm: source.neck_cm ?? "",
      chest_cm: source.chest_cm ?? "",
      waist_cm: source.waist_cm ?? "",
      hips_cm: source.hips_cm ?? "",
      left_bicep_cm: source.left_bicep_cm ?? "",
      right_bicep_cm: source.right_bicep_cm ?? "",
      left_thigh_cm: source.left_thigh_cm ?? "",
      right_thigh_cm: source.right_thigh_cm ?? "",
      energy: source.energy ?? "",
      mood: source.mood ?? "",
      notes: source.notes ?? "",
      photo_ids: source.photo_ids || {}
    });
    setWeekPhotoFiles({});
  }

  async function saveWeekCheckin(event) {
    event.preventDefault();
    if (!tracker || !editingWeek || !supabase || user.id === "demo-user") return;

    const payload = {
      tracker_id: tracker.id,
      user_id: user.id,
      week_number: editingWeek,
      checkin_date: checkinForm.checkin_date || new Date().toISOString().slice(0, 10),
      weight_kg: numericOrNull(checkinForm.weight_kg),
      body_fat_percent: numericOrNull(checkinForm.body_fat_percent),
      fat_kg: numericOrNull(checkinForm.fat_kg),
      muscle_kg: numericOrNull(checkinForm.muscle_kg),
      energy: numericOrNull(checkinForm.energy),
      mood: numericOrNull(checkinForm.mood),
      notes: checkinForm.notes?.trim() || null
    };
    measurementFields.forEach(([field]) => {
      payload[field] = numericOrNull(checkinForm[field]);
    });

    setSavingTracker(true);
    setMessage("");
    try {
      const existingPhotoIds = checkinForm.photo_ids || {};
      const photoIds = { ...existingPhotoIds };

      for (const nextPose of poses) {
        if (weekPhotoFiles[nextPose]) {
          photoIds[nextPose] = await uploadTrackerPhotoFile({
            context: "tracker_week",
            file: weekPhotoFiles[nextPose],
            nextPose,
            note: `Week ${editingWeek} ${labelPose(nextPose)} check-in photo`,
            trackerId: tracker.id,
            weekNumber: editingWeek
          });
        }
      }

      const { error } = await supabase
        .from("goal_tracker_checkins")
        .upsert({ ...payload, photo_ids: photoIds }, { onConflict: "tracker_id,week_number" });
      if (error) throw error;

      setEditingWeek(null);
      setCheckinForm({});
      setWeekPhotoFiles({});
      setMessage(`Week ${payload.week_number} check-in saved.`);
      await loadTracker();
      await loadPhotos();
    } catch (error) {
      setMessage(formatTrackerPhotoError(error));
    } finally {
      setSavingTracker(false);
    }
  }

  async function completeTracker() {
    if (!tracker || !supabase || user.id === "demo-user") return;
    const finalCheckin = checkins.find((row) => row.week_number === tracker.duration_weeks);
    if (!finalCheckin) {
      setMessage(`Log week ${tracker.duration_weeks} before submitting final results.`);
      return;
    }
    if (!window.confirm("Submit final tracker results and finish this tracker?")) return;

    const finalSummary = buildFinalTrackerSummary(tracker, finalCheckin, checkins);
    setSavingTracker(true);
    setMessage("");
    const { error } = await supabase
      .from("goal_trackers")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        final_summary: finalSummary
      })
      .eq("id", tracker.id)
      .eq("user_id", user.id);
    setSavingTracker(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-15-tracker-completion.sql in Supabase.`);
      return;
    }

    setTracker(null);
    setCheckins([]);
    setProgressView("hub");
    setMessage("Tracker completed. Final summary saved.");
    await loadCompletedTrackers();
  }

  async function saveStartingMeasurements(form) {
    if (!tracker || !supabase || user.id === "demo-user") return;

    const nextTrackerShape = { ...tracker, ...form };
    const calories = calculateCalories(nextTrackerShape);
    const payload = {
      start_weight_kg: numericOrNull(form.start_weight_kg),
      body_fat_percent: numericOrNull(form.body_fat_percent),
      fat_kg: numericOrNull(form.fat_kg),
      muscle_kg: numericOrNull(form.muscle_kg),
      maintenance_calories: calories?.maintenance || tracker.maintenance_calories || null,
      target_calories: calories?.target || tracker.target_calories || null
    };
    measurementFields.forEach(([field]) => {
      payload[field] = numericOrNull(form[field]);
    });

    setSavingTracker(true);
    setMessage("");
    const { data, error } = await supabase
      .from("goal_trackers")
      .update(payload)
      .eq("id", tracker.id)
      .eq("user_id", user.id)
      .select(trackerSelect)
      .single();
    setSavingTracker(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTracker(data);
    setMessage("Starting measurements updated.");
  }

  async function archiveTracker() {
    if (!tracker || !supabase || user.id === "demo-user") return;
    if (!window.confirm("Archive this tracker? You can start a new tracker after archiving.")) return;

    setSavingTracker(true);
    setMessage("");
    const { error } = await supabase
      .from("goal_trackers")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", tracker.id)
      .eq("user_id", user.id);
    setSavingTracker(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-15-tracker-completion.sql in Supabase.`);
      return;
    }

    setTracker(null);
    setCheckins([]);
    setProgressView("hub");
    setMessage("Tracker archived. You can start a new one when ready.");
  }

  async function deleteTracker() {
    if (!tracker || !supabase || user.id === "demo-user") return;
    if (!window.confirm("Delete this tracker and its weekly check-ins? This cannot be undone.")) return;

    setSavingTracker(true);
    setMessage("");
    const { error } = await supabase
      .from("goal_trackers")
      .delete()
      .eq("id", tracker.id)
      .eq("user_id", user.id);
    setSavingTracker(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTracker(null);
    setCheckins([]);
    setProgressView("hub");
    setMessage("Tracker deleted. You can start again.");
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase || user.id === "demo-user") return;

    setUploading(true);
    setMessage("");

    try {
      let [imageBlob, thumbnailBlob] = await Promise.all([
        compressImage(file, 1400, 0.72, maxImageBytes),
        compressImage(file, 360, 0.56, maxThumbBytes)
      ]);

      const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let imagePath = `${user.id}/${stamp}-${pose}.${imageExtension(imageBlob)}`;
      const thumbnailPath = `${user.id}/${stamp}-${pose}-thumb.${imageExtension(thumbnailBlob)}`;

      let imageUpload = await uploadStorageObject(imagePath, imageBlob);
      if (imageUpload.error && /size|exceed|large/i.test(imageUpload.error.message || "")) {
        imageBlob = await compressImage(file, 960, 0.58, 650 * 1024);
        imagePath = `${user.id}/${stamp}-${pose}-small.${imageExtension(imageBlob)}`;
        imageUpload = await uploadStorageObject(imagePath, imageBlob);
      }
      if (imageUpload.error) throw imageUpload.error;

      const thumbUpload = await uploadStorageObject(thumbnailPath, thumbnailBlob);
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
      setMessage(formatProgressPhotoError(error));
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

  if (role !== "coach" && progressView === "setup") {
    return (
      <TrackerSetupScreen
        calorieEstimate={calorieEstimate}
        form={trackerForm}
        initialPhotoFiles={initialPhotoFiles}
        onBack={() => setProgressView("hub")}
        onPhotoChange={updateInitialPhotoFile}
        onSubmit={startTracker}
        onUpdate={updateTrackerForm}
        saving={savingTracker}
      />
    );
  }

  if (role !== "coach" && tracker && progressView === "tracker") {
    return (
      <TrackerDashboardScreen
        checkinForm={checkinForm}
        checkins={checkins}
        currentWeight={currentWeight}
        editingWeek={editingWeek}
        goalProgress={goalProgress}
        loading={loadingTracker}
        message={message}
        onBack={() => setProgressView("hub")}
        onCancelWeek={() => setEditingWeek(null)}
        onArchiveTracker={archiveTracker}
        onCompleteTracker={completeTracker}
        onDeleteTracker={deleteTracker}
        onOpenPhotos={() => setProgressView("photos")}
        onOpenWeek={openWeekLog}
        onPhotoChange={updateWeekPhotoFile}
        onSaveStartingMeasurements={saveStartingMeasurements}
        onSaveWeek={saveWeekCheckin}
        onUpdateCheckin={updateCheckinForm}
        saving={savingTracker}
        tracker={tracker}
        weekPhotoFiles={weekPhotoFiles}
        weekRows={weekRows}
        weightChange={weightChange}
      />
    );
  }

  if (role !== "coach" && progressView === "hub") {
    return (
      <section className="screen-stack progress-screen">
        <div className="screen-heading progress-heading centered">
          <div>
            <h1>Progress <span>Hub</span></h1>
            <p>View your records, photos and body tracking. Start a goal tracker only when you want a focused tracking block.</p>
          </div>
        </div>

        {message ? <p className={isSuccessMessage(message) ? "form-message success" : "form-message error"}>{message}</p> : null}
        {loadingTracker ? <p className="form-message success">Loading progress tracker...</p> : null}

        <div className="progress-hub-grid">
          <button className="progress-hub-card teal" onClick={() => setProgressView(tracker ? "tracker" : "setup")} type="button">
            <span>Goal tracker</span>
            <strong>{tracker ? tracker.goal_name : "Start tracker"}</strong>
            <em>{tracker ? `${tracker.duration_weeks} week ${tracker.goal_type.replace("_", " ")}` : "Optional body, weight and measurement tracking block."}</em>
          </button>
          <button className="progress-hub-card gold" onClick={() => setRecordsOpen((open) => !open)} type="button">
            <span>Progress records</span>
            <strong>{loadingRecords ? "Loading" : `${progressRecords.count} PRs`}</strong>
            <em>{progressRecords.bestVolume ? `Best volume: ${Math.round(progressRecords.bestVolume.total_volume_kg || 0).toLocaleString()}kg` : "Strength records and best volume will appear here."}</em>
          </button>
          <button className="progress-hub-card blue" onClick={() => setProgressView("photos")} type="button">
            <span>Progress photos</span>
            <strong>{photos.length} photos</strong>
            <em>Private photos and compare mode.</em>
          </button>
          <div className="progress-hub-card">
            <span>Latest</span>
            <strong>{latestCheckin ? `Week ${latestCheckin.week_number}` : "No records yet"}</strong>
            <em>{latestCheckin ? `${latestCheckin.weight_kg || "-"}kg logged` : "Complete workouts or tracker logs to populate this section."}</em>
          </div>
        </div>

        {recordsOpen ? (
          <section className="progress-records-section">
            <div className="section-row">
              <p className="eyebrow">Progress records</p>
              <button className="primary-action compact" onClick={loadProgressRecords} type="button">Refresh</button>
            </div>
            <ProgressRecordsPanel records={progressRecords} />
          </section>
        ) : null}

        {completedTrackers.length ? (
          <section className="tracker-results-section">
            <div className="section-row">
              <p className="eyebrow">Completed trackers</p>
              <button className="primary-action compact" onClick={loadCompletedTrackers} type="button">Refresh</button>
            </div>
            <div className="tracker-results-list">
              {completedTrackers.map((completedTracker) => (
                <FinalTrackerSummaryCard key={completedTracker.id} tracker={completedTracker} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  return (
    <section className="screen-stack progress-screen">
      <div className="screen-heading progress-heading">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>Progress <span>Photos</span></h1>
          <p>Private front, side and back photos so you can compare changes over time.</p>
        </div>
        {role !== "coach" ? (
          <button className="primary-action compact" onClick={() => setProgressView("hub")} type="button">Back</button>
        ) : null}
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

      {message ? <p className={isSuccessMessage(message) ? "form-message success" : "form-message error"}>{message}</p> : null}
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

function ProgressRecordsPanel({ records }) {
  const hasRecords = records.count > 0;
  if (!hasRecords) {
    return (
      <div className="panel empty-state">
        <p>Complete workouts with weights, reps, volume or For Time sessions to populate PRs.</p>
      </div>
    );
  }

  return (
    <div className="progress-records-grid">
      {records.bestVolume ? (
        <article className="progress-record-card gold">
          <p className="eyebrow">Best volume session</p>
          <strong>{Math.round(records.bestVolume.total_volume_kg || 0).toLocaleString()}kg</strong>
          <span>{records.bestVolume.name} - {formatRecordDate(records.bestVolume.completed_at)}</span>
        </article>
      ) : null}

      {records.forTime.length ? (
        <article className="progress-record-card">
          <p className="eyebrow">For Time PBs</p>
          <div className="progress-record-list">
            {records.forTime.map((session) => (
              <span key={session.id}>
                <strong>{session.name}</strong>
                <em>{formatRecordDuration(session.duration_seconds)} - {formatRecordDate(session.completed_at)}</em>
              </span>
            ))}
          </div>
        </article>
      ) : null}

      <article className="progress-record-card">
        <p className="eyebrow">Heaviest sets</p>
        {records.maxWeight.length ? (
          <div className="progress-record-list">
            {records.maxWeight.map((record) => (
              <span key={record.exerciseName}>
                <strong>{record.exerciseName}</strong>
                <em>{record.kg}kg x {record.reps} - {formatRecordDate(record.date)}</em>
              </span>
            ))}
          </div>
        ) : (
          <p className="compact-help">Log completed weighted sets to show heaviest lifts.</p>
        )}
      </article>

      <article className="progress-record-card">
        <p className="eyebrow">Estimated 1RM</p>
        {records.oneRepMax.length ? (
          <div className="progress-record-list">
            {records.oneRepMax.map((record) => (
              <span key={record.exerciseName}>
                <strong>{record.exerciseName}</strong>
                <em>{Math.round(record.estimatedOneRepMax)}kg est - {record.kg}kg x {record.reps}</em>
              </span>
            ))}
          </div>
        ) : (
          <p className="compact-help">Estimated 1RMs appear after weighted sets are logged.</p>
        )}
      </article>
    </div>
  );
}

function formatChange(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}${suffix}`;
}

function FinalTrackerSummaryCard({ tracker }) {
  const summary = tracker.final_summary || {};
  const measurements = Object.values(summary.measurements || {}).filter((item) => item.change !== null && item.change !== undefined);
  const initialPhotos = summary.initial_photos || [];
  const finalPhotos = summary.final_photos || [];
  const completedDate = summary.completed_at || tracker.completed_at;

  return (
    <article className="tracker-final-card">
      <div className="tracker-final-head">
        <div>
          <p className="eyebrow">Final summary</p>
          <h2>{tracker.goal_name}</h2>
          <span>{tracker.duration_weeks} weeks - completed {formatTrackerDate(completedDate?.slice(0, 10) || completedDate)}</span>
        </div>
        <strong>{summary.checkins_logged || 0}/{tracker.duration_weeks || 0}</strong>
      </div>

      <div className="tracker-final-stats">
        <div>
          <span>Start weight</span>
          <strong>{summary.start?.weight_kg ?? "-"}kg</strong>
        </div>
        <div>
          <span>Final weight</span>
          <strong>{summary.final?.weight_kg ?? "-"}kg</strong>
        </div>
        <div>
          <span>Weight change</span>
          <strong>{formatChange(summary.changes?.weight_kg, "kg")}</strong>
        </div>
        <div>
          <span>Body fat</span>
          <strong>{formatChange(summary.changes?.body_fat_percent, "%")}</strong>
        </div>
        <div>
          <span>Fat mass</span>
          <strong>{formatChange(summary.changes?.fat_kg, "kg")}</strong>
        </div>
        <div>
          <span>Muscle mass</span>
          <strong>{formatChange(summary.changes?.muscle_kg, "kg")}</strong>
        </div>
      </div>

      {measurements.length ? (
        <div className="tracker-final-measures">
          {measurements.map((item) => (
            <span key={item.label}>{item.label.replace(" cm", "")}: {formatChange(item.change, "cm")}</span>
          ))}
        </div>
      ) : null}

      {initialPhotos.length || finalPhotos.length ? (
        <div className="tracker-final-photos">
          <FinalPhotoGroup label="Initial" photos={initialPhotos} />
          <FinalPhotoGroup label="Final" photos={finalPhotos} />
        </div>
      ) : null}
    </article>
  );
}

function FinalPhotoGroup({ label, photos }) {
  if (!photos.length) return null;
  return (
    <div>
      <span>{label}</span>
      <div>
        {photos.map((photo) => (
          <img alt={`${label} ${photo.pose}`} key={photo.id} src={photo.thumbnail_url} />
        ))}
      </div>
    </div>
  );
}

function TrackerSetupScreen({ calorieEstimate, form, initialPhotoFiles, onBack, onPhotoChange, onSubmit, onUpdate, saving }) {
  return (
    <section className="screen-stack tracker-screen">
      <div className="screen-heading progress-heading">
        <div>
          <p className="eyebrow">Set up tracker</p>
          <h1>Goal <span>Tracker</span></h1>
          <p>Set your starting point once, then log weekly progress through the block.</p>
        </div>
        <button className="primary-action compact" onClick={onBack} type="button">Back</button>
      </div>

      <form className="panel tracker-setup-form" onSubmit={onSubmit}>
        <label className="form-field full">
          Goal name
          <input value={form.goal_name} onChange={(event) => onUpdate("goal_name", event.target.value)} />
        </label>

        <div className="tracker-option-grid">
          {goalTypes.map((type) => (
            <button className={form.goal_type === type.value ? "active" : ""} key={type.value} onClick={() => onUpdate("goal_type", type.value)} type="button">
              <strong>{type.label}</strong>
              <span>{type.detail}</span>
            </button>
          ))}
        </div>

        <div className="tracker-field-grid">
          <label className="form-field">
            Age
            <input inputMode="decimal" value={form.age} onChange={(event) => onUpdate("age", event.target.value)} />
          </label>
          <label className="form-field">
            Height cm
            <input inputMode="decimal" value={form.height_cm} onChange={(event) => onUpdate("height_cm", event.target.value)} />
          </label>
          <label className="form-field">
            Gender
            <select value={form.gender} onChange={(event) => onUpdate("gender", event.target.value)}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="form-field">
            Activity
            <select value={form.activity_level} onChange={(event) => onUpdate("activity_level", event.target.value)}>
              {activityLevels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
            </select>
          </label>
          <label className="form-field">
            Current weight kg
            <input inputMode="decimal" value={form.start_weight_kg} onChange={(event) => onUpdate("start_weight_kg", event.target.value)} />
          </label>
          <label className="form-field">
            Goal weight kg
            <input inputMode="decimal" value={form.goal_weight_kg} onChange={(event) => onUpdate("goal_weight_kg", event.target.value)} />
          </label>
        </div>

        <div className="tracker-option-grid three">
          {deficitStyles.map((style) => (
            <button className={form.deficit_style === style.value ? "active" : ""} key={style.value} onClick={() => onUpdate("deficit_style", style.value)} type="button">
              <strong>{style.label}</strong>
              <span>{style.calories} cal/day</span>
            </button>
          ))}
        </div>

        <section className="tracker-estimate-card">
          <p className="eyebrow">Calorie estimate</p>
          {calorieEstimate ? (
            <div className="tracker-mini-grid">
              <div><span>BMR</span><strong>{calorieEstimate.bmr}</strong></div>
              <div><span>Maintenance</span><strong>{calorieEstimate.maintenance}</strong></div>
              <div><span>Target</span><strong>{calorieEstimate.target}</strong></div>
            </div>
          ) : (
            <p>Add height, weight, age and gender to calculate BMR, maintenance calories and target calories.</p>
          )}
        </section>

        <section className="tracker-estimate-card">
          <p className="eyebrow">Initial photos</p>
          <div className="tracker-photo-row">
            {poses.map((nextPose) => (
              <TrackerPhotoInput
                file={initialPhotoFiles[nextPose]}
                key={nextPose}
                label={labelPose(nextPose)}
                onChange={(file) => onPhotoChange(nextPose, file)}
              />
            ))}
          </div>
          <p>Add front, side and back photos now if you have them. You can still start and update them later.</p>
        </section>

        <section className="tracker-estimate-card">
          <p className="eyebrow">Optional body scan info</p>
          <div className="tracker-field-grid three">
            <label className="form-field">Body fat %<input inputMode="decimal" value={form.body_fat_percent} onChange={(event) => onUpdate("body_fat_percent", event.target.value)} /></label>
            <label className="form-field">Fat kg<input inputMode="decimal" value={form.fat_kg} onChange={(event) => onUpdate("fat_kg", event.target.value)} /></label>
            <label className="form-field">Muscle kg<input inputMode="decimal" value={form.muscle_kg} onChange={(event) => onUpdate("muscle_kg", event.target.value)} /></label>
          </div>
        </section>

        <section className="tracker-estimate-card">
          <p className="eyebrow">Starting measurements</p>
          <div className="tracker-field-grid">
            {measurementFields.map(([field, label]) => (
              <label className="form-field" key={field}>{label}<input inputMode="decimal" value={form[field]} onChange={(event) => onUpdate(field, event.target.value)} /></label>
            ))}
          </div>
        </section>

        <div className="tracker-field-grid">
          <label className="form-field">
            Tracking duration
            <select value={form.duration_weeks} onChange={(event) => onUpdate("duration_weeks", event.target.value)}>
              {trackerDurations.map((weeks) => <option key={weeks} value={weeks}>{weeks} weeks</option>)}
            </select>
          </label>
          <label className="form-field">
            Start date
            <input type="date" value={form.start_date} onChange={(event) => onUpdate("start_date", event.target.value)} />
          </label>
        </div>

        <button className="primary-action filled" disabled={saving} type="submit">
          {saving ? "Starting..." : "Start Goal Tracker"}
        </button>
      </form>
    </section>
  );
}

function TrackerDashboardScreen({
  checkinForm,
  checkins,
  currentWeight,
  editingWeek,
  goalProgress,
  loading,
  message,
  onArchiveTracker,
  onBack,
  onCancelWeek,
  onCompleteTracker,
  onDeleteTracker,
  onOpenPhotos,
  onOpenWeek,
  onPhotoChange,
  onSaveStartingMeasurements,
  onSaveWeek,
  onUpdateCheckin,
  saving,
  tracker,
  weekPhotoFiles,
  weekRows,
  weightChange
}) {
  const checkinPercent = tracker?.duration_weeks ? Math.round((checkins.length / tracker.duration_weeks) * 100) : 0;
  const activeWeek = weekRows.find((week) => week.weekNumber === editingWeek);
  const measurementChange = latestMeasurementChange(tracker, checkins);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startingForm, setStartingForm] = useState(() => trackerToStartingForm(tracker));
  const finalWeekLogged = weekRows.length > 0 && weekRows.every((week) => Boolean(week.checkin));

  function updateStartingForm(field, value) {
    setStartingForm((current) => ({ ...current, [field]: value }));
  }

  function toggleStartingEdit() {
    if (!editingStart) setStartingForm(trackerToStartingForm(tracker));
    setEditingStart(!editingStart);
  }

  async function submitStartingMeasurements(event) {
    event.preventDefault();
    await onSaveStartingMeasurements(startingForm);
    setEditingStart(false);
  }

  return (
    <section className="screen-stack tracker-screen">
      <div className="screen-heading progress-heading">
        <div>
          <p className="eyebrow">{tracker.goal_name} - {goalTypes.find((type) => type.value === tracker.goal_type)?.label || "Tracker"}</p>
          <h1>Progress <span>Tracker</span></h1>
          <p>{formatTrackerDate(tracker.start_date)} - {tracker.duration_weeks} weeks</p>
        </div>
        <button className="primary-action compact" onClick={onBack} type="button">Hub</button>
      </div>

      <div className="tracker-action-row">
        <button className="primary-action compact" disabled={saving} onClick={onArchiveTracker} type="button">Archive</button>
        <button className="danger-link" disabled={saving} onClick={onDeleteTracker} type="button">Delete</button>
      </div>

      {message ? <p className={isSuccessMessage(message) ? "form-message success" : "form-message error"}>{message}</p> : null}
      {loading ? <p className="form-message success">Loading tracker...</p> : null}

      <div className="tracker-summary-grid">
        <TrackerStat label="Check-ins" value={`${checkinPercent}%`} />
        <TrackerStat label="Current kg" value={currentWeight ?? "-"} />
        <TrackerStat label="Weight change" value={weightChange === null ? "-" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)}kg`} tone="gold" />
        <TrackerStat label="Maintenance cal" value={tracker.maintenance_calories || "-"} />
        <TrackerStat label="Target cal" value={tracker.target_calories || "-"} tone="gold" />
        <TrackerStat label="Goal progress" value={goalProgress === null ? "-" : `${goalProgress}%`} />
      </div>

      <p className="compact-help centered">
        Maintenance uses Mifflin-St Jeor BMR x activity level and recalculates from your tracker starting weight ({tracker.start_weight_kg || "-"}kg).
      </p>

      <div className="tracker-summary-grid two">
        <TrackerStat label="Fat mass change" value={measurementChange.fat} />
        <TrackerStat label="Muscle mass change" value={measurementChange.muscle} />
      </div>

      <section className="tracker-estimate-card tracker-charts-card">
        <div className="client-section-title">
          <div>
            <p className="eyebrow">Progress charts</p>
            <span>Open detailed tracker and lift progression graphs.</span>
          </div>
          <button className="primary-action compact" onClick={() => setChartsOpen((open) => !open)} type="button">
            {chartsOpen ? "Hide" : "Open"}
          </button>
        </div>
        <div className="tracker-chart-placeholder">
          <span style={{ width: `${Math.max(8, checkinPercent)}%` }} />
        </div>
        {chartsOpen ? <TrackerCharts tracker={tracker} checkins={checkins} /> : null}
      </section>

      <section className="tracker-estimate-card">
        <p className="eyebrow">Measurement change from start</p>
        {measurementChange.cm.length ? (
          <div className="tracker-change-list">
            {measurementChange.cm.map((item) => <span key={item.label}>{item.label}: {item.value}</span>)}
          </div>
        ) : (
          <p>Add starting measurements and at least one weekly check-in to see centimetre changes here.</p>
        )}
      </section>

      <section className="tracker-estimate-card tracker-start-card">
        <div className="client-section-title">
          <div>
            <p className="eyebrow">Starting measurements</p>
            <span>{formatTrackerDate(tracker.start_date)}</span>
          </div>
          <button className="primary-action compact" onClick={toggleStartingEdit} type="button">
            {editingStart ? "Close" : "Edit"}
          </button>
        </div>
        {editingStart ? (
          <form className="tracker-baseline-form" onSubmit={submitStartingMeasurements}>
            <div className="tracker-field-grid three">
              <label className="form-field">Weight kg<input inputMode="decimal" value={startingForm.start_weight_kg} onChange={(event) => updateStartingForm("start_weight_kg", event.target.value)} /></label>
              <label className="form-field">Body fat %<input inputMode="decimal" value={startingForm.body_fat_percent} onChange={(event) => updateStartingForm("body_fat_percent", event.target.value)} /></label>
              <label className="form-field">Muscle kg<input inputMode="decimal" value={startingForm.muscle_kg} onChange={(event) => updateStartingForm("muscle_kg", event.target.value)} /></label>
            </div>
            <div className="tracker-field-grid">
              {measurementFields.map(([field, label]) => (
                <label className="form-field" key={field}>{label}<input inputMode="decimal" value={startingForm[field]} onChange={(event) => updateStartingForm(field, event.target.value)} /></label>
              ))}
            </div>
            <button className="primary-action filled" disabled={saving} type="submit">{saving ? "Saving..." : "Save starting measurements"}</button>
          </form>
        ) : (
          <BaselineSummary tracker={tracker} />
        )}
      </section>

      {activeWeek ? (
        <form className="panel tracker-checkin-form" onSubmit={onSaveWeek}>
          <div className="client-section-title">
            <div>
              <p className="eyebrow">Week {activeWeek.weekNumber}</p>
              <span>{formatTrackerDate(activeWeek.dueDate)}</span>
            </div>
            <button className="primary-action compact" onClick={onCancelWeek} type="button">Cancel</button>
          </div>
          <div className="tracker-field-grid">
            <label className="form-field">Date<input type="date" value={checkinForm.checkin_date || ""} onChange={(event) => onUpdateCheckin("checkin_date", event.target.value)} /></label>
            <label className="form-field">Weight kg<input inputMode="decimal" value={checkinForm.weight_kg || ""} onChange={(event) => onUpdateCheckin("weight_kg", event.target.value)} /></label>
            <label className="form-field">Energy 1-5<input inputMode="numeric" value={checkinForm.energy || ""} onChange={(event) => onUpdateCheckin("energy", event.target.value)} /></label>
            <label className="form-field">Mood 1-5<input inputMode="numeric" value={checkinForm.mood || ""} onChange={(event) => onUpdateCheckin("mood", event.target.value)} /></label>
          </div>
          <div className="tracker-field-grid three">
            <label className="form-field">Body fat %<input inputMode="decimal" value={checkinForm.body_fat_percent || ""} onChange={(event) => onUpdateCheckin("body_fat_percent", event.target.value)} /></label>
            <label className="form-field">Fat kg<input inputMode="decimal" value={checkinForm.fat_kg || ""} onChange={(event) => onUpdateCheckin("fat_kg", event.target.value)} /></label>
            <label className="form-field">Muscle kg<input inputMode="decimal" value={checkinForm.muscle_kg || ""} onChange={(event) => onUpdateCheckin("muscle_kg", event.target.value)} /></label>
          </div>
          <div className="tracker-field-grid">
            {measurementFields.map(([field, label]) => (
              <label className="form-field" key={field}>{label}<input inputMode="decimal" value={checkinForm[field] || ""} onChange={(event) => onUpdateCheckin(field, event.target.value)} /></label>
            ))}
          </div>
          <label className="form-field full">
            Notes
            <textarea value={checkinForm.notes || ""} onChange={(event) => onUpdateCheckin("notes", event.target.value)} />
          </label>
          <section className="tracker-estimate-card tracker-week-photos">
            <p className="eyebrow">Week {activeWeek.weekNumber} photos</p>
            <div className="tracker-photo-row">
              {poses.map((nextPose) => (
                <TrackerPhotoInput
                  file={weekPhotoFiles[nextPose]}
                  hasExisting={Boolean(checkinForm.photo_ids?.[nextPose])}
                  key={nextPose}
                  label={labelPose(nextPose)}
                  onChange={(file) => onPhotoChange(nextPose, file)}
                />
              ))}
            </div>
          </section>
          <button className="primary-action filled" disabled={saving} type="submit">{saving ? "Saving..." : "Save week check-in"}</button>
        </form>
      ) : (
        <button className="primary-action filled" onClick={() => onOpenWeek(weekRows.find((week) => !week.checkin) || weekRows[0])} type="button">
          Log / Edit This Week
        </button>
      )}

      <button className="primary-action" onClick={onOpenPhotos} type="button">Open Progress Photos</button>

      {finalWeekLogged ? (
        <section className="tracker-estimate-card tracker-finish-card">
          <p className="eyebrow">Final submission</p>
          <p>All weekly check-ins are logged. Submit final results to complete this tracker and save the before/after summary.</p>
          <button className="primary-action filled" disabled={saving} onClick={onCompleteTracker} type="button">
            {saving ? "Submitting..." : "Submit Final Results"}
          </button>
        </section>
      ) : (
        <p className="compact-help centered">Final results unlock after week {tracker.duration_weeks} is logged.</p>
      )}

      <section className="tracker-estimate-card">
        <p className="eyebrow">Weekly measurements</p>
        <div className="tracker-week-list">
          {weekRows.map((week) => (
            <button className={week.checkin ? "logged" : ""} key={week.weekNumber} onClick={() => onOpenWeek(week)} type="button">
              <strong>Week {week.weekNumber}</strong>
              <span>{formatTrackerDate(week.dueDate)}</span>
              <em>{week.checkin ? "Logged" : "Tap to log"}</em>
              {week.checkin?.photo_thumbnails?.length ? (
                <span className="tracker-week-thumbs">
                  {week.checkin.photo_thumbnails.map((photo) => (
                    <img alt={`${photo.pose} check-in`} key={photo.id} src={photo.thumbnail_url} />
                  ))}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function TrackerPhotoInput({ file, hasExisting = false, label, onChange }) {
  return (
    <label className={`tracker-photo-input ${file || hasExisting ? "has-file" : ""}`}>
      <span>{label}</span>
      <em>{file ? "Selected" : hasExisting ? "Saved" : "Optional"}</em>
      <input accept="image/*" hidden onChange={(event) => onChange(event.target.files?.[0] || null)} type="file" />
    </label>
  );
}

function trackerToStartingForm(tracker) {
  const form = {
    start_weight_kg: tracker?.start_weight_kg ?? "",
    body_fat_percent: tracker?.body_fat_percent ?? "",
    fat_kg: tracker?.fat_kg ?? "",
    muscle_kg: tracker?.muscle_kg ?? ""
  };
  measurementFields.forEach(([field]) => {
    form[field] = tracker?.[field] ?? "";
  });
  return form;
}

function BaselineSummary({ tracker }) {
  const stats = [
    ["Weight", tracker.start_weight_kg ? `${tracker.start_weight_kg}kg` : "-"],
    ["Body fat", tracker.body_fat_percent ? `${tracker.body_fat_percent}%` : "-"],
    ["Fat", tracker.fat_kg ? `${tracker.fat_kg}kg` : "-"],
    ["Muscle", tracker.muscle_kg ? `${tracker.muscle_kg}kg` : "-"],
    ...measurementFields.map(([field, label]) => [label.replace(" cm", ""), tracker[field] ? `${tracker[field]}cm` : "-"])
  ];

  return (
    <div className="tracker-baseline-summary">
      {stats.map(([label, value]) => (
        <span key={label}>
          <em>{label}</em>
          <strong>{value}</strong>
        </span>
      ))}
    </div>
  );
}

function TrackerCharts({ checkins, tracker }) {
  const weightPoints = [
    { label: "Start", value: tracker.start_weight_kg },
    ...checkins.map((row) => ({ label: `W${row.week_number}`, value: row.weight_kg }))
  ].filter((point) => point.value !== null && point.value !== undefined && point.value !== "");
  const fatPoints = [
    { label: "Start", value: tracker.fat_kg },
    ...checkins.map((row) => ({ label: `W${row.week_number}`, value: row.fat_kg }))
  ].filter((point) => point.value !== null && point.value !== undefined && point.value !== "");
  const musclePoints = [
    { label: "Start", value: tracker.muscle_kg },
    ...checkins.map((row) => ({ label: `W${row.week_number}`, value: row.muscle_kg }))
  ].filter((point) => point.value !== null && point.value !== undefined && point.value !== "");
  const waistPoints = [
    { label: "Start", value: tracker.waist_cm },
    ...checkins.map((row) => ({ label: `W${row.week_number}`, value: row.waist_cm }))
  ].filter((point) => point.value !== null && point.value !== undefined && point.value !== "");

  return (
    <div className="tracker-chart-grid">
      <MiniLineChart color="teal" label="Weight change" points={weightPoints} suffix="kg" />
      <MiniLineChart color="gold" label="Fat mass" points={fatPoints} suffix="kg" />
      <MiniLineChart color="blue" label="Muscle mass" points={musclePoints} suffix="kg" />
      <MiniLineChart color="teal" label="Waist change" points={waistPoints} suffix="cm" />
    </div>
  );
}

function MiniLineChart({ color, label, points, suffix }) {
  if (points.length < 2) {
    return (
      <article className="mini-line-chart empty">
        <p className="eyebrow">{label}</p>
        <span>Log at least one check-in to see this chart.</span>
      </article>
    );
  }

  const values = points.map((point) => Number(point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 86 - ((Number(point.value) - min) / range) * 72;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <article className={`mini-line-chart ${color}`}>
      <p className="eyebrow">{label}</p>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={path} />
      </svg>
      <div className="mini-chart-labels">
        <span>{points[0].label}: {points[0].value}{suffix}</span>
        <strong>{points.at(-1).label}: {points.at(-1).value}{suffix}</strong>
      </div>
    </article>
  );
}

function TrackerStat({ label, tone = "teal", value }) {
  return (
    <div className={`tracker-stat ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function latestMeasurementChange(tracker, checkins) {
  const latest = [...checkins].reverse().find((row) => row.weight_kg || row.fat_kg || row.muscle_kg || row.waist_cm);
  if (!tracker || !latest) return { fat: "-", muscle: "-", cm: [] };
  const delta = (start, end, suffix = "") => {
    if (start === null || start === undefined || end === null || end === undefined) return "-";
    const value = Number(end) - Number(start);
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
  };
  return {
    fat: delta(tracker.fat_kg, latest.fat_kg, "kg"),
    muscle: delta(tracker.muscle_kg, latest.muscle_kg, "kg"),
    cm: measurementFields
      .map(([field, label]) => ({ label: label.replace(" cm", ""), value: delta(tracker[field], latest[field], "cm") }))
      .filter((item) => item.value !== "-")
  };
}

function buildFinalTrackerSummary(tracker, finalCheckin, checkins) {
  const delta = (start, end) => {
    if (start === null || start === undefined || end === null || end === undefined) return null;
    return Number(end) - Number(start);
  };

  const measurementSummary = Object.fromEntries(
    measurementFields.map(([field, label]) => [
      field,
      {
        label,
        start: tracker[field] ?? null,
        final: finalCheckin[field] ?? null,
        change: delta(tracker[field], finalCheckin[field])
      }
    ])
  );

  return {
    completed_at: new Date().toISOString(),
    duration_weeks: tracker.duration_weeks,
    checkins_logged: checkins.length,
    start: {
      weight_kg: tracker.start_weight_kg ?? null,
      body_fat_percent: tracker.body_fat_percent ?? null,
      fat_kg: tracker.fat_kg ?? null,
      muscle_kg: tracker.muscle_kg ?? null
    },
    final: {
      week_number: finalCheckin.week_number,
      weight_kg: finalCheckin.weight_kg ?? null,
      body_fat_percent: finalCheckin.body_fat_percent ?? null,
      fat_kg: finalCheckin.fat_kg ?? null,
      muscle_kg: finalCheckin.muscle_kg ?? null
    },
    changes: {
      weight_kg: delta(tracker.start_weight_kg, finalCheckin.weight_kg),
      body_fat_percent: delta(tracker.body_fat_percent, finalCheckin.body_fat_percent),
      fat_kg: delta(tracker.fat_kg, finalCheckin.fat_kg),
      muscle_kg: delta(tracker.muscle_kg, finalCheckin.muscle_kg)
    },
    measurements: measurementSummary,
    initial_photo_ids: tracker.initial_photo_ids || {},
    final_photo_ids: finalCheckin.photo_ids || {}
  };
}
