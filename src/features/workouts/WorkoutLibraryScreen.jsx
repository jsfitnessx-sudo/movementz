import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { movementzIconSrc } from "../../lib/brandAssets.js";
import { supabase } from "../../lib/supabase/client.js";

const muscleGroups = ["Chest", "Back", "Legs", "Shoulders", "Biceps", "Triceps", "Core", "Body Weight", "Banded"];
const hiitFocusAreas = ["Full Body", "Upper", "Lower", "Core", "Cardio"];
const hiitTimerTypes = [
  { value: "interval", label: "Interval" },
  { value: "tabata", label: "Tabata" },
  { value: "for_time", label: "For Time" }
];
const hiitTargetTypes = [
  { value: "reps", label: "Reps" },
  { value: "meters", label: "m" },
  { value: "calories", label: "Cal" }
];
const CATALOG_SEARCH_LIMIT = 8;
const BUILDER_GROUP_OPTION_LIMIT = 5;
const youtubeApiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
const recoverableWorkoutModes = new Set(["setup", "editor", "review", "quick-log", "session", "hiit-session", "hiit-for-time"]);

function readRecoveryState(key) {
  if (!key || typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeRecoveryState(key, value) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local recovery is best-effort and should never block the workout flow.
  }
}

function clearRecoveryState(key) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the app can still continue normally.
  }
}

function loadCanvasImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

const exerciseLibrary = {
  Chest: [
    "Barbell Bench Press",
    "DB Flat Press",
    "Incline DB Press",
    "Machine Chest Press",
    "Cable Fly",
    "Pec Deck",
    "Push Up",
    "Decline DB Press"
  ],
  Back: [
    "Lat Pulldown",
    "Seated Row",
    "One Arm DB Row",
    "Barbell Row",
    "Chest Supported Row",
    "Straight Arm Pulldown",
    "Assisted Pull Up",
    "Cable Pullover"
  ],
  Legs: [
    "Back Squat",
    "Romanian Deadlift",
    "Leg Press",
    "Leg Extension",
    "Seated Leg Curl",
    "Walking Lunge",
    "Bulgarian Split Squat",
    "Hip Thrust"
  ],
  Shoulders: [
    "DB Shoulder Press",
    "Machine Shoulder Press",
    "DB Lateral Raise",
    "Cable Lateral Raise",
    "Rear Delt Fly",
    "Arnold Press",
    "BB Overhead Press",
    "Face Pull"
  ],
  Biceps: [
    "DB Curl",
    "EZ Bar Curl",
    "Cable Curl",
    "Hammer Curl",
    "Preacher Curl",
    "Incline DB Curl",
    "Machine Curl",
    "Rope Curl"
  ],
  Triceps: [
    "Rope Pushdown",
    "Overhead Cable Extension",
    "Skull Crusher",
    "Close Grip Bench Press",
    "Assisted Dip",
    "Single Arm Pushdown",
    "Triceps Extension Machine",
    "Bench Dip"
  ],
  Core: [
    "Plank",
    "Dead Bug",
    "Cable Crunch",
    "Hanging Knee Raise",
    "Ab Wheel",
    "Russian Twist",
    "Pallof Press",
    "Side Plank"
  ],
  "Body Weight": [
    "Push Up",
    "Pull Up",
    "Bodyweight Squat",
    "Reverse Lunge",
    "Walking Lunge",
    "Plank",
    "Mountain Climber",
    "Burpee",
    "Bench Dip",
    "Glute Bridge",
    "Step Up",
    "Side Plank",
    "Hollow Hold",
    "Bear Crawl"
  ],
  Banded: [
    "Banded Squat",
    "Banded Glute Bridge",
    "Banded Row",
    "Banded Chest Press",
    "Banded Face Pull",
    "Banded Lateral Walk",
    "Banded Pull Apart",
    "Banded Shoulder Press",
    "Banded Hamstring Curl",
    "Banded Triceps Pushdown",
    "Banded Biceps Curl",
    "Banded Dead Bug",
    "Banded Hip Thrust",
    "Banded Pallof Press"
  ],
  "Full Body": [
    "Bear Crawl",
    "Turkish Get Up",
    "Mountain Climber",
    "Burpee",
    "Jumping Jack",
    "DB Devil Press",
    "Sled Push",
    "Kettlebell Swing"
  ],
  Upper: [
    "Push Up",
    "Battle Rope",
    "DB Push Press",
    "Renegade Row",
    "Medicine Ball Slam",
    "Inchworm",
    "Bench Dip",
    "Plank Shoulder Tap"
  ],
  Lower: [
    "Walking Lunge",
    "Jump Squat",
    "Step Up",
    "Wall Sit",
    "Reverse Lunge",
    "Box Jump",
    "Goblet Squat",
    "Skater Jump"
  ],
  Cardio: [
    "Assault Bike",
    "Row Erg",
    "Ski Erg",
    "Treadmill Run",
    "Shuttle Run",
    "High Knees",
    "Mountain Climber",
    "Jumping Jack"
  ]
};

const emptyExercise = {
  exercise_name: "",
  muscle_group: "Chest",
  sets: 3,
  rep_min: 8,
  rep_max: 12,
  start_kg: "",
  rest_seconds: 90,
  tip: "",
  target_type: "reps",
  target_value: 10,
  search: "",
  selection_confirmed: false,
  suggestionOffset: 0
};

const quickWorkoutTypes = [
  { value: "strength", label: "Strength" },
  { value: "run", label: "Run" },
  { value: "cardio", label: "Cardio" },
  { value: "other", label: "Other" }
];

const runTypes = ["Easy", "Long", "Short", "Tempo", "Interval", "Sprint"];

const demoWorkouts = [
  {
    id: "demo-strength",
    name: "Chest + Triceps",
    notes: "Foundation example workout.",
    workout_type: "strength",
    workout_template_exercises: [
      { id: "demo-1", position: 1, exercise_name: "DB Flat Press", muscle_group: "Chest", sets: 4, rep_min: 8, rep_max: 12, start_kg: 20 },
      { id: "demo-2", position: 2, exercise_name: "Cable Fly", muscle_group: "Chest", sets: 3, rep_min: 10, rep_max: 15, start_kg: 12.5 }
    ]
  }
];

function createMuscleTargets() {
  return Object.fromEntries(muscleGroups.map((muscle) => [muscle, 0]));
}

function createExerciseForMuscle(muscle, index, defaultSets = 4, overrides = {}) {
  return {
    ...emptyExercise,
    muscle_group: muscle,
    sets: defaultSets,
    exercise_name: "",
    template_sets: createBlankTemplateSets(defaultSets),
    suggestionOffset: index,
    ...overrides
  };
}

function createBlankTemplateSets(count = 1) {
  return Array.from({ length: Math.max(1, Number(count) || 1) }, () => ({ kg: "", reps: "" }));
}

function getSuggestions(exercise) {
  const options = exerciseLibrary[exercise.muscle_group] || [];
  if (options.length <= 3) return options;

  return [0, 1, 2].map((step) => options[(exercise.suggestionOffset + step) % options.length]);
}

function toExerciseKey(exerciseName) {
  return exerciseName.trim().toLowerCase();
}

function getLocalExerciseNames() {
  return Object.values(exerciseLibrary).flat();
}

function uniqueNames(names) {
  return [...new Set(names.filter(Boolean))];
}

function isMissingSupabaseTable(error) {
  return error?.code === "42P01" || error?.message?.includes("schema cache");
}

function getYouTubeExerciseSearchUrl(exerciseName) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} exercise demo`)}`;
}

function createDemoFallback(exerciseName, note = "") {
  return {
    exerciseName,
    embedUrl: "",
    externalUrl: getYouTubeExerciseSearchUrl(exerciseName),
    loading: false,
    note,
    selectedVideoId: "",
    videos: []
  };
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsedUrl.pathname.startsWith("/embed/")) {
        videoId = parsedUrl.pathname.split("/").filter(Boolean)[1] || "";
      } else if (parsedUrl.pathname.startsWith("/shorts/")) {
        videoId = parsedUrl.pathname.split("/").filter(Boolean)[1] || "";
      } else {
        videoId = parsedUrl.searchParams.get("v") || "";
      }
    }

    if (!videoId) return "";
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  } catch {
    return "";
  }
}

async function findYouTubeDemo(exerciseName) {
  if (!youtubeApiKey) return [];

  const searchParams = new URLSearchParams({
    part: "snippet",
    maxResults: "3",
    q: `${exerciseName} exercise tutorial`,
    type: "video",
    videoDuration: "medium",
    key: youtubeApiKey
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("YouTube demo search is unavailable right now.");
  }

  const result = await response.json();
  return (result?.items || [])
    .filter((item) => item?.id?.videoId)
    .map((item) => ({
      id: item.id.videoId,
      title: item.snippet?.title || "Exercise tutorial",
      channel: item.snippet?.channelTitle || "YouTube",
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
      embedUrl: `https://www.youtube.com/embed/${item.id.videoId}?autoplay=1&rel=0`,
      externalUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
}

async function searchExerciseDb({ query = "", muscle = "", limit = CATALOG_SEARCH_LIMIT, offset = 0 }) {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    offset: String(offset)
  });
  if (query.trim()) searchParams.set("query", query.trim());
  if (muscle.trim()) searchParams.set("muscle", muscle.trim());

  const response = await fetch(`/api/exercise-search?${searchParams.toString()}`);
  if (!response.ok) return [];

  const result = await response.json();
  return (result.exercises || []).map((exercise) => exercise.exercise_name).filter(Boolean);
}

function createSessionRows(exercise, previousRows = []) {
  const setCount = Math.max(Number(exercise.sets) || 1, previousRows.length);
  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    kg: previousRows[index]?.kg ?? exercise.start_kg ?? "",
    reps: previousRows[index]?.reps ?? exercise.rep_min ?? "",
    done: false
  }));
}

function getPreviousSetChips(exercise) {
  return exercise.previousSets || [];
}

function calculateSessionSummary(workout) {
  const exercises = workout?.workout_template_exercises || [];
  const completedSets = exercises.reduce(
    (sum, exercise) => sum + (exercise.sessionRows || []).filter((row) => row.done).length,
    0
  );
  const totalVolumeKg = exercises.reduce(
    (sum, exercise) =>
      sum +
      (exercise.sessionRows || []).reduce((setSum, row) => {
        if (!row.done) return setSum;
        return setSum + (Number(row.kg) || 0) * (Number(row.reps) || 0);
      }, 0),
    0
  );

  return {
    totalExercises: exercises.length,
    completedSets,
    totalVolumeKg
  };
}

function estimateOneRepMax(kg, reps) {
  const weight = Number(kg) || 0;
  const repCount = Number(reps) || 0;
  if (!weight || !repCount) return 0;
  return weight * (1 + repCount / 30);
}

function completedStrengthSetsFromWorkout(workout) {
  return (workout?.workout_template_exercises || []).flatMap((exercise) =>
    (exercise.sessionRows || [])
      .filter((row) => row.done && (Number(row.kg) || 0) > 0 && (Number(row.reps) || 0) > 0)
      .map((row) => ({
        exerciseName: exercise.exercise_name || "Exercise",
        kg: Number(row.kg) || 0,
        reps: Number(row.reps) || 0,
        volume: (Number(row.kg) || 0) * (Number(row.reps) || 0),
        estimatedOneRepMax: estimateOneRepMax(row.kg, row.reps)
      }))
  );
}

function buildStrengthRecordsFromSessions(sessions = []) {
  const maxWeightByExercise = new Map();
  const oneRepMaxByExercise = new Map();
  const volumeByWorkout = new Map();

  for (const session of sessions) {
    const sessionVolume = Number(session.total_volume_kg) || 0;
    const workoutName = (session.name || "").toLowerCase();
    if (workoutName) {
      const currentVolume = volumeByWorkout.get(workoutName) || 0;
      if (sessionVolume > currentVolume) volumeByWorkout.set(workoutName, sessionVolume);
    }

    for (const exercise of session.session_log_exercises || []) {
      const exerciseName = exercise.exercise_name || "Exercise";
      const key = exerciseName.toLowerCase();
      for (const set of exercise.session_log_sets || []) {
        if (!set.completed || !set.kg || !set.reps) continue;
        const kg = Number(set.kg) || 0;
        const reps = Number(set.reps) || 0;
        const estimatedOneRepMax = estimateOneRepMax(kg, reps);
        const maxWeight = maxWeightByExercise.get(key);
        if (!maxWeight || kg > maxWeight.kg) {
          maxWeightByExercise.set(key, { exerciseName, kg, reps });
        }
        const maxOneRep = oneRepMaxByExercise.get(key);
        if (!maxOneRep || estimatedOneRepMax > maxOneRep.estimatedOneRepMax) {
          oneRepMaxByExercise.set(key, { exerciseName, kg, reps, estimatedOneRepMax });
        }
      }
    }
  }

  return { maxWeightByExercise, oneRepMaxByExercise, volumeByWorkout };
}

function buildAchievementMoments(workout, summary, previousRecords) {
  const moments = [];
  const completedSets = completedStrengthSetsFromWorkout(workout);
  const workoutKey = (workout?.name || "").toLowerCase();
  const previousWorkoutVolume = previousRecords?.volumeByWorkout?.get(workoutKey) || 0;

  if (summary.totalVolumeKg > 0 && summary.totalVolumeKg > previousWorkoutVolume) {
    moments.push({
      id: "best-volume",
      label: previousWorkoutVolume ? "Best session volume" : "First volume record",
      title: `${Math.round(summary.totalVolumeKg).toLocaleString()}kg total volume`,
      detail: previousWorkoutVolume ? `Previous best ${Math.round(previousWorkoutVolume).toLocaleString()}kg` : "New workout benchmark",
      priority: 80
    });
  }

  const bestCurrentByExercise = new Map();
  for (const set of completedSets) {
    const key = set.exerciseName.toLowerCase();
    const current = bestCurrentByExercise.get(key);
    if (!current || set.kg > current.kg || (set.kg === current.kg && set.reps > current.reps)) {
      bestCurrentByExercise.set(key, set);
    }
  }

  for (const [key, set] of bestCurrentByExercise) {
    const previous = previousRecords?.maxWeightByExercise?.get(key);
    if (!previous || set.kg > previous.kg) {
      moments.push({
        id: `lift-${key}`,
        label: previous ? "New best lift" : "First best lift",
        title: `${set.exerciseName}: ${set.kg}kg x ${set.reps}`,
        detail: previous ? `Previous ${previous.kg}kg x ${previous.reps}` : "First recorded lift",
        priority: 100 + set.kg
      });
    }

    const previousOneRep = previousRecords?.oneRepMaxByExercise?.get(key);
    if (!previousOneRep || set.estimatedOneRepMax > previousOneRep.estimatedOneRepMax) {
      moments.push({
        id: `strength-${key}`,
        label: previousOneRep ? "Strength PB" : "Strength benchmark",
        title: `${set.exerciseName}: ${Math.round(set.estimatedOneRepMax)}kg est. 1RM`,
        detail: `${set.kg}kg x ${set.reps}`,
        priority: 90 + set.estimatedOneRepMax
      });
    }
  }

  if (!moments.length && completedSets.length) {
    const bestLift = [...completedSets].sort((a, b) => b.kg - a.kg || b.reps - a.reps)[0];
    moments.push({
      id: "best-lift",
      label: "Best lift today",
      title: `${bestLift.exerciseName}: ${bestLift.kg}kg x ${bestLift.reps}`,
      detail: `${Math.round(bestLift.volume).toLocaleString()}kg set volume`,
      priority: 10
    });
  }

  return moments.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

function primaryAchievementMoment(session) {
  if (session?.achievementMoments?.length) return session.achievementMoments[0];
  if (session?.sessionType === "for_time") {
    return {
      label: "For Time result",
      title: session.pbLabel || "Workout complete",
      detail: formatShortDuration(session.durationSeconds)
    };
  }
  if ((Number(session?.totalVolumeKg) || 0) > 0) {
    return {
      label: "Session volume",
      title: `${Math.round(session.totalVolumeKg).toLocaleString()}kg total volume`,
      detail: `${session.completedSets || 0} sets completed`
    };
  }
  return {
    label: "Workout complete",
    title: `${session?.totalExercises || 0} exercises completed`,
    detail: formatShortDuration(session?.durationSeconds || 0)
  };
}

function primaryStrengthShareMoment(session) {
  const liftMoment = (session?.achievementMoments || []).find((moment) =>
    ["lift-", "strength-", "best-lift"].some((prefix) => String(moment.id || "").startsWith(prefix))
  );
  return liftMoment || primaryAchievementMoment(session);
}

function formatDuration(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatClock(totalSeconds = 0) {
  const cleanSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(cleanSeconds / 60);
  const seconds = cleanSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatShortDuration(totalSeconds = 0) {
  const cleanSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(cleanSeconds / 60);
  const seconds = cleanSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatSplitDelta(currentSeconds, previousSeconds) {
  if (previousSeconds === null || previousSeconds === undefined) return "";
  const delta = (Number(currentSeconds) || 0) - (Number(previousSeconds) || 0);
  if (delta === 0) return "same as previous";
  return `${formatClock(Math.abs(delta))} ${delta < 0 ? "ahead" : "behind"}`;
}

function secondsFromParts(minutes, seconds) {
  return (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
}

function formatHiitTimerLabel(workout) {
  if (workout?.workout_type !== "hiit") return workout?.workout_type || "strength";
  if (workout.hiit_timer_type === "tabata") return "HIIT - Tabata";
  return workout.hiit_timer_type === "for_time" ? "HIIT - For Time" : "HIIT - Interval";
}

function workoutSummary(workout) {
  const exercises = workout?.workout_template_exercises || [];
  if (workout?.workout_type === "hiit") {
    return `${exercises.length} exercises - ${workout.hiit_rounds || 1} rounds`;
  }
  const totalSets = exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);
  return `${exercises.length} exercises${totalSets ? ` - ${totalSets} total sets` : ""}`;
}

function formatHiitPhase(phase) {
  if (phase === "station-rest") return "Station rest";
  return phase;
}

function formatExerciseTarget(exercise, workoutType = "strength") {
  if (workoutType === "hiit") {
    const targetValue = exercise.target_value || exercise.rep_min || 0;
    const targetType = exercise.target_type || "reps";
    const label = hiitTargetTypes.find((type) => type.value === targetType)?.label || "Reps";
    return `${targetValue} ${label}`;
  }

  return `${exercise.sets || 0} sets${
    exercise.rep_min || exercise.rep_max ? ` x ${exercise.rep_min || "?"}-${exercise.rep_max || "?"} reps` : ""
  }`;
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function createDefaultSetup() {
  return {
    name: "",
    notes: "",
    workout_type: "strength",
    defaultSets: 4,
    hiit_timer_type: "interval",
    hiit_rounds: 8,
    hiit_work_minutes: 0,
    hiit_work_seconds: 45,
    hiit_rest_minutes: 0,
    hiit_rest_seconds: 20,
    hiit_station_rest_minutes: 1,
    hiit_station_rest_seconds: 0,
    hiit_countdown_seconds: 10,
    hiit_goal_minutes: 30,
    hiit_goal_seconds: 0,
    hiit_focus_area: "Full Body",
    hiitTotalExercises: 4,
    muscleTargets: { ...createMuscleTargets(), Chest: 4 }
  };
}

function createEmptyForm() {
  return {
    name: "",
    notes: "",
    workout_type: "strength",
    hiit_timer_type: "interval",
    hiit_rounds: 8,
    hiit_work_seconds: 45,
    hiit_rest_seconds: 20,
    hiit_station_rest_seconds: 60,
    hiit_countdown_seconds: 10,
    hiit_goal_seconds: 1800,
    hiit_focus_area: "Full Body",
    exercises: []
  };
}

function createQuickStrengthExercise() {
  return { exercise_name: "", kg: "", reps: "" };
}

function createQuickCardioMachine() {
  return { machine: "", calories: "", meters: "", reps: "" };
}

function createQuickLogForm() {
  return {
    name: "",
    types: ["strength"],
    overallDuration: "",
    strengthExercises: [createQuickStrengthExercise()],
    run: {
      runType: "Easy",
      km: "",
      pace: "",
      zone: "",
      laps: "",
      lapDistance: "",
      duration: ""
    },
    cardioMachines: [createQuickCardioMachine()],
    other: {
      notes: "",
      duration: "",
      reps: "",
      meters: "",
      calories: ""
    }
  };
}

function minutesToSeconds(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 60));
}

function buildQuickNotes(form) {
  const notes = [];
  if (form.types.includes("run")) {
    notes.push(`Run: ${form.run.runType || "Run"}${form.run.km ? `, ${form.run.km}km` : ""}${form.run.pace ? `, pace ${form.run.pace}` : ""}${form.run.zone ? `, zone ${form.run.zone}` : ""}${form.run.laps ? `, ${form.run.laps} laps` : ""}${form.run.lapDistance ? `, lap ${form.run.lapDistance}` : ""}${form.run.duration ? `, ${form.run.duration} min` : ""}`);
  }
  if (form.types.includes("cardio")) {
    form.cardioMachines.filter((machine) => machine.machine || machine.calories || machine.meters || machine.reps).forEach((machine, index) => {
      notes.push(`Cardio ${index + 1}: ${machine.machine || "Machine"}${machine.calories ? `, ${machine.calories} cal` : ""}${machine.meters ? `, ${machine.meters}m` : ""}${machine.reps ? `, ${machine.reps} reps` : ""}`);
    });
  }
  if (form.types.includes("other")) {
    notes.push(`Other: ${form.other.notes || "Notes"}${form.other.duration ? `, ${form.other.duration} min` : ""}${form.other.reps ? `, ${form.other.reps} reps` : ""}${form.other.meters ? `, ${form.other.meters}m` : ""}${form.other.calories ? `, ${form.other.calories} cal` : ""}`);
  }
  return notes.join("\n");
}

export function WorkoutLibraryScreen({
  autoStartWorkout = null,
  embedded = false,
  initialLibraryView = "library",
  initialMode = "list",
  onClose,
  onWorkoutSaved,
  role = "normal_user",
  user
}) {
  const [workouts, setWorkouts] = useState([]);
  const [archivedWorkouts, setArchivedWorkouts] = useState([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState([]);
  const [mutualSharedWorkouts, setMutualSharedWorkouts] = useState([]);
  const [mutualRecipients, setMutualRecipients] = useState([]);
  const [libraryView, setLibraryView] = useState(initialLibraryView);
  const [showArchivedWorkouts, setShowArchivedWorkouts] = useState(false);
  const [recentSessions, setRecentSessions] = useState([]);
  const [coachClients, setCoachClients] = useState([]);
  const [coachClientsError, setCoachClientsError] = useState("");
  const [loadingCoachClients, setLoadingCoachClients] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [editingId, setEditingId] = useState(null);
  const [setup, setSetup] = useState(createDefaultSetup);
  const [form, setForm] = useState(createEmptyForm);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [quickLogForm, setQuickLogForm] = useState(createQuickLogForm);
  const [hiitInterval, setHiitInterval] = useState(null);
  const [hiitForTime, setHiitForTime] = useState(null);
  const [activeNumberInput, setActiveNumberInput] = useState(null);
  const [openSessionMenu, setOpenSessionMenu] = useState(null);
  const [swapTargetIndex, setSwapTargetIndex] = useState(null);
  const [swapSearch, setSwapSearch] = useState("");
  const [completedSession, setCompletedSession] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState({ rating: 0, comment: "" });
  const [shareMode, setShareMode] = useState("transparent");
  const [sharePhoto, setSharePhoto] = useState("");
  const [customExerciseNames, setCustomExerciseNames] = useState(new Set());
  const [customExerciseOptions, setCustomExerciseOptions] = useState([]);
  const [catalogExerciseNames, setCatalogExerciseNames] = useState(new Set());
  const [catalogSearchResults, setCatalogSearchResults] = useState({});
  const [exerciseDbSearchResults, setExerciseDbSearchResults] = useState({});
  const [builderGroupSearches, setBuilderGroupSearches] = useState({});
  const [builderGroupSearchResults, setBuilderGroupSearchResults] = useState({});
  const [builderSuggestionExtras, setBuilderSuggestionExtras] = useState({});
  const [builderGroupOffsets, setBuilderGroupOffsets] = useState({});
  const [swapCatalogResults, setSwapCatalogResults] = useState([]);
  const [swapExerciseDbResults, setSwapExerciseDbResults] = useState([]);
  const [demoVideo, setDemoVideo] = useState(null);
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState(new Set());
  const [openWorkoutMenu, setOpenWorkoutMenu] = useState(null);
  const [assignWorkout, setAssignWorkout] = useState(null);
  const [assignClientIds, setAssignClientIds] = useState([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSearchResults, setAssignSearchResults] = useState([]);
  const [searchingAssignClients, setSearchingAssignClients] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [sharingWorkout, setSharingWorkout] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [openBuilderExerciseMenu, setOpenBuilderExerciseMenu] = useState(null);
  const [activeBuilderExerciseIndex, setActiveBuilderExerciseIndex] = useState(0);
  const sessionInputRefs = useRef({});
  const keypadPointerHandledRef = useRef(0);
  const autoStartedWorkoutRef = useRef("");
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const hiitLastBeepRef = useRef("");
  const audioContextRef = useRef(null);
  const recoveryHydratedRef = useRef(false);

  useEffect(() => {
    setLibraryView(initialLibraryView || "library");
  }, [initialLibraryView]);

  const recoveryKey = useMemo(() => {
    if (!user?.id) return "";
    const context = embedded || autoStartWorkout ? "embedded" : "main";
    return `movementz:workout-recovery:${user.id}:${context}`;
  }, [autoStartWorkout, embedded, user?.id]);

  const totalTargetExercises = useMemo(
    () =>
      setup.workout_type === "hiit"
        ? Number(setup.hiitTotalExercises) || 0
        : Object.values(setup.muscleTargets).reduce(
            (sum, value) => sum + (Number(value) || 0),
            0
          ),
    [setup.hiitTotalExercises, setup.muscleTargets, setup.workout_type]
  );

  const selectedMuscleTargets = useMemo(
    () => Object.entries(setup.muscleTargets).filter(([, count]) => Number(count) > 0),
    [setup.muscleTargets]
  );

  const customExerciseList = useMemo(
    () => Array.from(customExerciseNames).sort((a, b) => a.localeCompare(b)),
    [customExerciseNames]
  );

  const swapMuscleGroup = activeWorkout?.workout_template_exercises?.[swapTargetIndex]?.muscle_group || "";

  const knownExerciseKeys = useMemo(() => {
    const exerciseDbNames = [
      ...Object.values(exerciseDbSearchResults).flat(),
      ...Object.values(builderGroupSearchResults).flat(),
      ...Object.values(builderSuggestionExtras).flat(),
      ...swapExerciseDbResults
    ];
    const names = [...getLocalExerciseNames(), ...customExerciseNames, ...catalogExerciseNames, ...exerciseDbNames];
    return new Set(names.map(toExerciseKey));
  }, [builderGroupSearchResults, builderSuggestionExtras, catalogExerciseNames, customExerciseNames, exerciseDbSearchResults, swapExerciseDbResults]);

  const getBuilderSuggestions = useCallback((exercise, index) => {
    const muscle = (exercise.muscle_group || "").toLowerCase();
    const matchingCustomExercises = customExerciseOptions
      .filter((option) => !option.muscle_group || option.muscle_group.toLowerCase() === muscle)
      .map((option) => option.exercise_name);
    const otherCustomExercises = customExerciseOptions
      .filter((option) => option.muscle_group && option.muscle_group.toLowerCase() !== muscle)
      .map((option) => option.exercise_name);

    return uniqueNames([
      ...getSuggestions(exercise),
      ...(builderSuggestionExtras[index] || []),
      ...matchingCustomExercises,
      ...otherCustomExercises
    ]).slice(0, 3);
  }, [builderSuggestionExtras, customExerciseOptions]);

  const lastSessionByName = useMemo(() => {
    return Object.fromEntries((recentSessions || []).map((session) => [session.name, session]));
  }, [recentSessions]);

  const filteredWorkouts = workouts;

  const loadWorkouts = useCallback(async () => {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setWorkouts(demoWorkouts);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("workout_templates")
      .select("id,name,notes,status,is_public_template,workout_type,hiit_timer_type,hiit_rounds,hiit_work_seconds,hiit_rest_seconds,hiit_station_rest_seconds,hiit_countdown_seconds,hiit_goal_seconds,hiit_focus_area,created_at,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,target_type,target_value)")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .order("position", { referencedTable: "workout_template_exercises", ascending: true })
      .limit(25);

    if (error) {
      setMessage("Could not load workouts yet. Run supabase/phase-10-archive-lifecycle.sql in Supabase first.");
      setWorkouts([]);
    } else {
      setWorkouts(data || []);
    }
    setLoading(false);
  }, [user.id]);

  const loadArchivedWorkouts = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setArchivedWorkouts([]);
      return;
    }

    const { data, error } = await supabase
      .from("workout_templates")
      .select("id,name,notes,status,workout_type,hiit_timer_type,hiit_rounds,archived_at,created_at,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,target_type,target_value)")
      .eq("owner_id", user.id)
      .eq("status", "archived")
      .order("archived_at", { ascending: false })
      .order("position", { referencedTable: "workout_template_exercises", ascending: true })
      .limit(30);

    if (!error) setArchivedWorkouts(data || []);
  }, [user.id]);

  const loadRecentSessions = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setRecentSessions([]);
      return;
    }

    const { data, error } = await supabase
      .from("session_logs")
      .select("id,name,workout_type,completed_at,duration_seconds,total_exercises,completed_sets,total_volume_kg,rating")
      .eq("owner_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(8);

    if (error) {
      setMessage(error.message);
      setRecentSessions([]);
      return;
    }

    setRecentSessions(data || []);
  }, [user.id]);

  const loadAssignedWorkouts = useCallback(async () => {
    if (role !== "client" || !supabase || user.id === "demo-user") {
      setAssignedWorkouts([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_assigned_workouts");

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-9-client-assignment-library.sql in Supabase.`);
      setAssignedWorkouts([]);
      return;
    }

    setAssignedWorkouts(data || []);
  }, [role, user.id]);

  const loadMutualRecipients = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setMutualRecipients([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_mutual_workout_recipients");

    if (error) {
      setMutualRecipients([]);
      return;
    }

    setMutualRecipients(data || []);
  }, [user.id]);

  const loadMutualSharedWorkouts = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setMutualSharedWorkouts([]);
      return;
    }

    const { data, error } = await supabase.rpc("get_my_mutual_shared_workouts");

    if (error) {
      setMutualSharedWorkouts([]);
      return;
    }

    setMutualSharedWorkouts(data || []);
  }, [user.id]);

  const loadCoachClients = useCallback(async () => {
    if (role !== "coach" || !supabase || user.id === "demo-user") {
      setCoachClients([]);
      setCoachClientsError("");
      return;
    }

    setLoadingCoachClients(true);
    setCoachClientsError("");

    const { data, error } = await supabase.rpc("get_my_coach_clients");

    setLoadingCoachClients(false);

    if (error) {
      setCoachClientsError(error.message);
      setCoachClients([]);
      return;
    }

    setCoachClients(
      (data || []).filter((link) => link.status === "active").map((link) => ({
        id: link.client_id,
        name: link.client_name || link.client_email || `Client ${String(link.client_id).slice(0, 8)}`,
        email: link.client_email || ""
      }))
    );
  }, [role, user.id]);

  const loadCustomExerciseOptions = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setCustomExerciseNames(new Set());
      setCustomExerciseOptions([]);
      return;
    }

    const [optionResponse, requestResponse] = await Promise.all([
      supabase
        .from("user_exercise_options")
        .select("exercise_name,muscle_group")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("exercise_review_requests")
        .select("exercise_name,muscle_group,status")
        .eq("requester_id", user.id)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(150)
    ]);

    const options = [
      ...(optionResponse.error ? [] : optionResponse.data || []),
      ...(requestResponse.error ? [] : requestResponse.data || [])
    ]
      .filter((exercise) => exercise.exercise_name)
      .map((exercise) => ({
        exercise_name: exercise.exercise_name,
        muscle_group: exercise.muscle_group || ""
      }));
    const uniqueOptions = Array.from(
      new Map(options.map((exercise) => [toExerciseKey(exercise.exercise_name), exercise])).values()
    );

    setCustomExerciseOptions(uniqueOptions);
    setCustomExerciseNames(new Set(uniqueOptions.map((exercise) => exercise.exercise_name)));
  }, [user.id]);

  async function openSessionHistory(session) {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setSelectedSession(session);
      setMode("history");
      return;
    }

    setLoadingSessionDetail(true);

    const { data, error } = await supabase
      .from("session_logs")
      .select(
        "id,name,workout_type,completed_at,duration_seconds,total_exercises,completed_sets,total_volume_kg,rating,comment,session_log_exercises(id,position,exercise_name,original_exercise_name,muscle_group,target_sets,target_rep_min,target_rep_max,target_type,target_value,split_duration_seconds,completed_at_seconds,skipped,substituted,session_log_sets(id,set_number,kg,reps,completed))"
      )
      .eq("owner_id", user.id)
      .eq("status", "completed")
      .eq("id", session.id)
      .single();

    setLoadingSessionDetail(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const sortedSession = {
      ...data,
      session_log_exercises: (data.session_log_exercises || [])
        .map((exercise) => ({
          ...exercise,
          session_log_sets: (exercise.session_log_sets || []).sort(
            (a, b) => a.set_number - b.set_number
          )
        }))
        .sort((a, b) => a.position - b.position)
    };

    setSelectedSession(sortedSession);
    setMode("history");
  }

  const playTone = useCallback((type = "tap") => {
    if (typeof window === "undefined") return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = type === "done" ? 980 : type === "start" ? 740 : type === "warning" ? 560 : 420;
    gain.gain.setValueAtTime(type === "done" || type === "start" ? 0.18 : 0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + (type === "done" || type === "start" ? 0.18 : 0.06)
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === "done" || type === "start" ? 0.18 : 0.06));
  }, []);

  const getNextHiitIntervalState = useCallback((current, workout) => {
    const exercises = workout?.workout_template_exercises || [];
    const totalExercises = exercises.length || 1;
    const totalRounds = Math.max(1, Number(workout?.hiit_rounds) || 1);
    const workSeconds = Math.max(1, Number(workout?.hiit_work_seconds) || 30);
    const restSeconds = Math.max(1, Number(workout?.hiit_rest_seconds) || 10);
    const stationRestSeconds = Math.max(1, Number(workout?.hiit_station_rest_seconds) || 60);
    const isTabata = workout?.hiit_timer_type === "tabata";

    hiitLastBeepRef.current = "";

    if (current.phase === "countdown") {
      playTone("start");
      return { ...current, phase: "work", remaining: workSeconds };
    }

    if (current.phase === "work") {
      playTone("done");

      if (isTabata && current.round >= totalRounds) {
        const nextExerciseIndex = current.exerciseIndex + 1;
        if (nextExerciseIndex < totalExercises) {
          return {
            ...current,
            phase: "station-rest",
            remaining: stationRestSeconds,
            completedCycles: current.completedCycles + 1
          };
        }

        return {
          ...current,
          phase: "complete",
          remaining: 0,
          running: false,
          completedCycles: current.completedCycles + 1,
          exerciseIndex: totalExercises - 1,
          round: totalRounds
        };
      }

      return {
        ...current,
        phase: "rest",
        remaining: restSeconds,
        completedCycles: current.completedCycles + 1
      };
    }

    if (isTabata && current.phase === "rest") {
      playTone("start");
      return {
        ...current,
        phase: "work",
        remaining: workSeconds,
        round: current.round + 1
      };
    }

    if (isTabata && current.phase === "station-rest") {
      playTone("start");
      return {
        ...current,
        phase: "work",
        remaining: workSeconds,
        exerciseIndex: Math.min(current.exerciseIndex + 1, totalExercises - 1),
        round: 1
      };
    }

    const nextExerciseIndex = current.exerciseIndex + 1;
    if (nextExerciseIndex < totalExercises) {
      playTone("start");
      return {
        ...current,
        phase: "work",
        remaining: workSeconds,
        exerciseIndex: nextExerciseIndex
      };
    }

    const nextRound = current.round + 1;
    if (nextRound <= totalRounds) {
      playTone("start");
      return {
        ...current,
        phase: "work",
        remaining: workSeconds,
        exerciseIndex: 0,
        round: nextRound
      };
    }

    playTone("done");
    return {
      ...current,
      phase: "complete",
      remaining: 0,
      running: false,
      exerciseIndex: totalExercises - 1,
      round: totalRounds
    };
  }, [playTone]);

  useEffect(() => {
    const recovered = readRecoveryState(recoveryKey);
    if (recovered?.mode && recoverableWorkoutModes.has(recovered.mode)) {
      if (autoStartWorkout) {
        autoStartedWorkoutRef.current = autoStartWorkout.autoStartKey || `${autoStartWorkout.id || "workout"}-${autoStartWorkout.name || ""}`;
      }
      Promise.resolve().then(() => {
        setMode(recovered.mode);
        setEditingId(recovered.editingId || null);
        setSetup(recovered.setup || createDefaultSetup());
        setForm(recovered.form || createEmptyForm());
        setQuickLogForm(recovered.quickLogForm || createQuickLogForm());
        setActiveWorkout(recovered.activeWorkout || null);
        setHiitInterval(recovered.hiitInterval || null);
        setHiitForTime(recovered.hiitForTime || null);
        setActiveBuilderExerciseIndex(Number(recovered.activeBuilderExerciseIndex) || 0);
        setCompletedSession(null);
        setActiveNumberInput(null);
        setRecoveryNotice("Restored your unfinished workout.");
        setMessage("");
      });
    }
    recoveryHydratedRef.current = true;
  }, [autoStartWorkout, recoveryKey]);

  useEffect(() => {
    if (!recoveryHydratedRef.current || !recoveryKey) return;

    if (!recoverableWorkoutModes.has(mode)) {
      clearRecoveryState(recoveryKey);
      return;
    }

    writeRecoveryState(recoveryKey, {
      version: 1,
      updatedAt: new Date().toISOString(),
      mode,
      editingId,
      setup,
      form,
      quickLogForm,
      activeWorkout,
      hiitInterval,
      hiitForTime,
      activeBuilderExerciseIndex
    });
  }, [activeBuilderExerciseIndex, activeWorkout, editingId, form, hiitForTime, hiitInterval, mode, quickLogForm, recoveryKey, setup]);

  useEffect(() => {
    if (!recoverableWorkoutModes.has(mode)) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [mode]);

  useEffect(() => {
    const load = Promise.resolve().then(async () => {
      await loadWorkouts();
      await loadArchivedWorkouts();
      await loadRecentSessions();
      await loadCustomExerciseOptions();
      await loadCoachClients();
      await loadAssignedWorkouts();
      await loadMutualRecipients();
      await loadMutualSharedWorkouts();
    });
    return () => {
      void load;
    };
  }, [loadArchivedWorkouts, loadAssignedWorkouts, loadCoachClients, loadCustomExerciseOptions, loadMutualRecipients, loadMutualSharedWorkouts, loadRecentSessions, loadWorkouts]);

  useEffect(() => {
    if (!supabase || user.id === "demo-user" || mode !== "editor") return undefined;

    const searchableExercises = form.exercises
      .map((exercise, index) => ({
        index,
        search: exercise.search.trim()
      }))
      .filter((exercise) => exercise.search.length >= 2);

    if (searchableExercises.length === 0) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const nextResults = {};
      const nextExerciseDbResults = {};
      const foundNames = [];

      await Promise.all(
        searchableExercises.map(async (exercise) => {
          const [catalogResponse, exerciseDbNames] = await Promise.all([
            supabase
              .from("exercise_catalog")
              .select("exercise_name")
              .ilike("exercise_name", `%${exercise.search}%`)
              .order("exercise_name", { ascending: true })
              .limit(CATALOG_SEARCH_LIMIT),
            searchExerciseDb({
              query: exercise.search,
              muscle: form.exercises[exercise.index]?.muscle_group || "",
              limit: CATALOG_SEARCH_LIMIT
            })
          ]);

          if (!catalogResponse.error) {
            const names = (catalogResponse.data || []).map((row) => row.exercise_name);
            nextResults[exercise.index] = names;
            foundNames.push(...names);
          }

          nextExerciseDbResults[exercise.index] = exerciseDbNames;
          foundNames.push(...exerciseDbNames);
        })
      );

      setCatalogSearchResults(nextResults);
      setExerciseDbSearchResults(nextExerciseDbResults);
      setCatalogExerciseNames((current) => new Set([...current, ...foundNames]));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [form.exercises, mode, user.id]);

  useEffect(() => {
    if (!supabase || user.id === "demo-user" || mode !== "editor") return undefined;

    const searchableGroups = Object.entries(builderGroupSearches)
      .map(([muscle, search]) => ({ muscle, search: search.trim() }))
      .filter((entry) => entry.search.length >= 2);

    if (searchableGroups.length === 0) return undefined;

    const timeout = window.setTimeout(async () => {
      const nextGroupResults = {};
      const foundNames = [];

      await Promise.all(
        searchableGroups.map(async ({ muscle, search }) => {
          const [catalogResponse, exerciseDbNames] = await Promise.all([
            supabase
              .from("exercise_catalog")
              .select("exercise_name")
              .ilike("exercise_name", `%${search}%`)
              .order("exercise_name", { ascending: true })
              .limit(CATALOG_SEARCH_LIMIT),
            searchExerciseDb({
              query: search,
              muscle,
              limit: CATALOG_SEARCH_LIMIT
            })
          ]);

          const catalogNames = catalogResponse.error ? [] : (catalogResponse.data || []).map((row) => row.exercise_name);
          const names = uniqueNames([...catalogNames, ...exerciseDbNames]).slice(0, CATALOG_SEARCH_LIMIT);
          nextGroupResults[muscle] = names;
          foundNames.push(...names);
        })
      );

      setBuilderGroupSearchResults(nextGroupResults);
      setCatalogExerciseNames((current) => new Set([...current, ...foundNames]));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [builderGroupSearches, mode, user.id]);

  useEffect(() => {
    if (!supabase || user.id === "demo-user" || swapTargetIndex === null) return undefined;

    const cleanSearch = swapSearch.trim();
    if (cleanSearch.length < 2) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const [catalogResponse, exerciseDbNames] = await Promise.all([
        supabase
          .from("exercise_catalog")
          .select("exercise_name")
          .ilike("exercise_name", `%${cleanSearch}%`)
          .order("exercise_name", { ascending: true })
          .limit(CATALOG_SEARCH_LIMIT),
        searchExerciseDb({
          query: cleanSearch,
          muscle: swapMuscleGroup,
          limit: CATALOG_SEARCH_LIMIT
        })
      ]);

      if (catalogResponse.error) return;

      const names = (catalogResponse.data || []).map((row) => row.exercise_name);
      setSwapCatalogResults(names);
      setSwapExerciseDbResults(exerciseDbNames);
      setCatalogExerciseNames((current) => new Set([...current, ...names, ...exerciseDbNames]));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [swapMuscleGroup, swapSearch, swapTargetIndex, user.id]);

  useEffect(() => {
    if (!activeNumberInput) return;

    const key = `${activeNumberInput.exerciseIndex}-${activeNumberInput.rowIndex}-${activeNumberInput.field}`;
    const input = sessionInputRefs.current[key];
    if (!input) return;

    window.requestAnimationFrame(() => {
      const keypadHeight = window.matchMedia("(max-width: 720px)").matches ? 340 : 0;
      const rect = input.getBoundingClientRect();
      const visibleBottom = window.innerHeight - keypadHeight;

      if (rect.bottom <= visibleBottom && rect.top >= 96) return;

      const nextTop = window.scrollY + rect.top - 140;
      window.scrollTo({ top: Math.max(nextTop, 0), behavior: "smooth" });
    });
  }, [activeNumberInput]);

  useEffect(() => {
    if (mode !== "hiit-session" || !activeWorkout || !hiitInterval?.running) return undefined;

    const timer = window.setInterval(() => {
      setHiitInterval((current) => {
        if (!current?.running) return current;

        if (current.remaining <= 3 && current.remaining > 0) {
          const beepKey = `${current.phase}-${current.round}-${current.exerciseIndex}-${current.remaining}`;
          if (hiitLastBeepRef.current !== beepKey) {
            hiitLastBeepRef.current = beepKey;
            playTone(current.remaining === 1 ? "start" : "warning");
          }
        }

        if (current.remaining > 1) {
          return { ...current, remaining: current.remaining - 1 };
        }

        return getNextHiitIntervalState(current, activeWorkout);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeWorkout, getNextHiitIntervalState, hiitInterval?.running, mode, playTone]);

  useEffect(() => {
    if (mode !== "hiit-for-time" || !hiitForTime?.running) return undefined;

    const timer = window.setInterval(() => {
      setHiitForTime((current) => {
        if (!current?.running) return current;

        if (current.phase === "countdown") {
          if (current.countdownRemaining <= 3 && current.countdownRemaining > 0) {
            playTone(current.countdownRemaining === 1 ? "start" : "warning");
          }

          if (current.countdownRemaining > 1) {
            return { ...current, countdownRemaining: current.countdownRemaining - 1 };
          }

          return {
            ...current,
            phase: "active",
            countdownRemaining: 0
          };
        }

        if (current.phase !== "active") return current;

        return {
          ...current,
          elapsedSeconds: current.elapsedSeconds + 1,
          stationElapsedSeconds: current.stationElapsedSeconds + 1
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hiitForTime?.running, mode, playTone]);

  async function loadWorkoutDetails(workout) {
    if (!supabase || user.id === "demo-user") return workout;

    if (workout.assignment_id || workout.isAssignedWorkout || workout.share_id || workout.isMutualSharedWorkout) {
      return {
        ...workout,
        workout_template_exercises: (workout.workout_template_exercises || []).sort(
          (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0)
        )
      };
    }

    if (workout.isAssignedPlanWorkout && role === "client") {
      const { data, error } = await supabase.rpc("get_my_assigned_plan_workout", {
        p_workout_template_id: workout.id
      });

      if (error || !data) {
        setMessage(`${error?.message || "Could not load this assigned plan workout."} Run supabase/phase-9-client-assignment-library.sql in Supabase.`);
        return null;
      }

      return {
        ...data,
        isAssignedPlanWorkout: true,
        workout_template_exercises: (data.workout_template_exercises || []).sort(
          (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0)
        )
      };
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("workout_templates")
      .select(
        "id,name,notes,workout_type,hiit_timer_type,hiit_rounds,hiit_work_seconds,hiit_rest_seconds,hiit_station_rest_seconds,hiit_countdown_seconds,hiit_goal_seconds,hiit_focus_area,created_at,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,start_kg,rest_seconds,tip,superset_group,target_type,target_value)"
      )
      .eq("owner_id", user.id)
      .eq("id", workout.id)
      .order("position", { referencedTable: "workout_template_exercises", ascending: true })
      .single();

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return null;
    }

    return data;
  }

  async function loadPreviousSetsForWorkout(exercises, workoutTemplateId) {
    if (!supabase || user.id === "demo-user" || exercises.length === 0) return {};

    const exerciseNames = new Set(exercises.map((exercise) => exercise.exercise_name).filter(Boolean));
    if (exerciseNames.size === 0) return {};

    let query = supabase
      .from("session_logs")
      .select(
        "completed_at,session_log_exercises(exercise_name,session_log_sets(set_number,kg,reps,completed))"
      )
      .eq("owner_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(8);

    if (workoutTemplateId) {
      query = query.eq("workout_template_id", workoutTemplateId);
    }

    const { data, error } = await query;

    if (error) {
      setMessage(error.message);
      return {};
    }

    const previousSetsByExercise = {};

    for (const session of data || []) {
      for (const exercise of session.session_log_exercises || []) {
        if (!exerciseNames.has(exercise.exercise_name) || previousSetsByExercise[exercise.exercise_name]) {
          continue;
        }

        const rows = (exercise.session_log_sets || [])
          .filter((set) => set.completed && set.kg !== null && set.reps !== null)
          .sort((a, b) => a.set_number - b.set_number)
          .map((set) => ({
            kg: set.kg,
            reps: set.reps
          }));

        const chips = rows.slice(0, 4).map((set) => `${set.kg}kg x ${set.reps}`);

        if (rows.length) {
          previousSetsByExercise[exercise.exercise_name] = { chips, rows };
        }
      }
    }

    return previousSetsByExercise;
  }

  async function loadForTimePacing(workoutTemplateId) {
    if (!supabase || user.id === "demo-user" || !workoutTemplateId) {
      return { latestSplitsByPosition: {}, bestDurationSeconds: null };
    }

    const { data, error } = await supabase
      .from("session_logs")
      .select(
        "duration_seconds,completed_at,session_log_exercises(position,exercise_name,split_duration_seconds,completed_at_seconds)"
      )
      .eq("owner_id", user.id)
      .eq("workout_template_id", workoutTemplateId)
      .eq("status", "completed")
      .eq("workout_type", "hiit")
      .order("completed_at", { ascending: false })
      .limit(6);

    if (error) {
      return { latestSplitsByPosition: {}, bestDurationSeconds: null };
    }

    const sessions = data || [];
    const latestWithSplits = sessions.find((session) =>
      (session.session_log_exercises || []).some(
        (exercise) => exercise.split_duration_seconds !== null && exercise.split_duration_seconds !== undefined
      )
    );
    const bestDurationSeconds = sessions.length
      ? Math.min(...sessions.map((session) => Number(session.duration_seconds) || Number.POSITIVE_INFINITY))
      : null;

    const latestSplitsByPosition = {};
    for (const split of latestWithSplits?.session_log_exercises || []) {
      if (split.split_duration_seconds === null || split.split_duration_seconds === undefined) continue;
      latestSplitsByPosition[split.position] = {
        exerciseName: split.exercise_name,
        durationSeconds: Number(split.split_duration_seconds) || 0,
        completedAtSeconds: Number(split.completed_at_seconds) || null
      };
    }

    return {
      latestSplitsByPosition,
      bestDurationSeconds:
        bestDurationSeconds === Number.POSITIVE_INFINITY || bestDurationSeconds === null ? null : bestDurationSeconds
    };
  }

  function startNewWorkout() {
    setEditingId(null);
    setSetup(createDefaultSetup());
    setBuilderSuggestionExtras({});
    setMessage("");
    setMode("setup");
  }

  function startQuickLog() {
    setQuickLogForm(createQuickLogForm());
    setMessage("");
    setMode("quick-log");
  }

  function toggleQuickType(type) {
    setQuickLogForm((current) => {
      const nextTypes = current.types.includes(type)
        ? current.types.filter((item) => item !== type)
        : [...current.types, type];
      return { ...current, types: nextTypes.length ? nextTypes : [type] };
    });
  }

  function updateQuickField(field, value) {
    setQuickLogForm((current) => ({ ...current, [field]: value }));
  }

  function updateQuickNested(section, field, value) {
    setQuickLogForm((current) => ({
      ...current,
      [section]: { ...current[section], [field]: value }
    }));
  }

  function updateQuickStrength(index, field, value) {
    setQuickLogForm((current) => ({
      ...current,
      strengthExercises: current.strengthExercises.map((exercise, currentIndex) =>
        currentIndex === index ? { ...exercise, [field]: value } : exercise
      )
    }));
  }

  function updateQuickCardio(index, field, value) {
    setQuickLogForm((current) => ({
      ...current,
      cardioMachines: current.cardioMachines.map((machine, currentIndex) =>
        currentIndex === index ? { ...machine, [field]: value } : machine
      )
    }));
  }

  async function saveQuickWorkout(event) {
    event.preventDefault();
    const selectedTypes = quickLogForm.types;
    const sessionName = quickLogForm.name.trim() || "Quick workout";
    const completedAt = new Date().toISOString();
    const durationSeconds = minutesToSeconds(quickLogForm.overallDuration || quickLogForm.run.duration || quickLogForm.other.duration);
    const startedAt = new Date(new Date(completedAt).getTime() - durationSeconds * 1000).toISOString();
    const strengthRows = selectedTypes.includes("strength")
      ? quickLogForm.strengthExercises.filter((exercise) => exercise.exercise_name || exercise.kg || exercise.reps)
      : [];
    const cardioRows = selectedTypes.includes("cardio")
      ? quickLogForm.cardioMachines.filter((machine) => machine.machine || machine.calories || machine.meters || machine.reps)
      : [];
    const hasRun = selectedTypes.includes("run");
    const hasOther = selectedTypes.includes("other");
    const totalVolumeKg = strengthRows.reduce((sum, exercise) => sum + (Number(exercise.kg) || 0) * (Number(exercise.reps) || 0), 0);
    const completedSets = strengthRows.length + cardioRows.reduce((sum, machine) => sum + (Number(machine.reps) ? 1 : 0), 0);
    const totalExercises = strengthRows.length + cardioRows.length + (hasRun ? 1 : 0) + (hasOther ? 1 : 0);

    if (!totalExercises) {
      setMessage("Add at least one quick workout detail before saving.");
      return;
    }

    if (!supabase || user.id === "demo-user") {
      clearRecoveryState(recoveryKey);
      setRecoveryNotice("");
      setMessage("Quick workout logged.");
      setMode("list");
      return;
    }

    setSaving(true);
    setMessage("");

    const { data: sessionLog, error: sessionError } = await supabase
      .from("session_logs")
      .insert({
        owner_id: user.id,
        workout_template_id: null,
        name: sessionName,
        notes: buildQuickNotes(quickLogForm) || null,
        workout_type: selectedTypes.length === 1 ? selectedTypes[0] : "mixed",
        status: "completed",
        started_at: startedAt,
        completed_at: completedAt,
        duration_seconds: durationSeconds,
        total_exercises: totalExercises,
        completed_sets: completedSets,
        total_volume_kg: totalVolumeKg
      })
      .select("id")
      .single();

    if (sessionError) {
      setSaving(false);
      setMessage(`${sessionError.message}. Run supabase/phase-3-session-logging.sql in Supabase.`);
      return;
    }

    const exerciseRows = [
      ...strengthRows.map((exercise, index) => ({
        position: index + 1,
        exercise_name: exercise.exercise_name || `Strength ${index + 1}`,
        muscle_group: "Strength",
        target_sets: 1
      })),
      ...(hasRun ? [{
        position: strengthRows.length + 1,
        exercise_name: `${quickLogForm.run.runType || "Run"} run`,
        muscle_group: "Run"
      }] : []),
      ...cardioRows.map((machine, index) => ({
        position: strengthRows.length + (hasRun ? 1 : 0) + index + 1,
        exercise_name: machine.machine || `Cardio ${index + 1}`,
        muscle_group: "Cardio"
      })),
      ...(hasOther ? [{
        position: strengthRows.length + (hasRun ? 1 : 0) + cardioRows.length + 1,
        exercise_name: "Other",
        muscle_group: "Other"
      }] : [])
    ].map((row) => ({ ...row, session_id: sessionLog.id }));

    if (exerciseRows.length) {
      const { data: insertedExercises, error: exerciseError } = await supabase
        .from("session_log_exercises")
        .insert(exerciseRows)
        .select("id,position,muscle_group");

      if (exerciseError) {
        setSaving(false);
        setMessage(exerciseError.message);
        return;
      }

      const setRows = [];
      strengthRows.forEach((exercise, index) => {
        const inserted = insertedExercises.find((row) => row.position === index + 1);
        if (!inserted) return;
        setRows.push({
          session_exercise_id: inserted.id,
          set_number: 1,
          kg: exercise.kg === "" ? null : Number(exercise.kg),
          reps: exercise.reps === "" ? null : Number(exercise.reps),
          completed: true
        });
      });

      if (setRows.length) {
        const { error: setError } = await supabase.from("session_log_sets").insert(setRows);
        if (setError) {
          setSaving(false);
          setMessage(setError.message);
          return;
        }
      }
    }

    setSaving(false);
    setQuickLogForm(createQuickLogForm());
    clearRecoveryState(recoveryKey);
    setRecoveryNotice("");
    setMessage("Quick workout logged.");
    await loadRecentSessions();
    setMode("list");
  }

  function closeBuilder() {
    const shouldClose = window.confirm("Leave this workout without saving? This draft will be discarded.");
    if (!shouldClose) return;

    clearRecoveryState(recoveryKey);
    setRecoveryNotice("");
    if (embedded && onClose) {
      onClose();
      return;
    }

    setMode("list");
  }

  function buildExercisesFromSetup() {
    if (!setup.name.trim()) {
      setMessage("Give this workout a name first.");
      return;
    }

    if (totalTargetExercises < 1) {
      setMessage("Choose at least one exercise.");
      return;
    }

    const isHiit = setup.workout_type === "hiit";
    const exercises = [];

    if (isHiit) {
      const focusArea = setup.hiit_focus_area || "Full Body";
      const totalExercises = Math.max(1, Math.min(20, Number(setup.hiitTotalExercises) || 4));
      for (let index = 0; index < totalExercises; index += 1) {
        exercises.push(
          createExerciseForMuscle(focusArea, index, Number(setup.hiit_rounds) || 1, {
            rep_min: 10,
            rep_max: "",
            rest_seconds: secondsFromParts(setup.hiit_rest_minutes, setup.hiit_rest_seconds),
            target_type: "reps",
            target_value: 10
          })
        );
      }
    } else {
      const defaultSets = Number(setup.defaultSets) || 4;
      Object.entries(setup.muscleTargets).forEach(([muscle, count]) => {
        for (let index = 0; index < Number(count || 0); index += 1) {
          exercises.push(createExerciseForMuscle(muscle, index, defaultSets));
        }
      });
    }

    setForm({
      name: setup.name,
      notes: setup.notes,
      workout_type: setup.workout_type,
      hiit_timer_type: setup.hiit_timer_type,
      hiit_rounds: Number(setup.hiit_rounds) || 1,
      hiit_work_seconds: secondsFromParts(setup.hiit_work_minutes, setup.hiit_work_seconds),
      hiit_rest_seconds: secondsFromParts(setup.hiit_rest_minutes, setup.hiit_rest_seconds),
      hiit_station_rest_seconds: secondsFromParts(setup.hiit_station_rest_minutes, setup.hiit_station_rest_seconds),
      hiit_countdown_seconds: Number(setup.hiit_countdown_seconds) || 0,
      hiit_goal_seconds: secondsFromParts(setup.hiit_goal_minutes, setup.hiit_goal_seconds),
      hiit_focus_area: setup.hiit_focus_area,
      exercises
    });
    setBuilderSuggestionExtras({});
    setBuilderGroupSearches({});
    setBuilderGroupSearchResults({});
    setBuilderGroupOffsets({});
    setActiveBuilderExerciseIndex(0);
    setMessage("");
    setMode("editor");
  }

  async function startEditWorkout(workout) {
    const detailedWorkout = await loadWorkoutDetails(workout);
    if (!detailedWorkout) return;

    setEditingId(detailedWorkout.id);
    setBuilderSuggestionExtras({});
    setBuilderGroupOffsets({});
    setForm({
      name: detailedWorkout.name || "",
      notes: detailedWorkout.notes || "",
      workout_type: detailedWorkout.workout_type || "strength",
      hiit_timer_type: detailedWorkout.hiit_timer_type || "interval",
      hiit_rounds: detailedWorkout.hiit_rounds || 8,
      hiit_work_seconds: detailedWorkout.hiit_work_seconds || 45,
      hiit_rest_seconds: detailedWorkout.hiit_rest_seconds || 20,
      hiit_station_rest_seconds: detailedWorkout.hiit_station_rest_seconds || 60,
      hiit_countdown_seconds: detailedWorkout.hiit_countdown_seconds || 10,
      hiit_goal_seconds: detailedWorkout.hiit_goal_seconds || 1800,
      hiit_focus_area: detailedWorkout.hiit_focus_area || "Full Body",
      exercises: (detailedWorkout.workout_template_exercises || []).map((exercise) => ({
        id: exercise.id,
        exercise_name: exercise.exercise_name || "",
        muscle_group: exercise.muscle_group || "Chest",
        sets: exercise.sets || 3,
        rep_min: exercise.rep_min || 8,
        rep_max: exercise.rep_max || 12,
        start_kg: exercise.start_kg ?? "",
        rest_seconds: exercise.rest_seconds || 90,
        tip: exercise.tip || "",
        target_type: exercise.target_type || "reps",
        target_value: exercise.target_value || exercise.rep_min || 10,
        search: "",
        selection_confirmed: true,
        template_sets: createBlankTemplateSets(exercise.sets || 3),
        suggestionOffset: 0
      }))
    });
    setActiveBuilderExerciseIndex(0);
    setBuilderGroupSearches({});
    setBuilderGroupSearchResults({});
    setBuilderGroupOffsets({});
    setMessage("");
    setMode("review");
  }

  function goToWorkoutReview() {
    const selectedExercises = form.exercises.filter((exercise) => exercise.exercise_name.trim());
    if (selectedExercises.length === 0) {
      setMessage("Select at least one exercise before reviewing.");
      return;
    }

    const incompleteGroup = getBuilderMuscleGroups().find((muscle) => {
      const selectedCount = getSelectedExercisesForMuscle(muscle).length;
      const targetCount = getTargetCountForMuscle(muscle);
      return selectedCount !== targetCount;
    });

    if (incompleteGroup) {
      setMessage(
        `${incompleteGroup} needs ${getTargetCountForMuscle(incompleteGroup)} confirmed exercises before reviewing.`
      );
      return;
    }

    const firstUnconfirmedIndex = form.exercises.findIndex(
      (exercise) => exercise.exercise_name.trim() && !exercise.selection_confirmed
    );

    if (firstUnconfirmedIndex >= 0) {
      setActiveBuilderExerciseIndex(firstUnconfirmedIndex);
      setMessage(`Confirm Exercise ${firstUnconfirmedIndex + 1} before reviewing.`);
      return;
    }

    setMessage("");
    setMode("review");
  }

  function backToExerciseSelection(index = activeBuilderExerciseIndex) {
    setActiveBuilderExerciseIndex(Math.max(0, Math.min(index, form.exercises.length - 1)));
    setMessage("");
    setMode("editor");
  }

  function getBuilderMuscleGroups() {
    return uniqueNames(form.exercises.map((exercise) => exercise.muscle_group || "Chest"));
  }

  function getTargetCountForMuscle(muscle) {
    return form.exercises.filter((exercise) => (exercise.muscle_group || "Chest") === muscle).length;
  }

  function getSelectedExercisesForMuscle(muscle) {
    return form.exercises
      .map((exercise, index) => ({ ...exercise, index }))
      .filter((exercise) => (exercise.muscle_group || "Chest") === muscle && exercise.exercise_name.trim());
  }

  function getGroupExercisePool(muscle) {
    const muscleKey = muscle || "Chest";
    const matchingCustomExercises = customExerciseOptions
      .filter((option) => !option.muscle_group || option.muscle_group.toLowerCase() === muscleKey.toLowerCase())
      .map((option) => option.exercise_name);

    return uniqueNames([
      ...(exerciseLibrary[muscleKey] || []),
      ...(builderSuggestionExtras[muscleKey] || []),
      ...matchingCustomExercises
    ]);
  }

  function getGroupExerciseOptions(muscle) {
    const muscleKey = muscle || "Chest";
    const selectedNames = getSelectedExercisesForMuscle(muscleKey).map((exercise) => exercise.exercise_name);
    const selectedKeys = new Set(selectedNames.map(toExerciseKey));
    const pool = getGroupExercisePool(muscleKey).filter((name) => !selectedKeys.has(toExerciseKey(name)));
    const offset = Number(builderGroupOffsets[muscleKey]) || 0;
    const visiblePool =
      pool.length > 0
        ? Array.from({ length: Math.min(BUILDER_GROUP_OPTION_LIMIT, pool.length) }, (_, index) => {
            const poolIndex = (offset + index) % pool.length;
            return pool[poolIndex];
          })
        : [];

    return uniqueNames([...visiblePool, ...selectedNames]).slice(0, BUILDER_GROUP_OPTION_LIMIT);
  }

  function updateGroupSearch(muscle, value) {
    setBuilderGroupSearches((current) => ({ ...current, [muscle]: value }));
    if (value.trim().length < 2) {
      setBuilderGroupSearchResults((current) => {
        const next = { ...current };
        delete next[muscle];
        return next;
      });
    }
  }

  function toggleGroupExercise(muscle, exerciseName, isTypedCustom = false) {
    const cleanExerciseName = exerciseName.trim();
    if (!cleanExerciseName) return;

    const selectedExercises = getSelectedExercisesForMuscle(muscle);
    const existingSelection = selectedExercises.find(
      (exercise) => toExerciseKey(exercise.exercise_name) === toExerciseKey(cleanExerciseName)
    );

    if (existingSelection) {
      clearBuilderExercise(existingSelection.index);
      return;
    }

    const targetCount = getTargetCountForMuscle(muscle);
    if (selectedExercises.length >= targetCount) {
      setMessage(`${muscle} already has ${targetCount} selected exercises. Remove one to choose another.`);
      return;
    }

    const targetIndex = form.exercises.findIndex(
      (exercise) => (exercise.muscle_group || "Chest") === muscle && !exercise.exercise_name.trim()
    );

    if (targetIndex < 0) return;

    const isCustomExercise = isTypedCustom || !knownExerciseKeys.has(toExerciseKey(cleanExerciseName));
    setActiveBuilderExerciseIndex(targetIndex);
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === targetIndex
          ? {
              ...exercise,
              exercise_name: cleanExerciseName,
              is_custom_exercise: isCustomExercise,
              search: "",
              selection_confirmed: true,
              template_sets: createBlankTemplateSets(exercise.sets)
            }
          : exercise
      )
    }));
    updateGroupSearch(muscle, "");
    setMessage("");
  }

  function clearBuilderExercise(index) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? {
              ...exercise,
              exercise_name: "",
              is_custom_exercise: false,
              search: "",
              selection_confirmed: false,
              template_sets: createBlankTemplateSets(exercise.sets)
            }
          : exercise
      )
    }));
    setMessage("");
  }

  async function refreshGroupSuggestions(muscle) {
    const muscleKey = muscle || "Chest";
    const currentExtras = builderSuggestionExtras[muscleKey] || [];
    const currentPoolLength = getGroupExercisePool(muscleKey).length;
    const currentOffset = Number(builderGroupOffsets[muscleKey]) || 0;
    const nextOffset = currentPoolLength
      ? (currentOffset + BUILDER_GROUP_OPTION_LIMIT) % currentPoolLength
      : BUILDER_GROUP_OPTION_LIMIT;

    setBuilderGroupOffsets((current) => ({ ...current, [muscleKey]: nextOffset }));

    await loadCustomExerciseOptions();

    const fetchOffset = currentExtras.length + (exerciseLibrary[muscleKey] || []).length;
    const [catalogResponse, exerciseDbNames] = await Promise.all([
      supabase && user.id !== "demo-user"
        ? supabase
            .from("exercise_catalog")
            .select("exercise_name")
            .ilike("muscle_group", `%${muscleKey}%`)
            .order("exercise_name", { ascending: true })
            .range(fetchOffset, fetchOffset + 15)
        : Promise.resolve({ data: [], error: null }),
      searchExerciseDb({
        muscle: muscleKey,
        limit: 16,
        offset: fetchOffset
      })
    ]);

    const catalogNames = catalogResponse.error ? [] : (catalogResponse.data || []).map((row) => row.exercise_name);
    const extraNames = uniqueNames([...currentExtras, ...catalogNames, ...exerciseDbNames]);
    setBuilderSuggestionExtras((current) => ({ ...current, [muscleKey]: extraNames }));
    if (extraNames.length) {
      setCatalogExerciseNames((current) => new Set([...current, ...extraNames]));
    }
    setMessage("");
  }

  function updateMuscleTarget(muscle, change) {
    setSetup((current) => ({
      ...current,
      muscleTargets: {
        ...current.muscleTargets,
        [muscle]: Math.max(0, Math.min(12, (Number(current.muscleTargets[muscle]) || 0) + change))
      }
    }));
  }

  function toggleMuscleTarget(muscle) {
    setSetup((current) => {
      const currentCount = Number(current.muscleTargets[muscle]) || 0;
      const hasAnySelected = Object.values(current.muscleTargets).some((count) => Number(count) > 0);
      const defaultCount = hasAnySelected ? 1 : 4;

      return {
        ...current,
        muscleTargets: {
          ...current.muscleTargets,
          [muscle]: currentCount > 0 ? 0 : defaultCount
        }
      };
    });
  }

  function updateDefaultSets(change) {
    setSetup((current) => ({
      ...current,
      defaultSets: Math.max(1, Math.min(8, (Number(current.defaultSets) || 4) + change))
    }));
  }

  function updateHiitTotalExercises(change) {
    setSetup((current) => ({
      ...current,
      hiitTotalExercises: Math.max(1, Math.min(20, (Number(current.hiitTotalExercises) || 4) + change))
    }));
  }

  function selectHiitTimerType(timerType) {
    setSetup((current) => ({
      ...current,
      hiit_timer_type: timerType,
      ...(timerType === "tabata"
        ? {
            hiit_rounds: 8,
            hiit_work_minutes: 0,
            hiit_work_seconds: 40,
            hiit_rest_minutes: 0,
            hiit_rest_seconds: 10,
            hiit_station_rest_minutes: 1,
            hiit_station_rest_seconds: 0,
            hiit_countdown_seconds: 3
          }
        : {})
    }));
  }

  function updateExercise(index, field, value) {
    setActiveBuilderExerciseIndex(index);
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? {
              ...exercise,
              [field]: value,
              ...(field === "search" ? { selection_confirmed: false } : {})
            }
          : exercise
      )
    }));
  }

  function chooseExercise(index, exerciseName, clearSearch = false, isTypedCustom = false) {
    const cleanExerciseName = exerciseName.trim();
    if (!cleanExerciseName) return;
    const isCustomExercise = isTypedCustom || !knownExerciseKeys.has(toExerciseKey(cleanExerciseName));
    setActiveBuilderExerciseIndex(index);

    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? {
              ...exercise,
              exercise_name: cleanExerciseName,
              is_custom_exercise: isCustomExercise,
              search: clearSearch ? "" : exercise.search,
              selection_confirmed: false
            }
          : exercise
      )
    }));
    setMessage("");
  }

  function confirmBuilderExercise(index) {
    const exercise = form.exercises[index];
    if (!exercise) return;

    const typedName = exercise.search.trim();
    if (!exercise.exercise_name.trim() && typedName) {
      const isCustomExercise = !knownExerciseKeys.has(toExerciseKey(typedName));
      setForm((current) => ({
        ...current,
        exercises: current.exercises.map((currentExercise, exerciseIndex) =>
          exerciseIndex === index
            ? {
                ...currentExercise,
                exercise_name: typedName,
                is_custom_exercise: isCustomExercise,
                search: "",
                selection_confirmed: true
              }
            : currentExercise
        )
      }));
      setMessage("");
      return;
    }

    if (!exercise.exercise_name.trim()) {
      setMessage("Select or search an exercise first.");
      return;
    }

    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((currentExercise, exerciseIndex) =>
        exerciseIndex === index ? { ...currentExercise, selection_confirmed: true, search: "" } : currentExercise
      )
    }));
    setMessage("");
  }

  async function refreshSuggestions(index) {
    const exercise = form.exercises[index];
    if (!exercise) return;

    setActiveBuilderExerciseIndex(index);
    const nextOffset = (Number(exercise.suggestionOffset) || 0) + 6;
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? { ...exercise, suggestionOffset: nextOffset }
          : exercise
      )
    }));

    await loadCustomExerciseOptions();

    const muscle = exercise.muscle_group || "";
    const [catalogResponse, exerciseDbNames] = await Promise.all([
      supabase && user.id !== "demo-user"
        ? supabase
            .from("exercise_catalog")
            .select("exercise_name")
            .ilike("muscle_group", `%${muscle}%`)
            .order("exercise_name", { ascending: true })
            .range(nextOffset, nextOffset + 11)
        : Promise.resolve({ data: [], error: null }),
      searchExerciseDb({
        muscle,
        limit: 12,
        offset: nextOffset
      })
    ]);

    const catalogNames = catalogResponse.error ? [] : (catalogResponse.data || []).map((row) => row.exercise_name);
    const extraNames = uniqueNames([...catalogNames, ...exerciseDbNames]);
    setBuilderSuggestionExtras((current) => ({
      ...current,
      [index]: extraNames
    }));
    if (extraNames.length) {
      setCatalogExerciseNames((current) => new Set([...current, ...extraNames]));
    }
    setMessage("");
  }

  async function showDemo(exerciseName) {
    if (!exerciseName) {
      setMessage("Choose an exercise first, then Demo will show its video.");
      return;
    }

    const searchUrl = getYouTubeExerciseSearchUrl(exerciseName);
    setDemoVideo({
      exerciseName,
      embedUrl: "",
      externalUrl: searchUrl,
      loading: true,
      note: "",
      selectedVideoId: "",
      videos: []
    });

    if (!supabase || user.id === "demo-user") {
      try {
        const youtubeVideos = await findYouTubeDemo(exerciseName);
        const firstVideo = youtubeVideos[0];
        setDemoVideo({
          exerciseName,
          embedUrl: firstVideo?.embedUrl || "",
          externalUrl: firstVideo?.externalUrl || searchUrl,
          loading: false,
          note: firstVideo ? "" : "YouTube auto-search is not configured yet.",
          selectedVideoId: firstVideo?.id || "",
          videos: youtubeVideos
        });
      } catch (youtubeError) {
        setDemoVideo(createDemoFallback(exerciseName, youtubeError.message));
      }
      setMessage("");
      return;
    }

    setMessage("");

    const { data, error } = await supabase
      .from("exercise_demo_links")
      .select("youtube_url")
      .eq("exercise_key", toExerciseKey(exerciseName))
      .maybeSingle();

    if (error) {
      setMessage(
        isMissingSupabaseTable(error)
          ? "Demo links are not installed in Supabase yet. Run the updated Phase 4 exercise library SQL first."
          : error.message
      );
      return;
    }

    if (!data?.youtube_url) {
      try {
        const youtubeVideos = await findYouTubeDemo(exerciseName);
        const firstVideo = youtubeVideos[0];
        setDemoVideo({
          exerciseName,
          embedUrl: firstVideo?.embedUrl || "",
          externalUrl: firstVideo?.externalUrl || searchUrl,
          loading: false,
          note: firstVideo ? "" : "YouTube auto-search is not configured yet.",
          selectedVideoId: firstVideo?.id || "",
          videos: youtubeVideos
        });
      } catch (youtubeError) {
        setDemoVideo(createDemoFallback(exerciseName, youtubeError.message));
      }
      setMessage("");
      return;
    }

    const embedUrl = getYouTubeEmbedUrl(data.youtube_url);
    if (!embedUrl) {
      setDemoVideo({ ...createDemoFallback(exerciseName), externalUrl: data.youtube_url });
      return;
    }

    setDemoVideo({
      exerciseName,
      embedUrl,
      externalUrl: data.youtube_url,
      loading: false,
      note: "",
      selectedVideoId: "",
      videos: []
    });
  }

  function addExercise() {
    const nextIndex = form.exercises.length;
    setForm((current) => ({
      ...current,
      exercises: [
        ...current.exercises,
        createExerciseForMuscle(
          current.workout_type === "hiit" ? current.hiit_focus_area || "Full Body" : "Chest",
          current.exercises.length,
          current.workout_type === "hiit" ? Number(current.hiit_rounds) || 1 : 4,
          current.workout_type === "hiit"
            ? {
                rep_min: 10,
                rep_max: "",
                rest_seconds: current.hiit_rest_seconds || 0,
                target_type: "reps",
                target_value: 10
              }
            : {}
        )
      ]
    }));
    setActiveBuilderExerciseIndex(nextIndex);
    setMode("editor");
  }

  function updateExerciseSetCount(index, change) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? (() => {
              const nextSets = Math.max(1, Math.min(12, (Number(exercise.sets) || 1) + change));
              const currentRows = Array.isArray(exercise.template_sets) ? exercise.template_sets : [];
              return {
                ...exercise,
                sets: nextSets,
                template_sets:
                  nextSets > currentRows.length
                    ? [...currentRows, ...createBlankTemplateSets(nextSets - currentRows.length)]
                    : currentRows.slice(0, nextSets)
              };
            })()
          : exercise
      )
    }));
  }

  function updateTemplateSet(index, setIndex, field, value) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) => {
        if (exerciseIndex !== index) return exercise;
        const rows = Array.isArray(exercise.template_sets)
          ? [...exercise.template_sets]
          : createBlankTemplateSets(exercise.sets);
        rows[setIndex] = { ...(rows[setIndex] || { kg: "", reps: "" }), [field]: value };
        const firstFilledRow = rows.find((row) => row.kg !== "" || row.reps !== "");
        return {
          ...exercise,
          template_sets: rows,
          start_kg: firstFilledRow?.kg ?? "",
          rep_min: firstFilledRow?.reps ?? "",
          rep_max: firstFilledRow?.reps ?? ""
        };
      })
    }));
  }

  function getTemplateSetRows(exercise) {
    const rowCount = Math.max(1, Number(exercise.sets) || 1);
    const rows = Array.isArray(exercise.template_sets) ? exercise.template_sets : [];
    return Array.from({ length: rowCount }, (_, index) => rows[index] || { kg: "", reps: "" });
  }

  function removeExercise(index) {
    setForm((current) => ({
      ...current,
      exercises:
        current.exercises.length === 1
          ? current.exercises
          : current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index)
    }));
  }

  async function saveCustomExerciseRequests(cleanExercises) {
    if (!supabase || user.id === "demo-user") return { created: false, failed: false };

    const customExercises = cleanExercises.filter((exercise) => exercise.is_custom_exercise);
    if (customExercises.length === 0) return { created: false, failed: false };

    const uniqueCustomExercises = Array.from(
      new Map(
        customExercises.map((exercise) => [
          exercise.exercise_name.toLowerCase(),
          {
            exercise_name: exercise.exercise_name,
            muscle_group: exercise.muscle_group,
            owner_id: user.id,
            source: "user_custom"
          }
        ])
      ).values()
    );

    const { error: optionError } = await supabase
      .from("user_exercise_options")
      .upsert(uniqueCustomExercises, { onConflict: "owner_id,exercise_name" });

    if (optionError) {
      setMessage(
        isMissingSupabaseTable(optionError)
          ? "Workout saved, but the custom exercise request tables are not installed. Run the Phase 4 exercise library SQL in Supabase."
          : `Workout saved, but the custom exercise request could not be saved: ${optionError.message}`
      );
      return { created: false, failed: true };
    }

    const catalogRows = uniqueCustomExercises.map((exercise) => ({
      exercise_key: toExerciseKey(exercise.exercise_name),
      exercise_name: exercise.exercise_name,
      muscle_group: exercise.muscle_group || null,
      source: "user_custom",
      updated_at: new Date().toISOString()
    }));

    const { error: catalogError } = await supabase
      .from("exercise_catalog")
      .insert(catalogRows);

    if (catalogError && catalogError.code !== "23505") {
      setMessage(
        isMissingSupabaseTable(catalogError)
          ? "Workout saved, but the exercise catalogue table is not installed. Run the Phase 4 exercise library SQL in Supabase."
          : `Workout saved, but the exercise could not be added to the catalogue: ${catalogError.message}`
      );
      return { created: false, failed: true };
    }

    const reviewRows = uniqueCustomExercises.map((exercise) => ({
      requester_id: user.id,
      exercise_name: exercise.exercise_name,
      muscle_group: exercise.muscle_group,
      status: "pending"
    }));

    const { error: reviewError } = await supabase
      .from("exercise_review_requests")
      .upsert(reviewRows, { onConflict: "requester_id,exercise_name" })
      .select("id");
    if (reviewError) {
      setMessage(
        isMissingSupabaseTable(reviewError)
          ? "Workout saved, but the exercise review table is not installed. Run the Phase 4 exercise library SQL in Supabase."
          : `Workout saved, but the custom exercise request could not be sent to admin: ${reviewError.message}`
      );
      return { created: false, failed: true };
    }

    setCustomExerciseNames((current) => {
      const next = new Set(current);
      uniqueCustomExercises.forEach((exercise) => next.add(exercise.exercise_name));
      return next;
    });

    return { created: true, failed: false };
  }

  async function saveWorkout(event) {
    event.preventDefault();
    setMessage("");

    const cleanName = form.name.trim();
    const cleanExercises = form.exercises
      .map((exercise, index) => ({
        position: index + 1,
        exercise_name: exercise.exercise_name.trim(),
        muscle_group: exercise.muscle_group || null,
        sets: Number(exercise.sets) || 1,
        rep_min: exercise.rep_min === "" ? null : Number(exercise.rep_min),
        rep_max: exercise.rep_max === "" ? null : Number(exercise.rep_max),
        start_kg: exercise.start_kg === "" ? null : Number(exercise.start_kg),
        rest_seconds: exercise.rest_seconds === "" ? null : Number(exercise.rest_seconds),
        tip: exercise.tip.trim() || null,
        target_type: form.workout_type === "hiit" ? exercise.target_type || "reps" : null,
        target_value:
          form.workout_type === "hiit"
            ? exercise.target_value === "" || exercise.target_value === null
              ? null
              : Number(exercise.target_value)
            : null,
        is_custom_exercise: Boolean(exercise.is_custom_exercise)
      }))
      .filter((exercise) => exercise.exercise_name);

    if (!cleanName) {
      setMessage("Give this workout a name first.");
      return;
    }

    if (cleanExercises.length === 0) {
      setMessage("Add at least one exercise.");
      return;
    }

    const firstUnconfirmedIndex = form.exercises.findIndex(
      (exercise) => exercise.exercise_name.trim() && !exercise.selection_confirmed
    );
    if (firstUnconfirmedIndex >= 0) {
      setActiveBuilderExerciseIndex(firstUnconfirmedIndex);
      setMessage(`Confirm Exercise ${firstUnconfirmedIndex + 1} before saving.`);
      return;
    }

    if (!supabase || user.id === "demo-user") {
      const demoWorkout = {
        id: editingId || `demo-${Date.now()}`,
        name: cleanName,
        notes: form.notes,
        workout_type: form.workout_type,
        hiit_timer_type: form.hiit_timer_type,
        hiit_rounds: form.hiit_rounds,
        hiit_work_seconds: form.hiit_work_seconds,
        hiit_rest_seconds: form.hiit_rest_seconds,
        hiit_station_rest_seconds: form.hiit_station_rest_seconds,
        hiit_countdown_seconds: form.hiit_countdown_seconds,
        hiit_goal_seconds: form.hiit_goal_seconds,
        hiit_focus_area: form.hiit_focus_area,
        workout_template_exercises: cleanExercises.map((exercise) => ({
          ...exercise,
          id: `${Date.now()}-${exercise.position}`
        }))
      };
      setWorkouts((current) =>
        editingId
          ? current.map((workout) => (workout.id === editingId ? demoWorkout : workout))
          : [demoWorkout, ...current]
      );
      clearRecoveryState(recoveryKey);
      setRecoveryNotice("");
      if (onWorkoutSaved) {
        onWorkoutSaved(demoWorkout);
        return;
      }
      setMode("list");
      return;
    }

    setSaving(true);

    const workoutPayload = {
      owner_id: user.id,
      created_by: user.id,
      name: cleanName,
      notes: form.notes.trim() || null,
      workout_type: form.workout_type,
      source_type: "personal",
      visibility: "private",
      is_template: true,
      updated_at: new Date().toISOString()
    };

    if (form.workout_type === "hiit") {
      workoutPayload.hiit_timer_type = form.hiit_timer_type || "interval";
      workoutPayload.hiit_rounds = Number(form.hiit_rounds) || 1;
      workoutPayload.hiit_work_seconds =
        form.hiit_timer_type === "interval" || form.hiit_timer_type === "tabata"
          ? Number(form.hiit_work_seconds) || 0
          : null;
      workoutPayload.hiit_rest_seconds =
        form.hiit_timer_type === "interval" || form.hiit_timer_type === "tabata"
          ? Number(form.hiit_rest_seconds) || 0
          : null;
      workoutPayload.hiit_station_rest_seconds =
        form.hiit_timer_type === "tabata" ? Number(form.hiit_station_rest_seconds) || 60 : null;
      workoutPayload.hiit_countdown_seconds =
        form.hiit_timer_type === "interval" || form.hiit_timer_type === "tabata"
          ? Number(form.hiit_countdown_seconds) || 0
          : null;
      workoutPayload.hiit_goal_seconds = form.hiit_timer_type === "for_time" ? Number(form.hiit_goal_seconds) || 0 : null;
      workoutPayload.hiit_focus_area = form.hiit_focus_area || "Full Body";
    }

    const workoutResult = editingId
      ? await supabase
          .from("workout_templates")
          .update(workoutPayload)
          .eq("id", editingId)
          .select("id")
          .single()
      : await supabase
          .from("workout_templates")
          .insert(workoutPayload)
          .select("id")
          .single();

    if (workoutResult.error) {
      setMessage(workoutResult.error.message);
      setSaving(false);
      return;
    }

    const templateId = workoutResult.data.id;
    if (editingId) {
      const { error: deleteError } = await supabase
        .from("workout_template_exercises")
        .delete()
        .eq("template_id", templateId);

      if (deleteError) {
        setMessage(deleteError.message);
        setSaving(false);
        return;
      }
    }

    const { error: exerciseError } = await supabase
      .from("workout_template_exercises")
      .insert(
        cleanExercises.map((exercise) => {
          const exercisePayload = { ...exercise };
          delete exercisePayload.is_custom_exercise;
          if (form.workout_type !== "hiit") {
            delete exercisePayload.target_type;
            delete exercisePayload.target_value;
          }
          return {
            ...exercisePayload,
            template_id: templateId
          };
        })
      );

    if (exerciseError) {
      setMessage(exerciseError.message);
      setSaving(false);
      return;
    }

    const customRequestResult = await saveCustomExerciseRequests(cleanExercises);
    await loadWorkouts();
    setSaving(false);
    if (!customRequestResult.failed) {
      setMessage(customRequestResult.created ? "Workout saved. Custom exercise sent for review." : "");
    }
    if (onWorkoutSaved) {
      clearRecoveryState(recoveryKey);
      setRecoveryNotice("");
      onWorkoutSaved({
        id: templateId,
        name: cleanName,
        notes: form.notes,
        workout_type: form.workout_type,
        hiit_timer_type: form.hiit_timer_type,
        hiit_rounds: form.hiit_rounds,
        hiit_work_seconds: form.hiit_work_seconds,
        hiit_rest_seconds: form.hiit_rest_seconds,
        hiit_station_rest_seconds: form.hiit_station_rest_seconds,
        hiit_countdown_seconds: form.hiit_countdown_seconds,
        hiit_goal_seconds: form.hiit_goal_seconds,
        hiit_focus_area: form.hiit_focus_area,
        workout_template_exercises: cleanExercises.map((exercise) => ({
          ...exercise,
          id: `${templateId}-${exercise.position}`
        }))
      });
      return;
    }
    clearRecoveryState(recoveryKey);
    setRecoveryNotice("");
    setMode("list");
  }

  async function deleteWorkout(workoutId) {
    setMessage("");

    if (!window.confirm("Delete this workout permanently?")) return;

    if (!supabase || user.id === "demo-user") {
      setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      setArchivedWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      return;
    }

    const { error } = await supabase
      .from("workout_templates")
      .delete()
      .eq("id", workoutId);

    if (error) {
      setMessage(error.message);
    } else {
      setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      setArchivedWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
    }
  }

  async function archiveWorkout(workoutId) {
    setOpenWorkoutMenu(null);
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      return;
    }

    const { error } = await supabase
      .from("workout_templates")
      .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("owner_id", user.id)
      .eq("id", workoutId);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-10-archive-lifecycle.sql in Supabase first.`);
      return;
    }

    setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
    await loadArchivedWorkouts();
  }

  async function togglePublicTemplate(workout) {
    setOpenWorkoutMenu(null);
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setWorkouts((current) =>
        current.map((item) =>
          item.id === workout.id ? { ...item, is_public_template: !item.is_public_template } : item
        )
      );
      return;
    }

    const { error } = await supabase
      .from("workout_templates")
      .update({
        is_public_template: !workout.is_public_template,
        updated_at: new Date().toISOString()
      })
      .eq("owner_id", user.id)
      .eq("id", workout.id);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-26-public-template-library.sql in Supabase.`);
      return;
    }

    setWorkouts((current) =>
      current.map((item) =>
        item.id === workout.id ? { ...item, is_public_template: !workout.is_public_template } : item
      )
    );
  }

  async function restoreWorkout(workoutId) {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      const restoredWorkout = archivedWorkouts.find((workout) => workout.id === workoutId);
      setArchivedWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      if (restoredWorkout) setWorkouts((current) => [{ ...restoredWorkout, status: "active", archived_at: null }, ...current]);
      return;
    }

    const { error } = await supabase
      .from("workout_templates")
      .update({ status: "active", archived_at: null, updated_at: new Date().toISOString() })
      .eq("owner_id", user.id)
      .eq("id", workoutId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await Promise.all([loadWorkouts(), loadArchivedWorkouts()]);
  }

  function openAssignWorkout(workout) {
    setOpenWorkoutMenu(null);
    setAssignWorkout(workout);
    setSharingWorkout(null);
    setAssignClientIds([]);
    setAssignSearch("");
    setAssignSearchResults([]);
    setMessage("");
    void loadCoachClients();
  }

  function openShareWorkout(workout) {
    setOpenWorkoutMenu(null);
    setAssignWorkout(null);
    setSharingWorkout(workout);
    setMessage("");
    void loadMutualRecipients();
  }

  function toggleAssignClient(clientId) {
    setAssignClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId]
    );
  }

  async function assignWorkoutToClients(clientIds) {
    if (!assignWorkout || !clientIds.length) {
      setMessage("Choose a client first.");
      return;
    }

    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to assign workouts.");
      return;
    }

    setAssigning(true);
    const { error } = await supabase.from("coach_workout_assignments").upsert(
      clientIds.map((clientId) => ({
        coach_id: user.id,
        client_id: clientId,
        workout_template_id: assignWorkout.id,
        status: "active"
      })),
      { onConflict: "coach_id,client_id,workout_template_id" }
    );
    setAssigning(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-8-workout-assignments.sql in Supabase.`);
      return;
    }

    setMessage(`Assigned ${assignWorkout.name} to ${clientIds.length} client${clientIds.length === 1 ? "" : "s"}.`);
    setAssignWorkout(null);
    setAssignClientIds([]);
    setAssignSearch("");
    setAssignSearchResults([]);
  }

  async function saveWorkoutAssignments() {
    await assignWorkoutToClients(assignClientIds);
  }

  async function searchAssignClients(event) {
    event.preventDefault();
    const searchText = assignSearch.trim();
    if (searchText.length < 2) {
      setMessage("Search by at least 2 characters.");
      return;
    }

    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to search clients.");
      return;
    }

    setSearchingAssignClients(true);
    setAssignSearchResults([]);
    const { data, error } = await supabase.rpc("search_users_for_client_invite", {
      search_text: searchText
    });
    setSearchingAssignClients(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-7-coach-client-links.sql in Supabase.`);
      return;
    }

    setAssignSearchResults(data || []);
    if (!data?.length) setMessage("No matching users found.");
  }

  async function linkAndAssignClient(clientId) {
    if (!supabase || user.id === "demo-user") return;

    setAssigning(true);
    const { error } = await supabase.rpc("link_client_to_coach", {
      target_client_id: clientId
    });
    setAssigning(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await assignWorkoutToClients([clientId]);
    await loadCoachClients();
  }

  async function shareWorkoutWithMutual(recipientId) {
    if (!sharingWorkout || !recipientId) return;

    if (!supabase || user.id === "demo-user") {
      setMessage("Connect Supabase to share workouts.");
      return;
    }

    setSharing(true);
    setMessage("");

    const { error } = await supabase.rpc("share_workout_with_mutual", {
      p_workout_template_id: sharingWorkout.id,
      p_recipient_id: recipientId
    });

    setSharing(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-41-coach-unlink-and-mutual-workout-shares.sql in Supabase.`);
      return;
    }

    const recipient = mutualRecipients.find((item) => item.user_id === recipientId);
    setMessage(`${sharingWorkout.name} shared with ${recipient?.full_name || recipient?.email || "your mutual"}.`);
    setSharingWorkout(null);
  }

  async function toggleWorkoutDetails(workout) {
    const isExpanded = expandedWorkoutIds.has(workout.id);
    if (isExpanded) {
      setExpandedWorkoutIds((current) => {
        const next = new Set(current);
        next.delete(workout.id);
        return next;
      });
      return;
    }

    if (!workout.workout_template_exercises?.length) {
      const detailedWorkout = await loadWorkoutDetails(workout);
      if (!detailedWorkout) return;
      setWorkouts((current) =>
        current.map((item) => (item.id === workout.id ? { ...item, ...detailedWorkout } : item))
      );
    }

    setExpandedWorkoutIds((current) => new Set([...current, workout.id]));
  }

  async function duplicateWorkout(workout) {
    setMessage("");

    const detailedWorkout = await loadWorkoutDetails(workout);
    if (!detailedWorkout) return;

    const exercises = detailedWorkout.workout_template_exercises || [];
    const duplicateName = `${detailedWorkout.name} Copy`;

    if (!supabase || user.id === "demo-user") {
      const duplicate = {
        ...detailedWorkout,
        id: `demo-${Date.now()}`,
        name: duplicateName,
        created_at: new Date().toISOString(),
        workout_template_exercises: exercises.map((exercise, index) => ({
          ...exercise,
          id: `demo-${Date.now()}-${index}`,
          position: index + 1
        }))
      };
      setWorkouts((current) => [duplicate, ...current]);
      setMessage("Workout duplicated.");
      return;
    }

    setSaving(true);

    const { data: template, error: templateError } = await supabase
      .from("workout_templates")
      .insert({
        owner_id: user.id,
        created_by: user.id,
        name: duplicateName,
        notes: detailedWorkout.notes || null,
        workout_type: detailedWorkout.workout_type || "strength",
        hiit_timer_type: detailedWorkout.hiit_timer_type || null,
        hiit_rounds: detailedWorkout.hiit_rounds || null,
        hiit_work_seconds: detailedWorkout.hiit_work_seconds || null,
        hiit_rest_seconds: detailedWorkout.hiit_rest_seconds || null,
        hiit_station_rest_seconds: detailedWorkout.hiit_station_rest_seconds || null,
        hiit_countdown_seconds: detailedWorkout.hiit_countdown_seconds || null,
        hiit_goal_seconds: detailedWorkout.hiit_goal_seconds || null,
        hiit_focus_area: detailedWorkout.hiit_focus_area || null,
        source_type: "personal",
        visibility: "private",
        is_template: true,
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (templateError) {
      setMessage(templateError.message);
      setSaving(false);
      return;
    }

    if (exercises.length > 0) {
      const { error: exerciseError } = await supabase.from("workout_template_exercises").insert(
        exercises.map((exercise, index) => ({
          template_id: template.id,
          position: index + 1,
          exercise_name: exercise.exercise_name,
          muscle_group: exercise.muscle_group || null,
          sets: exercise.sets || 1,
          rep_min: exercise.rep_min || null,
          rep_max: exercise.rep_max || null,
          start_kg: exercise.start_kg || null,
          rest_seconds: exercise.rest_seconds || null,
          tip: exercise.tip || null,
          superset_group: exercise.superset_group || null,
          target_type: exercise.target_type || null,
          target_value: exercise.target_value || null
        }))
      );

      if (exerciseError) {
        setMessage(exerciseError.message);
        setSaving(false);
        return;
      }
    }

    await loadWorkouts();
    setSaving(false);
    setMessage("Workout duplicated.");
  }

  async function startSession(workout) {
    const detailedWorkout = await loadWorkoutDetails(workout);
    if (!detailedWorkout) return;

    if (detailedWorkout.workout_type === "hiit") {
      const workoutExercises = detailedWorkout.workout_template_exercises || [];
      if (workoutExercises.length === 0) {
        setMessage("Add at least one exercise before starting this HIIT workout.");
        return;
      }

      if (detailedWorkout.hiit_timer_type === "for_time") {
        const forTimePacing = await loadForTimePacing(detailedWorkout.id);
        setActiveWorkout({
          ...detailedWorkout,
          startedAt: new Date().toISOString(),
          previousBestDurationSeconds: forTimePacing.bestDurationSeconds,
          workout_template_exercises: workoutExercises.map((exercise) => ({
            ...exercise,
            previousSplit: forTimePacing.latestSplitsByPosition[exercise.position]
          }))
        });
        setHiitForTime({
          running: false,
          phase: "ready",
          countdownRemaining: Number(detailedWorkout.hiit_countdown_seconds) || 3,
          elapsedSeconds: 0,
          stationElapsedSeconds: 0,
          exerciseIndex: 0,
          completedStations: []
        });
        setCompletedSession(null);
        setMessage("");
        setMode("hiit-for-time");
        return;
      }

      setActiveWorkout({
        ...detailedWorkout,
        startedAt: new Date().toISOString(),
        workout_template_exercises: workoutExercises
      });
      setHiitInterval({
        phase: "countdown",
        remaining: Number(detailedWorkout.hiit_countdown_seconds) || 3,
        exerciseIndex: 0,
        round: 1,
        running: true,
        completedCycles: 0
      });
      hiitLastBeepRef.current = "";
      playTone("start");
      setCompletedSession(null);
      setMessage("");
      setMode("hiit-session");
      return;
    }

    const workoutExercises = detailedWorkout.workout_template_exercises || [];
    const previousSetsByExercise = await loadPreviousSetsForWorkout(workoutExercises, detailedWorkout.id);

    setActiveWorkout({
      ...detailedWorkout,
      startedAt: new Date().toISOString(),
      workout_template_exercises: workoutExercises.map((exercise) => ({
        ...exercise,
        original_exercise_name: exercise.exercise_name,
        previousSets: previousSetsByExercise[exercise.exercise_name]?.chips || [],
        sessionRows: createSessionRows(exercise, previousSetsByExercise[exercise.exercise_name]?.rows || [])
      }))
    });
    setCompletedSession(null);
    setSessionFeedback({ rating: 0, comment: "" });
    setMode("session");
  }

  useEffect(() => {
    if (!autoStartWorkout) return;

    const startKey = autoStartWorkout.autoStartKey || `${autoStartWorkout.id || "workout"}-${autoStartWorkout.name || ""}`;
    if (autoStartedWorkoutRef.current === startKey) return;

    autoStartedWorkoutRef.current = startKey;
    Promise.resolve().then(() => startSession(autoStartWorkout));
  // startSession is intentionally guarded by autoStartedWorkoutRef so the handoff only runs once per requested workout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartWorkout]);

  function toggleHiitTimer() {
    setHiitInterval((current) => (current ? { ...current, running: !current.running } : current));
  }

  function skipHiitPhase() {
    if (!activeWorkout) return;
    setHiitInterval((current) => (current ? getNextHiitIntervalState(current, activeWorkout) : current));
  }

  function finishHiitIntervalSession() {
    setHiitInterval((current) => (current ? { ...current, phase: "complete", remaining: 0, running: false } : current));
  }

  function toggleForTimeTimer() {
    setHiitForTime((current) => {
      if (!current) return current;
      if (!current.running) playTone(current.phase === "ready" ? "warning" : "start");
      return {
        ...current,
        running: !current.running,
        phase: current.phase === "ready" ? "countdown" : current.phase
      };
    });
  }

  async function completeForTimeStation() {
    if (!activeWorkout || !hiitForTime) return;

    const exercises = activeWorkout.workout_template_exercises || [];
    const exerciseCount = exercises.length;
    const totalRounds = Math.max(1, Number(activeWorkout.hiit_rounds) || 1);
    const totalStations = exerciseCount * totalRounds;
    const currentStationIndex = Math.min(
      hiitForTime.completedStations.length,
      Math.max(totalStations - 1, 0)
    );
    const currentExerciseIndex = exerciseCount ? currentStationIndex % exerciseCount : 0;
    const currentExercise = exercises[currentExerciseIndex];
    if (!currentExercise || hiitForTime.phase !== "active") return;

    const completedStation = {
      exerciseIndex: currentExerciseIndex,
      exerciseName: currentExercise.exercise_name,
      round: Math.floor(currentStationIndex / Math.max(exerciseCount, 1)) + 1,
      durationSeconds: hiitForTime.stationElapsedSeconds,
      completedAtSeconds: hiitForTime.elapsedSeconds
    };
    const completedStations = [...hiitForTime.completedStations, completedStation];
    const nextStationIndex = completedStations.length;
    const isFinalStation = nextStationIndex >= totalStations;
    const nextExerciseIndex = exerciseCount ? nextStationIndex % exerciseCount : 0;
    playTone(isFinalStation ? "done" : "start");

    if (isFinalStation) {
      await finishForTimeSession(completedStations);
      return;
    }

    setHiitForTime((current) =>
      current
        ? {
            ...current,
            running: true,
            phase: "active",
            exerciseIndex: nextExerciseIndex,
            stationElapsedSeconds: 0,
            completedStations,
            complete: false
          }
        : current
    );
  }

  async function finishForTimeSession(forcedSplits = null) {
    if (!activeWorkout || !hiitForTime) return;

    setSaving(true);
    setMessage("");

    const completedAt = new Date().toISOString();
    const startedAt = activeWorkout.startedAt || completedAt;
    const splits = forcedSplits || hiitForTime.completedStations || [];
    const durationSeconds = Math.max(
      hiitForTime.elapsedSeconds,
      splits.reduce((sum, split) => sum + (Number(split.durationSeconds) || 0), 0)
    );
    const previousBestDurationSeconds = activeWorkout.previousBestDurationSeconds ?? null;
    const isPbTime = previousBestDurationSeconds === null || durationSeconds < previousBestDurationSeconds;
    const pbLabel =
      previousBestDurationSeconds === null
        ? "First logged time"
        : isPbTime
          ? "PB time"
          : `Best ${formatClock(previousBestDurationSeconds)}`;

    let sessionId = `demo-hiit-${Date.now()}`;
    if (supabase && user.id !== "demo-user") {
      const { data: sessionLog, error: sessionError } = await supabase
        .from("session_logs")
        .insert({
          owner_id: user.id,
          workout_template_id: activeWorkout.id || null,
          name: activeWorkout.name,
          notes: activeWorkout.notes || null,
          workout_type: "hiit",
          status: "completed",
          started_at: startedAt,
          completed_at: completedAt,
          duration_seconds: durationSeconds,
          total_exercises: activeWorkout.workout_template_exercises?.length || 0,
          completed_sets: splits.length,
          total_volume_kg: 0
        })
        .select("id")
        .single();

      if (sessionError) {
        setMessage(`${sessionError.message}. Run supabase/phase-3-session-logging.sql in Supabase first.`);
        setSaving(false);
        return;
      }

      sessionId = sessionLog.id;

      if (splits.length) {
        const workoutExercises = activeWorkout.workout_template_exercises || [];
        const splitRows = splits.map((split, index) => {
          const exercise = workoutExercises[split.exerciseIndex] || {};
          return {
            session_id: sessionId,
            workout_template_exercise_id: exercise.id || null,
            position: index + 1,
            exercise_name: split.exerciseName || exercise.exercise_name || `Station ${index + 1}`,
            muscle_group: exercise.muscle_group || activeWorkout.hiit_focus_area || null,
            target_type: exercise.target_type || null,
            target_value: exercise.target_value === "" || exercise.target_value == null ? null : Number(exercise.target_value),
            split_duration_seconds: Number(split.durationSeconds) || 0,
            completed_at_seconds: Number(split.completedAtSeconds) || null
          };
        });

        const { error: splitError } = await supabase.from("session_log_exercises").insert(splitRows);
        if (splitError) {
          setMessage(`${splitError.message}. Run supabase/phase-5-for-time-session-splits.sql in Supabase first.`);
        }
      }
    }

    setCompletedSession({
      id: sessionId,
      name: activeWorkout.name,
      startedAt,
      completedAt,
      durationSeconds,
      totalExercises: activeWorkout.workout_template_exercises?.length || 0,
      completedSets: splits.length,
      totalVolumeKg: 0,
      sessionType: "for_time",
      splits,
      previousBestDurationSeconds,
      isPbTime,
      pbLabel,
      achievementMoments: [{
        id: "for-time-result",
        label: isPbTime ? "Achievement moment" : "For Time result",
        title: isPbTime ? pbLabel : `Finished in ${formatShortDuration(durationSeconds)}`,
        detail: previousBestDurationSeconds === null
          ? "First benchmark logged"
          : `Best time ${formatClock(previousBestDurationSeconds)}`
      }]
    });

    setHiitForTime((current) => (current ? { ...current, running: false, phase: "complete", complete: true } : current));
    clearRecoveryState(recoveryKey);
    setRecoveryNotice("");
    playTone("done");
    setSaving(false);
    setMode("complete");
  }

  function updateSessionRow(exerciseIndex, rowIndex, field, value) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex
          ? {
              ...exercise,
              sessionRows: exercise.sessionRows.map((row, currentRowIndex) =>
                currentRowIndex === rowIndex ? { ...row, [field]: value } : row
              )
            }
          : exercise
      )
    }));
  }

  function addSessionSet(exerciseIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex
          ? {
              ...exercise,
              sessionRows: [
                ...exercise.sessionRows,
                {
                  setNumber: exercise.sessionRows.length + 1,
                  kg: exercise.start_kg ?? "",
                  reps: exercise.rep_min ?? "",
                  done: false
                }
              ]
            }
          : exercise
      )
    }));
  }

  function removeSessionSet(exerciseIndex, rowIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) => {
        if (currentExerciseIndex !== exerciseIndex || exercise.sessionRows.length === 1) return exercise;

        return {
          ...exercise,
          sessionRows: exercise.sessionRows
            .filter((_, currentRowIndex) => currentRowIndex !== rowIndex)
            .map((row, index) => ({ ...row, setNumber: index + 1 }))
        };
      })
    }));
  }

  function markSessionSetDone(exerciseIndex, rowIndex) {
    updateSessionRow(exerciseIndex, rowIndex, "done", true);
    setActiveNumberInput(null);
    playTone("done");
  }

  function moveToNextNumberInput() {
    if (!activeNumberInput || !activeWorkout) return;

    const { exerciseIndex, rowIndex, field } = activeNumberInput;
    const exercise = activeWorkout.workout_template_exercises[exerciseIndex];
    if (!exercise) return;

    if (field === "kg") {
      setActiveNumberInput({ exerciseIndex, rowIndex, field: "reps", replaceOnInput: true });
      return;
    }

    updateSessionRow(exerciseIndex, rowIndex, "done", true);
    playTone("done");

    if (rowIndex + 1 < exercise.sessionRows.length) {
      setActiveNumberInput({ exerciseIndex, rowIndex: rowIndex + 1, field: "kg", replaceOnInput: true });
      return;
    }

    setActiveNumberInput(null);
  }

  function updateActiveNumber(value) {
    if (!activeNumberInput) return;
    updateSessionRow(activeNumberInput.exerciseIndex, activeNumberInput.rowIndex, activeNumberInput.field, value);
  }

  function activateSessionNumberInput(event, exerciseIndex, rowIndex, field) {
    event.preventDefault();
    setActiveNumberInput({ exerciseIndex, rowIndex, field, replaceOnInput: true });
    sessionInputRefs.current[`${exerciseIndex}-${rowIndex}-${field}`]?.focus?.({ preventScroll: true });
  }

  function handleKeypadPointer(event, key) {
    event.preventDefault();
    keypadPointerHandledRef.current = window.performance?.now?.() || Date.now();
    pressKeypad(key);
  }

  function handleKeypadClick(key) {
    const now = window.performance?.now?.() || Date.now();
    if (now - keypadPointerHandledRef.current < 450) return;
    pressKeypad(key);
  }

  function pressKeypad(key) {
    if (!activeNumberInput || !activeWorkout) return;

    const exercise = activeWorkout.workout_template_exercises[activeNumberInput.exerciseIndex];
    const row = exercise?.sessionRows?.[activeNumberInput.rowIndex];
    const currentValue = String(row?.[activeNumberInput.field] ?? "");

    if (key === "hide") {
      setActiveNumberInput(null);
      return;
    }

    if (key === "next") {
      moveToNextNumberInput();
      return;
    }

    if (key === "delete") {
      updateActiveNumber(currentValue.slice(0, -1));
      setActiveNumberInput((current) => current ? { ...current, replaceOnInput: false } : current);
      return;
    }

    if (key === "." && currentValue.includes(".")) return;
    updateActiveNumber(activeNumberInput.replaceOnInput ? key : `${currentValue}${key}`);
    setActiveNumberInput((current) => current ? { ...current, replaceOnInput: false } : current);
  }

  function openSwapExercise(exerciseIndex) {
    setSwapTargetIndex(exerciseIndex);
    setSwapSearch("");
    setSwapCatalogResults([]);
    setSwapExerciseDbResults([]);
    setOpenSessionMenu(null);
    setActiveNumberInput(null);
    setMessage("");
    window.requestAnimationFrame(() => {
      sessionInputRefs.current[`exercise-${exerciseIndex}`]?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function chooseSwapExercise(exerciseName) {
    if (swapTargetIndex === null) return;

    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) => {
        if (currentExerciseIndex !== swapTargetIndex) return exercise;
        return {
          ...exercise,
          exercise_name: exerciseName,
          skipped: false,
          original_exercise_name: exercise.original_exercise_name || exercise.exercise_name,
          previousSets: []
        };
      })
    }));
    setSwapTargetIndex(null);
    setSwapSearch("");
    setMessage(`Swapped to ${exerciseName}.`);
  }

  function skipSessionExercise(exerciseIndex) {
    setActiveWorkout((current) => ({
      ...current,
      workout_template_exercises: current.workout_template_exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex ? { ...exercise, skipped: true } : exercise
      )
    }));
    setOpenSessionMenu(null);
    setSwapTargetIndex(null);
    setMessage("Exercise skipped for this session.");
  }

  function addExerciseToActiveSession() {
    const exerciseName = window.prompt("Exercise name");
    const cleanExerciseName = exerciseName?.trim();
    if (!cleanExerciseName) return;

    setActiveWorkout((current) => {
      if (!current) return current;
      const nextPosition = (current.workout_template_exercises || []).length + 1;
      return {
        ...current,
        workout_template_exercises: [
          ...(current.workout_template_exercises || []),
          {
            id: `session-extra-${Date.now()}`,
            position: nextPosition,
            exercise_name: cleanExerciseName,
            original_exercise_name: cleanExerciseName,
            muscle_group: "Extra",
            sets: 1,
            rep_min: "",
            rep_max: "",
            previousSets: [],
            sessionRows: createSessionRows({ sets: 1, rep_min: "", start_kg: "" }, [])
          }
        ]
      };
    });
    setMessage("");
  }

  async function loadPreviousStrengthRecords() {
    if (!supabase || user.id === "demo-user") {
      return buildStrengthRecordsFromSessions([]);
    }

    const { data, error } = await supabase
      .from("session_logs")
      .select(
        "id,name,total_volume_kg,session_log_exercises(exercise_name,session_log_sets(kg,reps,completed))"
      )
      .eq("owner_id", user.id)
      .order("completed_at", { ascending: false })
      .limit(250);

    if (error) return buildStrengthRecordsFromSessions([]);
    return buildStrengthRecordsFromSessions(data || []);
  }

  async function finishActiveSession() {
    if (!activeWorkout) return;

    setSaving(true);
    setMessage("");
    setActiveNumberInput(null);

    const completedAt = new Date().toISOString();
    const startedAt = activeWorkout.startedAt || completedAt;
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    );
    const summary = calculateSessionSummary(activeWorkout);

    if (!supabase || user.id === "demo-user") {
      const previousRecords = buildStrengthRecordsFromSessions([]);
      const achievementMoments = buildAchievementMoments(activeWorkout, summary, previousRecords);
      setCompletedSession({
        id: `demo-session-${Date.now()}`,
        name: activeWorkout.name,
        startedAt,
        completedAt,
        durationSeconds,
        achievementMoments,
        ...summary
      });
      clearRecoveryState(recoveryKey);
      setRecoveryNotice("");
      setSaving(false);
      setMode("complete");
      return;
    }

    const previousRecords = await loadPreviousStrengthRecords();
    const achievementMoments = buildAchievementMoments(activeWorkout, summary, previousRecords);

    const { data: sessionLog, error: sessionError } = await supabase
      .from("session_logs")
      .insert({
        owner_id: user.id,
        workout_template_id: activeWorkout.id || null,
        name: activeWorkout.name,
        notes: activeWorkout.notes || null,
        workout_type: activeWorkout.workout_type || "strength",
        status: "completed",
        started_at: startedAt,
        completed_at: completedAt,
        duration_seconds: durationSeconds,
        total_exercises: summary.totalExercises,
        completed_sets: summary.completedSets,
        total_volume_kg: summary.totalVolumeKg
      })
      .select("id")
      .single();

    if (sessionError) {
      setMessage(`${sessionError.message}. Run supabase/phase-3-session-logging.sql in Supabase first.`);
      setSaving(false);
      return;
    }

    for (const [exerciseIndex, exercise] of activeWorkout.workout_template_exercises.entries()) {
      const { data: sessionExercise, error: exerciseError } = await supabase
        .from("session_log_exercises")
        .insert({
          session_id: sessionLog.id,
          workout_template_exercise_id: exercise.id || null,
          position: exerciseIndex + 1,
          exercise_name: exercise.exercise_name,
          original_exercise_name: exercise.original_exercise_name || exercise.exercise_name,
          muscle_group: exercise.muscle_group || null,
          target_sets: exercise.sets || null,
          target_rep_min: exercise.rep_min || null,
          target_rep_max: exercise.rep_max || null,
          skipped: Boolean(exercise.skipped),
          substituted: Boolean(exercise.original_exercise_name && exercise.original_exercise_name !== exercise.exercise_name)
        })
        .select("id")
        .single();

      if (exerciseError) {
        setMessage(exerciseError.message);
        setSaving(false);
        return;
      }

      const sessionSets = (exercise.sessionRows || []).map((row) => ({
        session_exercise_id: sessionExercise.id,
        set_number: row.setNumber,
        kg: row.kg === "" ? null : Number(row.kg),
        reps: row.reps === "" ? null : Number(row.reps),
        completed: Boolean(row.done)
      }));

      if (sessionSets.length) {
        const { error: setError } = await supabase.from("session_log_sets").insert(sessionSets);
        if (setError) {
          setMessage(setError.message);
          setSaving(false);
          return;
        }
      }
    }

    setCompletedSession({
      id: sessionLog.id,
      name: activeWorkout.name,
      startedAt,
      completedAt,
      durationSeconds,
      achievementMoments,
      ...summary
    });
    clearRecoveryState(recoveryKey);
    setRecoveryNotice("");
    setSaving(false);
    setMode("complete");
  }

  async function saveSessionFeedback() {
    if (!completedSession) return;

    if (supabase && user.id !== "demo-user") {
      setSaving(true);
      const { error } = await supabase
        .from("session_logs")
        .update({
          rating: sessionFeedback.rating || null,
          comment: sessionFeedback.comment.trim() || null
        })
        .eq("id", completedSession.id);

      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShareMode("transparent");
    setSharePhoto("");
    setMode("share");
  }

  function finishShareFlow() {
    setCompletedSession(null);
    setActiveWorkout(null);
    setHiitInterval(null);
    setHiitForTime(null);
    setSessionFeedback({ rating: 0, comment: "" });
    setShareMode("transparent");
    setSharePhoto("");
    void loadRecentSessions();
    setMode("list");
  }

  function cancelActiveSession() {
    const shouldCancel = window.confirm("End this workout without saving it to history?");
    if (!shouldCancel) return;

    clearRecoveryState(recoveryKey);
    setActiveWorkout(null);
    setHiitInterval(null);
    setHiitForTime(null);
    setActiveNumberInput(null);
    setOpenSessionMenu(null);
    setSwapTargetIndex(null);
    setSwapSearch("");
    setMessage("");
    setRecoveryNotice("");
    setMode("list");
  }

  function discardRecoveredWorkout() {
    const shouldDiscard = window.confirm("Discard this unfinished workout and clear the saved recovery?");
    if (!shouldDiscard) return;

    clearRecoveryState(recoveryKey);
    setEditingId(null);
    setSetup(createDefaultSetup());
    setForm(createEmptyForm());
    setQuickLogForm(createQuickLogForm());
    setActiveWorkout(null);
    setHiitInterval(null);
    setHiitForTime(null);
    setActiveNumberInput(null);
    setOpenSessionMenu(null);
    setSwapTargetIndex(null);
    setSwapSearch("");
    setCompletedSession(null);
    setRecoveryNotice("");
    setMessage("Unfinished workout discarded.");
    setMode("list");
  }

  function renderRecoveryBanner(contextLabel = "Workout progress") {
    void contextLabel;
    void recoveryNotice;
    return null;
  }

  function handleSharePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setSharePhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function drawShareImage(ctx, canvas, image = null, icon = null) {
    const width = canvas.width;
    const height = canvas.height;
    const isBranded = shareMode === "branded";
    const isForTimeSession = completedSession?.sessionType === "for_time";
    const duration = completedSession
      ? formatShortDuration(completedSession.durationSeconds)
      : "0s";
    const date = completedSession
      ? new Date(completedSession.completedAt).toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short"
        })
      : "";
    const moment = isForTimeSession
      ? primaryAchievementMoment(completedSession)
      : primaryStrengthShareMoment(completedSession);

    ctx.fillStyle = "#101b25";
    ctx.fillRect(0, 0, width, height);

    if (image) {
      const scale = Math.max(width / image.width, height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }

    if (isBranded || image) {
      ctx.fillStyle = isBranded ? "rgba(7, 16, 24, 0.72)" : "rgba(7, 16, 24, 0.24)";
      ctx.fillRect(0, 0, width, height);
    }

    const drawTrimmedText = (text, x, y, maxWidth) => {
      const value = String(text || "");
      if (ctx.measureText(value).width <= maxWidth) {
        ctx.fillText(value, x, y);
        return;
      }

      let trimmed = value;
      while (trimmed.length > 3 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
      }
      ctx.fillText(`${trimmed.trim()}...`, x, y);
    };

    const drawIcon = (centerX, y, size = 96) => {
      if (icon?.width && icon?.height) {
        ctx.drawImage(icon, centerX - size / 2, y, size, size);
        return size;
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "#50d0c7";
      ctx.font = `900 ${Math.round(size * 0.62)}px Arial`;
      ctx.fillText("M", centerX, y + size * 0.72);
      return size;
    };

    if (isForTimeSession) {
      const splits = completedSession?.splits || [];
      const columns = splits.length > 10 ? 2 : 1;
      const rows = Math.max(1, Math.ceil(splits.length / columns));
      const splitTop = 500;
      const splitBottom = 1320;
      const rowHeight = Math.max(34, Math.min(82, Math.floor((splitBottom - splitTop) / rows)));
      const columnGap = 54;
      const sidePadding = 120;
      const columnWidth = (width - sidePadding * 2 - columnGap * (columns - 1)) / columns;
      const nameWidth = columnWidth - 150;

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 38px Arial";
      ctx.fillText("WORKOUT COMPLETE", width / 2, 180);
      ctx.font = "900 74px Arial";
      drawTrimmedText(completedSession?.name || "Workout", width / 2, 275, width - 180);

      ctx.font = "800 30px Arial";
      ctx.fillStyle = "rgba(255,255,255,0.86)";
      ctx.textAlign = "left";
      ctx.fillText(date, sidePadding, 370);
      ctx.textAlign = "right";
      ctx.fillText(`${completedSession?.totalExercises || 0} EXERCISES`, width - sidePadding, 370);

      ctx.textAlign = "left";
      ctx.font = splits.length > 14 ? "700 25px Arial" : "750 28px Arial";
      splits.forEach((split, index) => {
        const column = Math.floor(index / rows);
        const row = index % rows;
        const x = sidePadding + column * (columnWidth + columnGap);
        const y = splitTop + row * rowHeight;

        ctx.fillStyle = "rgba(7, 16, 24, 0.46)";
        ctx.fillRect(x - 18, y - 28, columnWidth + 36, rowHeight - 8);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        drawTrimmedText(`${index + 1}. ${split.exerciseName}`, x, y, nameWidth);
        ctx.textAlign = "right";
        ctx.fillStyle = "#50d0c7";
        ctx.fillText(formatClock(split.durationSeconds), x + columnWidth, y);
        ctx.textAlign = "left";
      });

      ctx.fillStyle = "rgba(7, 16, 24, 0.58)";
      ctx.fillRect(110, 1430, width - 220, 185);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "800 28px Arial";
      ctx.fillText("TIME", 155, 1500);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 58px Arial";
      ctx.fillText(duration, 155, 1570);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "800 28px Arial";
      ctx.fillText("RESULT", width - 155, 1500);
      ctx.fillStyle = completedSession?.isPbTime ? "#50d0c7" : "#ffffff";
      ctx.font = "900 42px Arial";
      drawTrimmedText(moment.title || completedSession?.pbLabel || "For Time", width - 155, 1570, 390);

      ctx.textAlign = "center";
      drawIcon(width / 2, 1695, 96);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 26px Arial";
      ctx.fillText("MOVE - TRAIN - GROW", width / 2, 1830);
      return;
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 48px Arial";
    ctx.fillText("WORKOUT COMPLETE", width / 2, 340);
    ctx.font = "900 92px Arial";
    drawTrimmedText(completedSession?.name || "Workout", width / 2, 460, width - 150);

    const centerStats = [
      ["VOLUME", `${Math.round(completedSession?.totalVolumeKg || 0).toLocaleString()}kg`],
      ["DURATION", duration],
      ["BEST LIFT", moment.title || "Best lift"],
      ["WEIGHT", moment.detail || ""]
    ];
    centerStats.forEach(([label, value], index) => {
      const y = 720 + index * 180;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "800 30px Arial";
      ctx.fillText(label, width / 2, y);
      ctx.fillStyle = index === 2 ? "#50d0c7" : "#ffffff";
      ctx.font = index === 2 ? "900 58px Arial" : "900 66px Arial";
      drawTrimmedText(value, width / 2, y + 78, width - 180);
    });

    drawIcon(width / 2, 1580, 132);
  }

  async function saveShareImage() {
    if (!completedSession) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const context = canvas.getContext("2d");
    if (!context) return;

    const download = () => {
      const link = document.createElement("a");
      link.download = `${completedSession.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-workout.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    const [image, icon] = await Promise.all([
      sharePhoto ? loadCanvasImage(sharePhoto) : Promise.resolve(null),
      loadCanvasImage(movementzIconSrc)
    ]);

    drawShareImage(context, canvas, image, icon);
    download();
  }

  function renderDemoModal() {
    if (!demoVideo) return null;

    return (
      <div className="demo-modal-backdrop" role="presentation">
        <div className="demo-modal" role="dialog" aria-modal="true" aria-label={`${demoVideo.exerciseName} demo`}>
          <div className="demo-modal-head">
            <div>
              <h2>{demoVideo.exerciseName}</h2>
              <p>Exercise tutorial</p>
            </div>
            <button
              className="icon-action"
              onClick={() => setDemoVideo(null)}
              type="button"
              aria-label="Close demo"
            >
              x
            </button>
          </div>

          {demoVideo.loading ? (
            <div className="demo-loading">
              <span className="demo-spinner" aria-hidden="true" />
              <p>Finding tutorials...</p>
            </div>
          ) : demoVideo.embedUrl ? (
            <div className="demo-frame-shell">
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                src={demoVideo.embedUrl}
                title={`${demoVideo.exerciseName} exercise demo`}
              />
            </div>
          ) : (
            <div className="demo-search-fallback">
              <h3>Demo video not attached yet</h3>
              <p>
                {demoVideo.note ||
                  "Add a YouTube API key for automatic in-app lookup, or attach an approved admin demo link."}
              </p>
              <a className="primary-action filled" href={demoVideo.externalUrl} rel="noreferrer" target="_blank">
                Open YouTube search
              </a>
            </div>
          )}

          {!demoVideo.loading && demoVideo.videos?.length > 1 ? (
            <div className="demo-video-list">
              <p>More tutorials</p>
              {demoVideo.videos.map((video) => (
                <button
                  className={demoVideo.selectedVideoId === video.id ? "active" : ""}
                  key={video.id}
                  onClick={() =>
                    setDemoVideo((current) => ({
                      ...current,
                      embedUrl: video.embedUrl,
                      externalUrl: video.externalUrl,
                      selectedVideoId: video.id
                    }))
                  }
                  type="button"
                >
                  {video.thumbnail ? <img alt="" src={video.thumbnail} /> : null}
                  <span>
                    <strong>{video.title}</strong>
                    <small>{video.channel}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderGroupedExercisePicker() {
    const groups = getBuilderMuscleGroups();

    if (groups.length === 0) {
      return (
        <div className="setup-card">
          <p className="compact-help">Go back and choose at least one muscle group.</p>
        </div>
      );
    }

    return (
      <div className="builder-group-grid">
        {groups.map((muscle) => {
          const targetCount = getTargetCountForMuscle(muscle);
          const selectedExercises = getSelectedExercisesForMuscle(muscle);
          const selectedNames = new Set(selectedExercises.map((exercise) => toExerciseKey(exercise.exercise_name)));
          const options = getGroupExerciseOptions(muscle);
          const searchValue = builderGroupSearches[muscle] || "";
          const searchResults = searchValue
            ? uniqueNames([
                ...(builderGroupSearchResults[muscle] || []),
                ...getLocalExerciseNames().filter((name) =>
                  name.toLowerCase().includes(searchValue.toLowerCase())
                ),
                ...customExerciseList.filter((name) =>
                  name.toLowerCase().includes(searchValue.toLowerCase())
                )
              ]).slice(0, 8)
            : [];
          const hasReachedTarget = selectedExercises.length >= targetCount;

          return (
            <article
              className={selectedExercises.length === targetCount ? "builder-group-card complete" : "builder-group-card"}
              key={muscle}
            >
              <div className="builder-group-head">
                <div>
                  <p className="eyebrow">{muscle} exercises</p>
                  <h3>
                    {selectedExercises.length}/{targetCount} selected
                  </h3>
                </div>
                <button className="primary-action compact" onClick={() => refreshGroupSuggestions(muscle)} type="button">
                  Refresh
                </button>
              </div>

              <div className="builder-option-list">
                {options.map((option) => {
                  const isSelected = selectedNames.has(toExerciseKey(option));
                  return (
                    <button
                      className={isSelected ? "builder-option selected" : "builder-option"}
                      disabled={!isSelected && hasReachedTarget}
                      key={option}
                      onClick={() => toggleGroupExercise(muscle, option)}
                      type="button"
                    >
                      <span>{option}</span>
                      <strong>{isSelected ? "x" : "+"}</strong>
                    </button>
                  );
                })}
              </div>

              <label className="builder-group-search">
                Search exercises
                <input
                  onChange={(event) => updateGroupSearch(muscle, event.target.value)}
                  placeholder={`Search ${muscle} exercises...`}
                  value={searchValue}
                />
              </label>

              {searchResults.length > 0 ? (
                <div className="search-results builder-search-results">
                  {searchResults.map((result) => {
                    const isSelected = selectedNames.has(toExerciseKey(result));
                    return (
                      <button
                        disabled={!isSelected && hasReachedTarget}
                        key={result}
                        onClick={() => toggleGroupExercise(muscle, result)}
                        type="button"
                      >
                        {isSelected ? "Remove " : "Add "}
                        {result}
                      </button>
                    );
                  })}
                </div>
              ) : searchValue.trim() ? (
                <button
                  className="primary-action compact builder-custom-request-action"
                  disabled={hasReachedTarget}
                  onClick={() => toggleGroupExercise(muscle, searchValue, true)}
                  type="button"
                >
                  Request YouTube link + choose this
                </button>
              ) : null}

              <div className="builder-confirmed-panel">
                <div className="builder-confirmed-head">
                  <strong>Confirmed exercises</strong>
                  <span>
                    {selectedExercises.length}/{targetCount}
                  </span>
                </div>
                {selectedExercises.length > 0 ? (
                  <div className="builder-confirmed-list">
                    {selectedExercises.map((exercise) => (
                      <div className="builder-confirmed-item" key={exercise.id || exercise.index}>
                        <button onClick={() => clearBuilderExercise(exercise.index)} type="button">
                          x
                        </button>
                        <span>{exercise.exercise_name}</span>
                        <button
                          className="text-link"
                          onClick={() => showDemo(exercise.exercise_name)}
                          type="button"
                        >
                          Demo
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="compact-help">Choose {targetCount} exercises for {muscle}.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  function renderSwapPanel(exercise) {
    const muscleOptions = exerciseLibrary[exercise?.muscle_group] || [];
    const hasSearch = swapSearch.trim().length >= 2;
    const searchOptions = hasSearch
      ? uniqueNames([
          ...swapCatalogResults,
          ...swapExerciseDbResults,
          ...getLocalExerciseNames().filter((name) => name.toLowerCase().includes(swapSearch.toLowerCase())),
          ...customExerciseList.filter((name) => name.toLowerCase().includes(swapSearch.toLowerCase()))
        ]).slice(0, CATALOG_SEARCH_LIMIT)
      : muscleOptions.slice(0, 8);

    return (
      <div className="swap-panel" role="dialog" aria-modal="false">
        <div className="swap-panel-head">
          <div>
            <p className="eyebrow">Swap exercise</p>
            <h2>{exercise?.exercise_name}</h2>
          </div>
          <button className="primary-action compact" onClick={() => setSwapTargetIndex(null)} type="button">
            Close
          </button>
        </div>

        <label>
          Search replacement
          <input
            onChange={(event) => setSwapSearch(event.target.value)}
            placeholder={`Search ${exercise?.muscle_group || "strength"} exercises...`}
            value={swapSearch}
          />
        </label>

        <div className="swap-options">
          {searchOptions
            .filter((name) => name !== exercise?.exercise_name)
            .map((name) => (
              <button key={name} onClick={() => chooseSwapExercise(name)} type="button">
                {name}
              </button>
            ))}
        </div>

        {swapSearch && searchOptions.length === 0 ? (
          <button className="primary-action compact" onClick={() => chooseSwapExercise(swapSearch)} type="button">
            Use "{swapSearch}"
          </button>
        ) : null}
      </div>
    );
  }

  if (mode === "hiit-session" && activeWorkout && hiitInterval) {
    const exercises = activeWorkout.workout_template_exercises || [];
    const currentExercise = exercises[hiitInterval.exerciseIndex] || exercises[0];
    const totalExercises = exercises.length || 1;
    const totalRounds = Math.max(1, Number(activeWorkout.hiit_rounds) || 1);
    const isTabataWorkout = activeWorkout.hiit_timer_type === "tabata";
    const phaseTotal =
      hiitInterval.phase === "station-rest"
        ? Math.max(1, Number(activeWorkout.hiit_station_rest_seconds) || 60)
        : hiitInterval.phase === "rest"
        ? Math.max(1, Number(activeWorkout.hiit_rest_seconds) || 10)
        : hiitInterval.phase === "countdown"
          ? Math.max(1, Number(activeWorkout.hiit_countdown_seconds) || 3)
          : Math.max(1, Number(activeWorkout.hiit_work_seconds) || 30);
    const progress = Math.max(0, Math.min(100, (hiitInterval.remaining / phaseTotal) * 100));
    const isRest = hiitInterval.phase === "rest" || hiitInterval.phase === "station-rest";
    const isComplete = hiitInterval.phase === "complete";

    return (
      <>
        <section className="screen-stack workout-library hiit-session-screen">
          <div className="screen-heading library-heading">
            <div>
              <p className="eyebrow">{isTabataWorkout ? "HIIT tabata" : "HIIT interval"}</p>
              <h1>{activeWorkout.name}</h1>
              <p>
                Exercise {Math.min(hiitInterval.exerciseIndex + 1, totalExercises)}/{totalExercises} -{" "}
                {isTabataWorkout ? "Effort" : "Round"}{" "}
                {hiitInterval.round}/{totalRounds}
              </p>
            </div>
          </div>

          {renderRecoveryBanner()}

          {message ? <p className="form-message error">{message}</p> : null}

          <div className={isRest ? "hiit-timer-card rest" : "hiit-timer-card work"}>
            <p className="eyebrow">{isComplete ? "Complete" : formatHiitPhase(hiitInterval.phase)}</p>
            <div className="hiit-timer-ring" style={{ "--timer-progress": `${progress}%` }}>
              <strong>{isComplete ? "Done" : formatClock(hiitInterval.remaining)}</strong>
              <span>{isRest ? formatHiitPhase(hiitInterval.phase) : hiitInterval.phase === "countdown" ? "countdown" : "work"}</span>
            </div>
            {currentExercise ? (
              <div className="hiit-current-station">
                <div>
                  <h2>{currentExercise.exercise_name}</h2>
                  <p>Target: {formatExerciseTarget(currentExercise, "hiit")}</p>
                </div>
                <button className="primary-action compact demo-action" onClick={() => showDemo(currentExercise.exercise_name)} type="button">
                  Demo
                </button>
              </div>
            ) : null}
          </div>

          <div className="hiit-station-list">
            {exercises.map((exercise, index) => {
              const isActive = index === hiitInterval.exerciseIndex && !isComplete;
              return (
                <article className={isActive ? "hiit-station active" : "hiit-station"} key={exercise.id || index}>
                  <div>
                    <strong>{exercise.exercise_name}</strong>
                    <span>Target: {formatExerciseTarget(exercise, "hiit")}</span>
                  </div>
                  <button className="primary-action compact demo-action" onClick={() => showDemo(exercise.exercise_name)} type="button">
                    Demo
                  </button>
                </article>
              );
            })}
          </div>

          <div className="hiit-session-actions">
            {isComplete ? (
              <button
                className="primary-action filled"
                onClick={() => {
                  setActiveWorkout(null);
                  setHiitInterval(null);
                  setMode("list");
                }}
                type="button"
              >
                Done
              </button>
            ) : (
              <>
                <button className="primary-action filled" onClick={toggleHiitTimer} type="button">
                  {hiitInterval.running ? "Pause" : "Resume"}
                </button>
                <button className="primary-action" onClick={skipHiitPhase} type="button">
                  Next
                </button>
                <button className="primary-action" onClick={finishHiitIntervalSession} type="button">
                  Finish
                </button>
                <button className="primary-action danger" onClick={cancelActiveSession} type="button">
                  End without saving
                </button>
              </>
            )}
          </div>
        </section>
        {renderDemoModal()}
      </>
    );
  }

  if (mode === "hiit-for-time" && activeWorkout && hiitForTime) {
    const exercises = activeWorkout.workout_template_exercises || [];
    const exerciseCount = exercises.length || 1;
    const totalRounds = Math.max(1, Number(activeWorkout.hiit_rounds) || 1);
    const totalStations = exerciseCount * totalRounds;
    const completedCount = hiitForTime.completedStations.length;
    const currentStationIndex = Math.min(completedCount, Math.max(totalStations - 1, 0));
    const currentExerciseIndex = exerciseCount ? currentStationIndex % exerciseCount : 0;
    const currentRound = Math.floor(currentStationIndex / exerciseCount) + 1;
    const currentExercise = exercises[currentExerciseIndex] || exercises[0];
    const remainingStations = Math.max(totalStations - completedCount, 0);
    const goalSeconds = Math.max(1, Number(activeWorkout.hiit_goal_seconds) || 1);
    const timeLeft = goalSeconds - hiitForTime.elapsedSeconds;
    const averageNeeded = remainingStations > 0 ? Math.max(0, Math.ceil(timeLeft / remainingStations)) : 0;
    const isPastGoal = timeLeft < 0;
    const isComplete = Boolean(hiitForTime.complete);
    const isCountdown = hiitForTime.phase === "countdown";
    const isReady = hiitForTime.phase === "ready";
    const canCompleteStation = hiitForTime.phase === "active" && !isComplete;
    const currentPreviousSplit = currentExercise?.previousSplit;

    return (
      <>
        <section className="screen-stack workout-library hiit-session-screen for-time-session-screen">
          <div className="screen-heading library-heading">
            <div>
              <p className="eyebrow">HIIT for time</p>
              <div className="for-time-title-row">
                <h1>{activeWorkout.name}</h1>
              </div>
              <p>
                Round {Math.min(currentRound, totalRounds)}/{totalRounds} - Station {Math.min(currentStationIndex + 1, totalStations)}/{totalStations} - Goal{" "}
                {formatClock(goalSeconds)}
              </p>
            </div>
          </div>

          {renderRecoveryBanner()}

          {message ? <p className="form-message error">{message}</p> : null}

          <div className="for-time-stat-grid">
            <div className="for-time-stat primary">
              <span>{isCountdown ? "Starting in" : "Elapsed"}</span>
              <strong>{isCountdown ? hiitForTime.countdownRemaining : formatClock(hiitForTime.elapsedSeconds)}</strong>
            </div>
            <div className="for-time-stat current">
              <span>Current</span>
              <strong>{formatClock(hiitForTime.stationElapsedSeconds)}</strong>
            </div>
            <div className={isPastGoal ? "for-time-stat danger" : "for-time-stat"}>
              <span>{isPastGoal ? "Over goal" : "Goal left"}</span>
              <strong>{formatClock(Math.abs(timeLeft))}</strong>
            </div>
            <div className={isPastGoal ? "for-time-stat average danger" : "for-time-stat average"}>
              <span>Avg needed</span>
              <strong>{remainingStations ? formatClock(averageNeeded) : "0:00"}</strong>
            </div>
          </div>

          {!isComplete ? (
            <div className="for-time-top-actions">
              <>
                <button className="primary-action" onClick={toggleForTimeTimer} type="button">
                  {hiitForTime.running
                    ? "Pause"
                    : isReady
                      ? "Start"
                      : "Resume"}
                </button>
                <button className="primary-action" onClick={() => finishForTimeSession()} type="button">
                  Finish
                </button>
              </>
            </div>
          ) : null}

          {currentExercise ? (
            <div className="for-time-current-card">
              <div>
                <p className="eyebrow">{isCountdown ? "Get ready" : "Current station"}</p>
                <h2>{currentExercise.exercise_name}</h2>
                <p>Target: {formatExerciseTarget(currentExercise, "hiit")}</p>
                {currentPreviousSplit ? (
                  <div className="for-time-previous">
                    <span>Previous split</span>
                    <strong>{formatClock(currentPreviousSplit.durationSeconds)}</strong>
                    {currentPreviousSplit.completedAtSeconds ? (
                      <em>at {formatClock(currentPreviousSplit.completedAtSeconds)}</em>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button className="primary-action compact demo-action" onClick={() => showDemo(currentExercise.exercise_name)} type="button">
                Demo
              </button>
            </div>
          ) : null}

          <div className="for-time-split-hero">
            {isComplete ? (
              <button
                className="primary-action filled station-split-action"
                onClick={() => {
                  setActiveWorkout(null);
                  setHiitForTime(null);
                  setMode("list");
                }}
                type="button"
              >
                Done
              </button>
            ) : (
              <button
                className="primary-action filled station-split-action"
                disabled={!canCompleteStation}
                onClick={completeForTimeStation}
                type="button"
              >
                Station split
              </button>
            )}
          </div>

          {hiitForTime.completedStations.length > 0 ? (
            <div className="for-time-split-list" aria-label="Completed station splits">
              {hiitForTime.completedStations.map((station, index) => {
                const previousSplit = exercises[station.exerciseIndex]?.previousSplit;
                return (
                  <article className="for-time-split" key={`${station.exerciseIndex}-${station.completedAtSeconds}`}>
                    <div>
                      <span>{station.round ? `Round ${station.round} - ` : ""}Split {index + 1}</span>
                      <strong>{station.exerciseName}</strong>
                      {previousSplit ? (
                        <em>{formatSplitDelta(station.durationSeconds, previousSplit.durationSeconds)}</em>
                      ) : null}
                    </div>
                    <strong>{formatClock(station.durationSeconds)}</strong>
                  </article>
                );
              })}
            </div>
          ) : null}

          <div className="hiit-session-actions">
            {!isComplete ? (
                <button className="primary-action danger" onClick={cancelActiveSession} type="button">
                  End without saving
                </button>
            ) : null}
          </div>
        </section>
        {renderDemoModal()}
      </>
    );
  }

  if (mode === "session" && activeWorkout) {
    return (
      <>
        <section className="screen-stack workout-library">
          <div className="screen-heading library-heading">
            <div>
              <p className="eyebrow">Active session</p>
              <h1>{activeWorkout.name}</h1>
              <p>Add or remove sets as the real workout changes.</p>
            </div>
            <button className="primary-action compact" onClick={addExerciseToActiveSession} type="button">
              Add Exercise
            </button>
          </div>

          {renderRecoveryBanner()}

        {message ? <p className="form-message error">{message}</p> : null}

        <div className="workout-card-list">
          {activeWorkout.workout_template_exercises.map((exercise, exerciseIndex) => {
            const previousSets = getPreviousSetChips(exercise);
            const isMenuOpen = openSessionMenu === exerciseIndex;

            return (
              <article
                className={exercise.skipped ? "workout-card active-exercise-card skipped" : "workout-card active-exercise-card"}
                key={exercise.id || exerciseIndex}
                ref={(element) => {
                  sessionInputRefs.current[`exercise-${exerciseIndex}`] = element;
                }}
              >
                <div className="active-exercise-head">
                  <div>
                    <p className="eyebrow">{exercise.muscle_group || "Strength"}</p>
                    <h2>{exercise.exercise_name}</h2>
                    <p>
                      Target: {exercise.sets || 0} sets
                      {exercise.rep_min || exercise.rep_max
                        ? ` x ${exercise.rep_min || "?"}-${exercise.rep_max || "?"} reps`
                        : ""}
                    </p>
                  </div>
                  <div className="session-menu-wrap">
                    <button
                      aria-expanded={isMenuOpen}
                      aria-label={`More options for ${exercise.exercise_name}`}
                      className="icon-action session-menu-button"
                      onClick={() => setOpenSessionMenu(isMenuOpen ? null : exerciseIndex)}
                      type="button"
                    >
                      ...
                    </button>
                    {isMenuOpen ? (
                      <div className="session-menu" role="menu">
                        <button onClick={() => showDemo(exercise.exercise_name)} type="button">
                          Demo
                        </button>
                        <button onClick={() => openSwapExercise(exerciseIndex)} type="button">
                          Swap exercise
                        </button>
                        <button className="danger-text" onClick={() => skipSessionExercise(exerciseIndex)} type="button">
                          Skip exercise
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {swapTargetIndex === exerciseIndex ? renderSwapPanel(exercise) : null}

                <div className="previous-sets">
                  <span>Last</span>
                  <div>
                    {previousSets.length ? (
                      previousSets.map((set) => <strong key={set}>{set}</strong>)
                    ) : (
                      <em>No history yet</em>
                    )}
                  </div>
                </div>

                {exercise.skipped ? <p className="form-message error">Skipped for this session.</p> : null}

                <div className="session-set-table">
                  <div className="session-set-row session-set-head">
                    <span>Set</span>
                    <span>Kg</span>
                    <span>Reps</span>
                    <span>Done</span>
                    <span>Remove</span>
                  </div>
                  {exercise.sessionRows.map((row, rowIndex) => (
                    <div className="session-set-row" key={`${exerciseIndex}-${row.setNumber}`}>
                      <strong>{row.setNumber}</strong>
                      <input
                        className={
                          activeNumberInput?.exerciseIndex === exerciseIndex &&
                          activeNumberInput?.rowIndex === rowIndex &&
                          activeNumberInput?.field === "kg"
                            ? "active-number-input"
                            : ""
                        }
                        inputMode="none"
                        onChange={(event) =>
                          updateSessionRow(exerciseIndex, rowIndex, "kg", event.target.value)
                        }
                        onFocus={() => setActiveNumberInput({ exerciseIndex, rowIndex, field: "kg", replaceOnInput: true })}
                        onPointerDown={(event) => activateSessionNumberInput(event, exerciseIndex, rowIndex, "kg")}
                        readOnly
                        ref={(element) => {
                          sessionInputRefs.current[`${exerciseIndex}-${rowIndex}-kg`] = element;
                        }}
                        type="text"
                        value={row.kg}
                      />
                      <input
                        className={
                          activeNumberInput?.exerciseIndex === exerciseIndex &&
                          activeNumberInput?.rowIndex === rowIndex &&
                          activeNumberInput?.field === "reps"
                            ? "active-number-input"
                            : ""
                        }
                        inputMode="none"
                        onChange={(event) =>
                          updateSessionRow(exerciseIndex, rowIndex, "reps", event.target.value)
                        }
                        onFocus={() => setActiveNumberInput({ exerciseIndex, rowIndex, field: "reps", replaceOnInput: true })}
                        onPointerDown={(event) => activateSessionNumberInput(event, exerciseIndex, rowIndex, "reps")}
                        readOnly
                        ref={(element) => {
                          sessionInputRefs.current[`${exerciseIndex}-${rowIndex}-reps`] = element;
                        }}
                        type="text"
                        value={row.reps}
                      />
                      <button
                        className={row.done ? "set-toggle done" : "set-toggle"}
                        onClick={() =>
                          row.done
                            ? updateSessionRow(exerciseIndex, rowIndex, "done", false)
                            : markSessionSetDone(exerciseIndex, rowIndex)
                        }
                        type="button"
                      >
                        {row.done ? "✓" : "Done"}
                      </button>
                      <button
                        className="danger-link"
                        onClick={() => removeSessionSet(exerciseIndex, rowIndex)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  className="primary-action compact"
                  onClick={() => addSessionSet(exerciseIndex)}
                  type="button"
                >
                  Add Set
                </button>
              </article>
            );
          })}
        </div>

        <div className="session-end-actions">
          <button className="primary-action" disabled={saving} onClick={finishActiveSession} type="button">
            {saving ? "Saving..." : "Finish Workout"}
          </button>
          <button className="primary-action danger" disabled={saving} onClick={cancelActiveSession} type="button">
            End Without Saving
          </button>
        </div>

        {activeNumberInput ? (
          <div className="mobile-number-pad" aria-label="Workout number keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "delete"].map((key) => (
              <button
                className={key === "delete" ? "keypad-delete" : `keypad-key key-${key === "." ? "decimal" : key}`}
                key={key}
                onClick={() => handleKeypadClick(key)}
                onPointerDown={(event) => handleKeypadPointer(event, key)}
                type="button"
              >
                {key === "delete" ? "⌫" : key}
              </button>
            ))}
            <button className="keypad-hide" onClick={() => handleKeypadClick("hide")} onPointerDown={(event) => handleKeypadPointer(event, "hide")} type="button">
              ˅
            </button>
            <button className="keypad-next" onClick={() => handleKeypadClick("next")} onPointerDown={(event) => handleKeypadPointer(event, "next")} type="button">
              Next
            </button>
          </div>
        ) : null}
        </section>
        {renderDemoModal()}
      </>
    );
  }

  if (mode === "complete" && completedSession) {
    const minutes = Math.floor(completedSession.durationSeconds / 60);
    const seconds = completedSession.durationSeconds % 60;
    const isForTimeSession = completedSession.sessionType === "for_time";
    const achievementMoments = completedSession.achievementMoments || [];

    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout complete</p>
          <h1>{completedSession.name}</h1>
          <p>Review the session, rate it, and save your notes.</p>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}

        <div className="workout-card completion-card">
          <div className="completion-summary">
            <div>
              <span>Duration</span>
              <strong>{minutes ? `${minutes}m ${seconds}s` : `${seconds}s`}</strong>
            </div>
            <div>
              <span>Exercises</span>
              <strong>{completedSession.totalExercises}</strong>
            </div>
            <div>
              <span>{isForTimeSession ? "Splits" : "Sets done"}</span>
              <strong>{completedSession.completedSets}</strong>
            </div>
            <div>
              <span>{isForTimeSession ? "PB status" : "Volume"}</span>
              <strong>
                {isForTimeSession
                  ? completedSession.pbLabel
                  : `${Math.round(completedSession.totalVolumeKg).toLocaleString()}kg`}
              </strong>
            </div>
          </div>

          {achievementMoments.length ? (
            <div className="completion-achievements">
              <div>
                <p className="eyebrow">Achievement moments</p>
                <h2>{achievementMoments[0].title}</h2>
                <span>{achievementMoments[0].label} - {achievementMoments[0].detail}</span>
              </div>
              {achievementMoments.slice(1, 4).map((moment) => (
                <article key={moment.id}>
                  <strong>{moment.label}</strong>
                  <span>{moment.title}</span>
                </article>
              ))}
            </div>
          ) : null}

          {isForTimeSession && completedSession.splits?.length ? (
            <div className="completion-split-list">
              {completedSession.splits.map((split, index) => (
                <div key={`${split.exerciseIndex}-${split.completedAtSeconds}`}>
                  <span>{index + 1}</span>
                  <strong>{split.exerciseName}</strong>
                  <em>{formatClock(split.durationSeconds)}</em>
                </div>
              ))}
            </div>
          ) : null}

          <div className="session-rating">
            <h2>Rate this session</h2>
            <div>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  className={sessionFeedback.rating >= rating ? "star-button active" : "star-button"}
                  key={rating}
                  onClick={() => setSessionFeedback((current) => ({ ...current, rating }))}
                  type="button"
                >
                  *
                </button>
              ))}
            </div>
          </div>

          <label className="completion-notes">
            Notes
            <textarea
              onChange={(event) =>
                setSessionFeedback((current) => ({ ...current, comment: event.target.value }))
              }
              placeholder="Any notes? (optional)"
              value={sessionFeedback.comment}
            />
          </label>
        </div>

        <button className="primary-action filled" disabled={saving} onClick={saveSessionFeedback} type="button">
          {saving ? "Saving..." : "Save & Finish"}
        </button>
      </section>
    );
  }

  if (mode === "share" && completedSession) {
    const duration = formatShortDuration(completedSession.durationSeconds);
    const sessionDate = new Date(completedSession.completedAt).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
    const isForTimeSession = completedSession.sessionType === "for_time";
    const shareMoment = isForTimeSession
      ? primaryAchievementMoment(completedSession)
      : primaryStrengthShareMoment(completedSession);

    return (
      <section className="screen-stack workout-library share-workout-screen">
        <div className="screen-heading library-heading">
          <div>
            <h1>
              Share your <span>workout</span>
            </h1>
            <p>Download a clear or branded template. Photos stay on this device.</p>
          </div>
        </div>

        <div className="share-mode-toggle">
          <button
            className={shareMode === "transparent" ? "active" : ""}
            onClick={() => setShareMode("transparent")}
            type="button"
          >
            <strong>Transparent</strong>
            <span>Clear photo</span>
          </button>
          <button
            className={shareMode === "branded" ? "active" : ""}
            onClick={() => setShareMode("branded")}
            type="button"
          >
            <strong>Movementz Branded</strong>
            <span>Dark overlay</span>
          </button>
        </div>

        <div className="share-preview-shell">
          <div
            className={shareMode === "branded" ? "share-preview branded" : "share-preview transparent"}
            style={sharePhoto ? { backgroundImage: `url(${sharePhoto})` } : undefined}
          >
            <div className={isForTimeSession ? "share-preview-overlay for-time-share" : "share-preview-overlay"}>
              {isForTimeSession ? (
                <>
                  <p className="share-complete">Workout Complete</p>
                  <h2>{completedSession.name}</h2>
                  <div className="share-title-meta">
                    <span>{sessionDate}</span>
                    <strong>{completedSession.totalExercises} exercises</strong>
                  </div>
                  <div
                    className={
                      (completedSession.splits || []).length > 10
                        ? "share-split-list share-split-list-dense"
                        : "share-split-list"
                    }
                  >
                    {(completedSession.splits || []).map((split, index) => (
                      <span key={`${split.exerciseIndex}-${split.completedAtSeconds}`}>
                        <strong>
                          {index + 1}. {split.exerciseName}
                        </strong>
                        <em>{formatClock(split.durationSeconds)}</em>
                      </span>
                    ))}
                  </div>
                  <div className="share-bottom-stats">
                    <span>
                      <small>Time</small>
                      <strong>{duration}</strong>
                    </span>
                    <span>
                      <small>{shareMoment.label}</small>
                      <strong>{shareMoment.title}</strong>
                    </span>
                  </div>
                  <div className="share-footer">
                    <img className="share-footer-icon" src={movementzIconSrc} alt="Movementz" />
                    <span>Move - Train - Grow</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="share-complete">Workout Complete</p>
                  <h2>{completedSession.name}</h2>
                  <div className="standard-share-summary">
                    <span>
                      <small>Volume</small>
                      <strong>{Math.round(completedSession.totalVolumeKg).toLocaleString()}kg</strong>
                    </span>
                    <span>
                      <small>Duration</small>
                      <strong>{duration}</strong>
                    </span>
                    <span className="standard-share-highlight">
                      <small>Best lift</small>
                      <strong>{shareMoment.title}</strong>
                    </span>
                    <span>
                      <small>Weight</small>
                      <strong>{shareMoment.detail}</strong>
                    </span>
                  </div>
                  <div className="share-footer">
                    <img className="share-footer-icon" src={movementzIconSrc} alt="Movementz" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <label className="photo-upload-action">
          <input accept="image/*" onChange={handleSharePhoto} type="file" />
          Add local photo background
        </label>

        <button className="primary-action filled" onClick={saveShareImage} type="button">
          Download Image
        </button>

        <button className="primary-action" onClick={finishShareFlow} type="button">
          Done
        </button>
      </section>
    );
  }

  if (mode === "history" && selectedSession) {
    const completedDate = new Date(selectedSession.completed_at).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
    const completedTime = new Date(selectedSession.completed_at).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
    const isHiitSession = selectedSession.workout_type === "hiit";
    const splitExercises = (selectedSession.session_log_exercises || []).filter(
      (exercise) => exercise.split_duration_seconds !== null && exercise.split_duration_seconds !== undefined
    );

    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Session history</p>
            <h1>{selectedSession.name}</h1>
            <p>
              {completedDate} at {completedTime}
            </p>
          </div>
          <button
            className="primary-action"
            onClick={() => {
              setSelectedSession(null);
              setMode("list");
            }}
            type="button"
          >
            Back
          </button>
        </div>

        {message ? <p className="form-message error">{message}</p> : null}

        <div className="workout-card completion-card">
          <div className="completion-summary">
            <div>
              <span>Duration</span>
              <strong>{formatDuration(selectedSession.duration_seconds || 0)}</strong>
            </div>
            <div>
              <span>Exercises</span>
              <strong>{selectedSession.total_exercises || 0}</strong>
            </div>
            <div>
              <span>{isHiitSession ? "Splits" : "Sets done"}</span>
              <strong>{selectedSession.completed_sets || 0}</strong>
            </div>
            <div>
              <span>{isHiitSession ? "Result" : "Volume"}</span>
              <strong>
                {isHiitSession
                  ? splitExercises.length
                    ? "For Time"
                    : "HIIT"
                  : `${Math.round(selectedSession.total_volume_kg || 0).toLocaleString()}kg`}
              </strong>
            </div>
          </div>

          <div className="session-feedback-summary">
            <span>{selectedSession.rating ? `${selectedSession.rating}/5 rating` : "No rating"}</span>
            {selectedSession.comment ? <p>{selectedSession.comment}</p> : null}
          </div>
        </div>

        <div className="session-detail-list">
          {(selectedSession.session_log_exercises || []).map((exercise) => {
            const completedSets = (exercise.session_log_sets || []).filter((set) => set.completed);
            const hasSplit = exercise.split_duration_seconds !== null && exercise.split_duration_seconds !== undefined;

            return (
              <article
                className={exercise.skipped ? "workout-card session-detail-card skipped" : "workout-card session-detail-card"}
                key={exercise.id}
              >
                <div className="workout-card-head">
                  <div>
                    <p className="eyebrow">{exercise.muscle_group || "Strength"}</p>
                    <h2>{exercise.exercise_name}</h2>
                    <p>Target: {hasSplit ? formatExerciseTarget(exercise, "hiit") : formatExerciseTarget(exercise)}</p>
                  </div>
                  {exercise.substituted ? <span className="status-pill">Swapped</span> : null}
                  {exercise.skipped ? <span className="status-pill danger-pill">Skipped</span> : null}
                </div>

                {exercise.original_exercise_name && exercise.original_exercise_name !== exercise.exercise_name ? (
                  <p className="compact-help">Original: {exercise.original_exercise_name}</p>
                ) : null}

                {hasSplit ? (
                  <div className="logged-set-list split-stat-list">
                    <div>
                      <span>Split</span>
                      <strong>{formatClock(exercise.split_duration_seconds)}</strong>
                    </div>
                    {exercise.completed_at_seconds !== null && exercise.completed_at_seconds !== undefined ? (
                      <div>
                        <span>Elapsed</span>
                        <strong>{formatClock(exercise.completed_at_seconds)}</strong>
                      </div>
                    ) : null}
                  </div>
                ) : completedSets.length ? (
                  <div className="logged-set-list">
                    {completedSets.map((set) => (
                      <div key={set.id || set.set_number}>
                        <span>Set {set.set_number}</span>
                        <strong>
                          {set.kg ?? "-"}kg x {set.reps ?? "-"}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="compact-help">No completed sets recorded.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  if (mode === "quick-log") {
    return (
      <section className="screen-stack workout-library quick-log-screen">
        <div className="screen-heading library-heading">
          <div>
            <p className="eyebrow">Log one-off workout</p>
            <h1>Quick workout</h1>
            <p>For off-plan sessions that still need to count in your stats.</p>
          </div>
          <button className="primary-action compact" onClick={discardRecoveredWorkout} type="button">
            Cancel
          </button>
        </div>

        {renderRecoveryBanner("Quick workout draft")}

        {message ? <p className={message.includes("logged") ? "form-message success" : "form-message error"}>{message}</p> : null}

        <form className="quick-log-form" onSubmit={saveQuickWorkout}>
          <section className="panel quick-log-panel">
            <p className="eyebrow">Name of session</p>
            <input
              onChange={(event) => updateQuickField("name", event.target.value)}
              placeholder="e.g. Lunch run, Push session, Garage cardio"
              value={quickLogForm.name}
            />
            <p className="eyebrow">Session type</p>
            <div className="quick-type-grid">
              {quickWorkoutTypes.map((type) => (
                <button
                  className={quickLogForm.types.includes(type.value) ? "active" : ""}
                  key={type.value}
                  onClick={() => toggleQuickType(type.value)}
                  type="button"
                >
                  {type.label}
                </button>
              ))}
            </div>
          </section>

          {quickLogForm.types.includes("strength") ? (
            <section className="panel quick-log-panel">
              <p className="eyebrow">Strength</p>
              {quickLogForm.strengthExercises.map((exercise, index) => (
                <div className="quick-repeat-block" key={`strength-${index}`}>
                  <strong>Exercise {index + 1}</strong>
                  <input
                    onChange={(event) => updateQuickStrength(index, "exercise_name", event.target.value)}
                    placeholder="Exercise name"
                    value={exercise.exercise_name}
                  />
                  <div className="form-grid two">
                    <input
                      inputMode="decimal"
                      onChange={(event) => updateQuickStrength(index, "kg", event.target.value)}
                      placeholder="Weight kg"
                      value={exercise.kg}
                    />
                    <input
                      inputMode="numeric"
                      onChange={(event) => updateQuickStrength(index, "reps", event.target.value)}
                      placeholder="Reps"
                      value={exercise.reps}
                    />
                  </div>
                </div>
              ))}
              <button
                className="primary-action compact"
                onClick={() => setQuickLogForm((current) => ({
                  ...current,
                  strengthExercises: [...current.strengthExercises, createQuickStrengthExercise()]
                }))}
                type="button"
              >
                + Add exercise
              </button>
            </section>
          ) : null}

          {quickLogForm.types.includes("run") ? (
            <section className="panel quick-log-panel">
              <p className="eyebrow">Run</p>
              <label>
                Type
                <select value={quickLogForm.run.runType} onChange={(event) => updateQuickNested("run", "runType", event.target.value)}>
                  {runTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <div className="form-grid three">
                <input inputMode="decimal" onChange={(event) => updateQuickNested("run", "km", event.target.value)} placeholder="Km" value={quickLogForm.run.km} />
                <input onChange={(event) => updateQuickNested("run", "pace", event.target.value)} placeholder="Pace" value={quickLogForm.run.pace} />
                <input onChange={(event) => updateQuickNested("run", "zone", event.target.value)} placeholder="Zone" value={quickLogForm.run.zone} />
              </div>
              <div className="form-grid three">
                <input inputMode="numeric" onChange={(event) => updateQuickNested("run", "laps", event.target.value)} placeholder="Laps" value={quickLogForm.run.laps} />
                <input inputMode="decimal" onChange={(event) => updateQuickNested("run", "lapDistance", event.target.value)} placeholder="Lap distance" value={quickLogForm.run.lapDistance} />
                <input inputMode="decimal" onChange={(event) => updateQuickNested("run", "duration", event.target.value)} placeholder="Duration min" value={quickLogForm.run.duration} />
              </div>
            </section>
          ) : null}

          {quickLogForm.types.includes("cardio") ? (
            <section className="panel quick-log-panel">
              <p className="eyebrow">Cardio</p>
              {quickLogForm.cardioMachines.map((machine, index) => (
                <div className="quick-repeat-block" key={`cardio-${index}`}>
                  <strong>Cardio machine {index + 1}</strong>
                  <input
                    onChange={(event) => updateQuickCardio(index, "machine", event.target.value)}
                    placeholder="Machine or cardio type"
                    value={machine.machine}
                  />
                  <div className="form-grid three">
                    <input inputMode="numeric" onChange={(event) => updateQuickCardio(index, "calories", event.target.value)} placeholder="Cal" value={machine.calories} />
                    <input inputMode="numeric" onChange={(event) => updateQuickCardio(index, "meters", event.target.value)} placeholder="Meters" value={machine.meters} />
                    <input inputMode="numeric" onChange={(event) => updateQuickCardio(index, "reps", event.target.value)} placeholder="Reps" value={machine.reps} />
                  </div>
                </div>
              ))}
              <button
                className="primary-action compact"
                onClick={() => setQuickLogForm((current) => ({
                  ...current,
                  cardioMachines: [...current.cardioMachines, createQuickCardioMachine()]
                }))}
                type="button"
              >
                + Add cardio machine
              </button>
            </section>
          ) : null}

          {quickLogForm.types.includes("other") ? (
            <section className="panel quick-log-panel">
              <p className="eyebrow other">Other</p>
              <textarea
                onChange={(event) => updateQuickNested("other", "notes", event.target.value)}
                placeholder="Write what you did..."
                value={quickLogForm.other.notes}
              />
              <div className="form-grid four">
                <input inputMode="decimal" onChange={(event) => updateQuickNested("other", "duration", event.target.value)} placeholder="Duration min" value={quickLogForm.other.duration} />
                <input inputMode="numeric" onChange={(event) => updateQuickNested("other", "reps", event.target.value)} placeholder="Reps" value={quickLogForm.other.reps} />
                <input inputMode="numeric" onChange={(event) => updateQuickNested("other", "meters", event.target.value)} placeholder="Meters" value={quickLogForm.other.meters} />
                <input inputMode="numeric" onChange={(event) => updateQuickNested("other", "calories", event.target.value)} placeholder="Cal" value={quickLogForm.other.calories} />
              </div>
            </section>
          ) : null}

          <section className="panel quick-log-panel">
            <p className="eyebrow">Overall duration</p>
            <input
              inputMode="decimal"
              onChange={(event) => updateQuickField("overallDuration", event.target.value)}
              placeholder="Duration in minutes"
              value={quickLogForm.overallDuration}
            />
          </section>

          <button className="primary-action filled" disabled={saving} type="submit">
            {saving ? "Logging..." : "Log Workout"}
          </button>
        </form>
      </section>
    );
  }

  if (mode === "setup") {
    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout library</p>
          <h1>Build workout</h1>
          <p>Choose the workout type and setup first, then pick exercises from quick options.</p>
        </div>

        {renderRecoveryBanner("Workout build in progress")}

        <div className="workout-editor panel">
          <div className="library-toolbar">
            <button className="primary-action" onClick={closeBuilder} type="button">
              Close
            </button>
          </div>

          {message ? <p className="form-message error">{message}</p> : null}

          <label>
            Workout name
            <input
              onChange={(event) => setSetup((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Push Day, Chest + Triceps"
              value={setup.name}
            />
          </label>

          <div className="setup-card">
            <p className="eyebrow">Workout type</p>
            <div className="segmented-options">
              <button
                className={setup.workout_type === "strength" ? "segment active" : "segment"}
                onClick={() => setSetup((current) => ({ ...current, workout_type: "strength" }))}
                type="button"
              >
                Workout
              </button>
              <button
                className={setup.workout_type === "hiit" ? "segment active hiit" : "segment"}
                onClick={() => setSetup((current) => ({ ...current, workout_type: "hiit" }))}
                type="button"
              >
                HIIT
              </button>
              <button className="segment muted" disabled type="button">
                Run soon
              </button>
            </div>
          </div>

          <label>
            Notes
            <textarea
              onChange={(event) => setSetup((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Workout notes, focus points, rest guidance, or coaching cues..."
              value={setup.notes}
            />
          </label>

          {setup.workout_type === "hiit" ? (
            <>
              <div className="setup-card hiit-setup-card">
                <div>
                  <p className="eyebrow">HIIT timer</p>
                  <h2>
                    {setup.hiit_timer_type === "for_time"
                      ? "Goal time workout"
                      : setup.hiit_timer_type === "tabata"
                        ? "Tabata stations"
                        : "Interval rounds"}
                  </h2>
                </div>
                <div className="segmented-options">
                  {hiitTimerTypes.map((timerType) => (
                    <button
                      className={setup.hiit_timer_type === timerType.value ? "segment active hiit" : "segment"}
                      key={timerType.value}
                      onClick={() => selectHiitTimerType(timerType.value)}
                      type="button"
                    >
                      {timerType.label}
                    </button>
                  ))}
                </div>

                {setup.hiit_timer_type === "interval" || setup.hiit_timer_type === "tabata" ? (
                  <div className="form-grid four">
                    <label>
                      {setup.hiit_timer_type === "tabata" ? "Efforts" : "Rounds"}
                      <input
                        min="1"
                        onChange={(event) => setSetup((current) => ({ ...current, hiit_rounds: event.target.value }))}
                        type="number"
                        value={setup.hiit_rounds}
                      />
                    </label>
                    <label>
                      Work min
                      <input
                        min="0"
                        onChange={(event) =>
                          setSetup((current) => ({ ...current, hiit_work_minutes: event.target.value }))
                        }
                        type="number"
                        value={setup.hiit_work_minutes}
                      />
                    </label>
                    <label>
                      Work sec
                      <input
                        max="59"
                        min="0"
                        onChange={(event) =>
                          setSetup((current) => ({ ...current, hiit_work_seconds: event.target.value }))
                        }
                        type="number"
                        value={setup.hiit_work_seconds}
                      />
                    </label>
                    <label>
                      Rest min
                      <input
                        min="0"
                        onChange={(event) =>
                          setSetup((current) => ({ ...current, hiit_rest_minutes: event.target.value }))
                        }
                        type="number"
                        value={setup.hiit_rest_minutes}
                      />
                    </label>
                    <label>
                      Rest sec
                      <input
                        max="59"
                        min="0"
                        onChange={(event) =>
                          setSetup((current) => ({ ...current, hiit_rest_seconds: event.target.value }))
                        }
                        type="number"
                        value={setup.hiit_rest_seconds}
                      />
                    </label>
                    <label>
                      {setup.hiit_timer_type === "tabata" ? "Station rest min" : "Countdown"}
                      <input
                        min="0"
                        onChange={(event) =>
                          setup.hiit_timer_type === "tabata"
                            ? setSetup((current) => ({ ...current, hiit_station_rest_minutes: event.target.value }))
                            : setSetup((current) => ({ ...current, hiit_countdown_seconds: event.target.value }))
                        }
                        type="number"
                        value={
                          setup.hiit_timer_type === "tabata"
                            ? setup.hiit_station_rest_minutes
                            : setup.hiit_countdown_seconds
                        }
                      />
                    </label>
                    {setup.hiit_timer_type === "tabata" ? (
                      <label>
                        Countdown
                        <input
                          min="0"
                          onChange={(event) =>
                            setSetup((current) => ({ ...current, hiit_countdown_seconds: event.target.value }))
                          }
                          type="number"
                          value={setup.hiit_countdown_seconds}
                        />
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <div className="form-grid three">
                    <label>
                      Goal min
                      <input
                        min="0"
                        onChange={(event) =>
                          setSetup((current) => ({ ...current, hiit_goal_minutes: event.target.value }))
                        }
                        type="number"
                        value={setup.hiit_goal_minutes}
                      />
                    </label>
                    <label>
                      Goal sec
                      <input
                        max="59"
                        min="0"
                        onChange={(event) =>
                          setSetup((current) => ({ ...current, hiit_goal_seconds: event.target.value }))
                        }
                        type="number"
                        value={setup.hiit_goal_seconds}
                      />
                    </label>
                    <label>
                      Rounds
                      <input
                        min="1"
                        onChange={(event) => setSetup((current) => ({ ...current, hiit_rounds: event.target.value }))}
                        type="number"
                        value={setup.hiit_rounds}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="muscle-picker setup-card">
                <div>
                  <p className="eyebrow">Area focus</p>
                  <h2>Select the focus, then choose total exercises</h2>
                </div>

                <div className="muscle-chip-list">
                  {hiitFocusAreas.map((focusArea) => (
                    <button
                      className={setup.hiit_focus_area === focusArea ? "chip active hiit" : "chip"}
                      key={focusArea}
                      onClick={() => setSetup((current) => ({ ...current, hiit_focus_area: focusArea }))}
                      type="button"
                    >
                      {setup.hiit_focus_area === focusArea ? "+ " : ""}
                      {focusArea}
                    </button>
                  ))}
                </div>

                <div className="muscle-count-row">
                  <strong>Total exercises</strong>
                  <div className="stepper-control">
                    <button onClick={() => updateHiitTotalExercises(-1)} type="button">
                      -
                    </button>
                    <strong>{setup.hiitTotalExercises}</strong>
                    <button onClick={() => updateHiitTotalExercises(1)} type="button">
                      +
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
          <div className="setup-card">
            <div className="section-row">
              <div>
                <p className="eyebrow">Sets</p>
                <h2>Sets per exercise</h2>
              </div>
              <div className="stepper-control">
                <button onClick={() => updateDefaultSets(-1)} type="button">
                  -
                </button>
                <strong>{setup.defaultSets}</strong>
                <button onClick={() => updateDefaultSets(1)} type="button">
                  +
                </button>
              </div>
            </div>
            <p className="compact-help">You can still adjust individual exercises on the next screen.</p>
          </div>

          <div className="muscle-picker setup-card">
            <div>
              <p className="eyebrow">Muscle groups</p>
              <h2>Select muscles, then choose how many exercises</h2>
            </div>

            <div className="muscle-chip-list">
              {muscleGroups.map((muscle) => {
                const count = Number(setup.muscleTargets[muscle]) || 0;
                return (
                  <button
                    className={count > 0 ? "chip active" : "chip"}
                    key={muscle}
                    onClick={() => toggleMuscleTarget(muscle)}
                    type="button"
                  >
                        {count > 0 ? "+ " : ""}
                    {muscle}
                  </button>
                );
              })}
            </div>

            <div className="muscle-count-list">
              {selectedMuscleTargets.length === 0 ? (
                <p className="compact-help">Choose at least one muscle group.</p>
              ) : (
                selectedMuscleTargets.map(([muscle, count]) => (
                  <div className="muscle-count-row" key={muscle}>
                    <strong>{muscle}</strong>
                    <div className="stepper-control">
                      <button onClick={() => updateMuscleTarget(muscle, -1)} type="button">
                        -
                      </button>
                      <strong>{count}</strong>
                      <button onClick={() => updateMuscleTarget(muscle, 1)} type="button">
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="setup-summary-row">
                <span>Total exercises</span>
                <strong>{totalTargetExercises}</strong>
              </div>
            </div>
          </div>
            </>
          )}

          <button className="primary-action filled" onClick={buildExercisesFromSetup} type="button">
            Continue
          </button>
        </div>
      </section>
    );
  }

  if (mode === "editor") {
    return (
      <>
        <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout library</p>
          <h1>Choose exercises</h1>
          <p>Select your movements first. You will set reps, kg and rest on the review screen.</p>
        </div>

        {renderRecoveryBanner("Workout build in progress")}

        <div className="workout-editor panel builder-selection-panel">
          <div className="library-toolbar">
            <button
              className="primary-action"
              onClick={() => (editingId ? discardRecoveredWorkout() : setMode("setup"))}
              type="button"
            >
              Back
            </button>
          </div>

          {message ? <p className="form-message error">{message}</p> : null}

          {form.workout_type === "hiit" ? (
            <div className="setup-card hiit-editor-summary">
              <div>
                <p className="eyebrow">HIIT workout</p>
                <h2>{form.hiit_timer_type === "for_time" ? "For Time" : form.hiit_timer_type === "tabata" ? "Tabata" : "Interval"}</h2>
              </div>
              <div className="hiit-summary-grid">
                <span>Rounds: {form.hiit_rounds || 1}</span>
                <span>Focus: {form.hiit_focus_area || "Full Body"}</span>
                {form.hiit_timer_type === "for_time" ? (
                  <span>Goal: {formatDuration(form.hiit_goal_seconds || 0)}</span>
                ) : (
                  <>
                    <span>Work: {formatDuration(form.hiit_work_seconds || 0)}</span>
                    <span>Rest: {formatDuration(form.hiit_rest_seconds || 0)}</span>
                    {form.hiit_timer_type === "tabata" ? (
                      <span>Station rest: {formatDuration(form.hiit_station_rest_seconds || 0)}</span>
                    ) : null}
                    <span>Countdown: {form.hiit_countdown_seconds || 0}s</span>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <div className="exercise-list">
            <div className="section-row exercise-list-head">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>Select exercises</h2>
                <p>Choose the required number for each muscle group.</p>
              </div>
              <button className="primary-action compact" onClick={addExercise} type="button">
                Add Exercise
              </button>
            </div>

            {form.workout_type === "__legacy_hiit" ? (
              form.exercises.map((exercise, index) => {
              const searchResults = exercise.search
                ? uniqueNames([
                    ...(catalogSearchResults[index] || []),
                    ...(exerciseDbSearchResults[index] || []),
                    ...getLocalExerciseNames().filter((name) =>
                      name.toLowerCase().includes(exercise.search.toLowerCase())
                    ),
                    ...customExerciseList.filter((name) =>
                      name.toLowerCase().includes(exercise.search.toLowerCase())
                    )
                  ]).slice(0, 5)
                : [];
              const isExerciseMenuOpen = openBuilderExerciseMenu === index;
              const isConfirmed = Boolean(exercise.selection_confirmed);
              const isActiveBuilderExercise = activeBuilderExerciseIndex === index && !isConfirmed;

              return (
                <div
                  className={[
                    "exercise-editor",
                    index % 2 === 1 ? "exercise-editor-alt" : "",
                    isActiveBuilderExercise ? "exercise-editor-active" : "",
                    isConfirmed ? "exercise-editor-confirmed" : ""
                  ].filter(Boolean).join(" ")}
                  key={`${index}-${exercise.id || "new"}`}
                  onClick={() => setActiveBuilderExerciseIndex(index)}
                >
                  <div className="exercise-editor-head">
                    <div>
                      <strong>Exercise {index + 1}</strong>
                      <p className="muscle-label">{exercise.muscle_group}</p>
                    </div>
                    <div className="session-menu-wrap">
                      <button
                        aria-expanded={isExerciseMenuOpen}
                        aria-label={`More options for exercise ${index + 1}`}
                        className="icon-action exercise-menu-button"
                        onClick={() => setOpenBuilderExerciseMenu(isExerciseMenuOpen ? null : index)}
                        type="button"
                      >
                        ...
                      </button>
                      {isExerciseMenuOpen ? (
                        <div className="session-menu exercise-action-menu" role="menu">
                          {exercise.exercise_name ? (
                            <button
                              onClick={() => {
                                setOpenBuilderExerciseMenu(null);
                                showDemo(exercise.exercise_name);
                              }}
                              type="button"
                            >
                              Demo
                            </button>
                          ) : null}
                          <button
                            className="danger-text"
                            onClick={() => {
                              setOpenBuilderExerciseMenu(null);
                              removeExercise(index);
                            }}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {exercise.exercise_name ? (
                    <div className="selected-exercise">
                      <span>Selected:</span>
                      <strong>{exercise.exercise_name}</strong>
                      {exercise.is_custom_exercise ? <small>Pending review</small> : null}
                    </div>
                  ) : null}

                  <div className="suggestion-picker">
                    <div className="suggestion-list">
                      {getBuilderSuggestions(exercise, index).map((suggestion) => (
                        <button
                          className={exercise.exercise_name === suggestion ? "suggestion active" : "suggestion"}
                          key={suggestion}
                          onClick={() => chooseExercise(index, suggestion, true)}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                    <div className="mini-actions">
                      <button
                        aria-label={`Refresh ${exercise.muscle_group} suggestions`}
                        className="primary-action compact refresh-action builder-refresh-action"
                        onClick={() => refreshSuggestions(index)}
                        title="Refresh exercises"
                        type="button"
                      >
                        ↻
                      </button>
                    </div>
                  </div>

                  <label className="exercise-search-field">
                    Search or type exercise
                    <input
                      onChange={(event) => updateExercise(index, "search", event.target.value)}
                      placeholder={`Search ${exercise.muscle_group} exercises...`}
                      value={exercise.search}
                    />
                  </label>

                  {searchResults.length > 0 ? (
                    <div className="search-results">
                      {searchResults.map((result) => (
                        <button
                          key={result}
                          onClick={() => chooseExercise(index, result, true)}
                          type="button"
                        >
                          {result}
                        </button>
                      ))}
                    </div>
                  ) : exercise.search.trim() ? (
                    <button
                      className="primary-action compact builder-custom-request-action"
                      onClick={() => chooseExercise(index, exercise.search, true, true)}
                      type="button"
                    >
                      Request YouTube link + choose this
                    </button>
                  ) : null}

                  {!isConfirmed ? (
                    <button
                      className="primary-action filled builder-confirm-action"
                      onClick={() => confirmBuilderExercise(index)}
                      type="button"
                    >
                      Confirm exercise
                    </button>
                  ) : null}
                </div>
              );
              })
            ) : (
              renderGroupedExercisePicker()
            )}
          </div>
          <div className="form-footer-actions">
            <button className="primary-action filled" onClick={goToWorkoutReview} type="button">
              Review workout
            </button>
          </div>
        </div>
        </section>
        {renderDemoModal()}
      </>
    );
  }

  if (mode === "review") {
    const selectedExercises = form.exercises.filter((exercise) => exercise.exercise_name.trim());

    return (
      <>
        <section className="screen-stack workout-library">
          <div className="screen-heading">
            <p className="eyebrow">Workout library</p>
            <h1>Review workout</h1>
            <p>Check the selected exercises, targets and starting numbers before saving.</p>
          </div>

          {renderRecoveryBanner("Workout build in progress")}

          <form className="workout-editor panel builder-review-panel" onSubmit={saveWorkout}>
            <div className="library-toolbar builder-review-toolbar">
              <button className="primary-action" onClick={() => backToExerciseSelection()} type="button">
                Back to exercises
              </button>
              <button className="primary-action compact" onClick={addExercise} type="button">
                Add Exercise
              </button>
            </div>

            {message ? <p className="form-message error">{message}</p> : null}

            <section className="setup-card builder-review-summary">
              <div>
                <p className="eyebrow">{form.workout_type === "hiit" ? "HIIT workout" : "Workout"}</p>
                <h2>{form.name || "Untitled workout"}</h2>
                {form.notes ? <p>{form.notes}</p> : null}
              </div>
              <div className="builder-review-count">
                <strong>{selectedExercises.length}</strong>
                <span>exercises</span>
              </div>
            </section>

            <div className="exercise-review-list">
              {form.exercises.map((exercise, index) => {
                if (!exercise.exercise_name.trim()) return null;

                const isExerciseMenuOpen = openBuilderExerciseMenu === index;

                return (
                  <article className="exercise-review-card" key={`${index}-${exercise.id || exercise.exercise_name}`}>
                    <div className="exercise-review-head">
                      <div>
                        <p className="muscle-label">{exercise.muscle_group}</p>
                        <h2>{exercise.exercise_name}</h2>
                        {form.workout_type !== "hiit" ? (
                          <p>Target: {exercise.sets || 1} sets x {exercise.rep_min || 0} reps</p>
                        ) : (
                          <p>Target: {exercise.target_value || 0} {exercise.target_type || "reps"}</p>
                        )}
                      </div>
                      <div className="session-menu-wrap">
                        <button
                          aria-expanded={isExerciseMenuOpen}
                          aria-label={`More options for ${exercise.exercise_name}`}
                          className="icon-action exercise-menu-button"
                          onClick={() => setOpenBuilderExerciseMenu(isExerciseMenuOpen ? null : index)}
                          type="button"
                        >
                          ...
                        </button>
                        {isExerciseMenuOpen ? (
                          <div className="session-menu exercise-action-menu" role="menu">
                            <button
                              onClick={() => {
                                setOpenBuilderExerciseMenu(null);
                                showDemo(exercise.exercise_name);
                              }}
                              type="button"
                            >
                              Demo
                            </button>
                            <button
                              onClick={() => {
                                setOpenBuilderExerciseMenu(null);
                                backToExerciseSelection(index);
                              }}
                              type="button"
                            >
                              Swap
                            </button>
                            <button
                              className="danger-text"
                              onClick={() => {
                                setOpenBuilderExerciseMenu(null);
                                removeExercise(index);
                              }}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {form.workout_type === "hiit" ? (
                      <>
                        <div className="form-grid one builder-target-grid">
                          <label>
                            Target value
                            <input
                              min="0"
                              onChange={(event) => updateExercise(index, "target_value", event.target.value)}
                              type="number"
                              value={exercise.target_value}
                            />
                          </label>
                        </div>
                        <div className="target-type-picker">
                          <p className="eyebrow">Target</p>
                          <div className="segmented-options">
                            {hiitTargetTypes.map((targetType) => (
                              <button
                                className={exercise.target_type === targetType.value ? "segment active hiit" : "segment"}
                                key={targetType.value}
                                onClick={() => updateExercise(index, "target_type", targetType.value)}
                                type="button"
                              >
                                {targetType.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="session-set-table builder-template-set-table">
                          <div className="session-set-row session-set-head">
                            <span>Set</span>
                            <span>Kg</span>
                            <span>Reps</span>
                            <span>Done</span>
                          </div>
                          {getTemplateSetRows(exercise).map((row, setIndex) => (
                            <div className="session-set-row builder-template-set-row" key={`${index}-${setIndex}`}>
                              <strong>{setIndex + 1}</strong>
                              <input
                                inputMode="decimal"
                                min="0"
                                onChange={(event) => updateTemplateSet(index, setIndex, "kg", event.target.value)}
                                placeholder="kg"
                                step="0.25"
                                type="number"
                                value={row.kg}
                              />
                              <input
                                inputMode="numeric"
                                min="0"
                                onChange={(event) => updateTemplateSet(index, setIndex, "reps", event.target.value)}
                                placeholder="reps"
                                type="number"
                                value={row.reps}
                              />
                              <button className="set-toggle" disabled type="button">
                                Done
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          className="primary-action builder-add-set-action"
                          onClick={() => updateExerciseSetCount(index, 1)}
                          type="button"
                        >
                          Add Set
                        </button>
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="form-footer-actions">
              <button className="primary-action filled" disabled={saving} type="submit">
                {saving ? "Saving..." : "Save Workout"}
              </button>
            </div>
          </form>
        </section>
        {renderDemoModal()}
      </>
    );
  }

  return (
    <section className="screen-stack workout-library">
      <div className="screen-heading library-heading">
        <div>
          <p className="eyebrow">Workout library</p>
          <h1>Workouts</h1>
          <p>Create workouts once, start them later, or use them inside plans.</p>
        </div>
        <div className="workout-heading-actions">
          <button className="primary-action filled build-workout-action" onClick={startNewWorkout} type="button">
            Build Workout
          </button>
          <button className="primary-action filled quick-workout-action" onClick={startQuickLog} type="button">
            Quick Workout
          </button>
        </div>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {assignWorkout ? (
        <div className="panel assignment-panel">
          <div className="section-row">
            <div>
              <p className="eyebrow">Select client</p>
              <h2>{assignWorkout.name}</h2>
              <p>Choose who should receive this workout.</p>
            </div>
            <button className="primary-action compact" onClick={() => setAssignWorkout(null)} type="button">
              Close
            </button>
          </div>
          {loadingCoachClients ? <p className="compact-help">Loading linked clients...</p> : null}
          {coachClientsError ? <p className="form-message error">{coachClientsError}</p> : null}
          {coachClients.length ? (
            <div className="assignment-client-list">
              <p className="compact-help">Linked clients</p>
              {coachClients.map((client) => (
                <button
                  className={assignClientIds.includes(client.id) ? "client-assignment active" : "client-assignment"}
                  key={client.id}
                  onClick={() => toggleAssignClient(client.id)}
                  type="button"
                >
                  <span>{client.name}</span>
                  <strong>{assignClientIds.includes(client.id) ? "Added" : "Add"}</strong>
                </button>
              ))}
            </div>
          ) : !loadingCoachClients && !coachClientsError ? (
            <p className="compact-help">No linked clients found for this coach account. Search below to link and assign in one step.</p>
          ) : null}

          <form className="assign-search-form" onSubmit={searchAssignClients}>
            <input
              onChange={(event) => setAssignSearch(event.target.value)}
              placeholder="Search user email or name..."
              value={assignSearch}
            />
            <button className="primary-action compact" disabled={searchingAssignClients} type="submit">
              {searchingAssignClients ? "Searching..." : "Search"}
            </button>
          </form>

          {assignSearchResults.length ? (
            <div className="assignment-client-list">
              <p className="compact-help">Search results</p>
              {assignSearchResults.map((client) => (
                <button
                  className="client-assignment"
                  disabled={assigning}
                  key={client.id}
                  onClick={() => linkAndAssignClient(client.id)}
                  type="button"
                >
                  <span>{client.full_name || client.email || "Client"}</span>
                  <strong>Assign</strong>
                </button>
              ))}
            </div>
          ) : null}

          <button
            className="primary-action filled"
            disabled={!assignClientIds.length || loadingCoachClients || assigning}
            onClick={saveWorkoutAssignments}
            type="button"
          >
            {assignClientIds.length
              ? assigning
                ? "Assigning..."
                : `Assign to ${assignClientIds.length} client${assignClientIds.length === 1 ? "" : "s"}`
              : "Choose a client first"}
          </button>
        </div>
      ) : null}

      {sharingWorkout ? (
        <div className="panel assignment-panel">
          <div className="section-row">
            <div>
              <p className="eyebrow">Share workout</p>
              <h2>{sharingWorkout.name}</h2>
              <p className="compact-help">
                Share a copy with a paid mutual. Coach-assigned workouts cannot be shared.
              </p>
            </div>
            <button className="secondary-action" onClick={() => setSharingWorkout(null)} type="button">
              Close
            </button>
          </div>

          {mutualRecipients.length ? (
            <div className="assignment-client-list">
              {mutualRecipients.map((recipient) => (
                <button
                  className="client-assignment"
                  disabled={sharing}
                  key={recipient.user_id}
                  onClick={() => shareWorkoutWithMutual(recipient.user_id)}
                  type="button"
                >
                  <span>{recipient.full_name || recipient.email || "Movementz athlete"}</span>
                  <strong>{sharing ? "Sharing..." : "Share"}</strong>
                </button>
              ))}
            </div>
          ) : (
            <p className="compact-help">No paid mutuals available to share workouts with yet.</p>
          )}
        </div>
      ) : null}

      {role === "client" || mutualSharedWorkouts.length || mutualRecipients.length ? (
        <div className="library-view-tabs" role="tablist" aria-label="Workout library view">
          <button
            className={libraryView === "library" ? "active" : ""}
            onClick={() => setLibraryView("library")}
            type="button"
          >
            My Library
          </button>
          {role === "client" ? (
            <button
              className={libraryView === "assigned" ? "active" : ""}
              onClick={() => setLibraryView("assigned")}
              type="button"
            >
              Coach Assigned
              <span>{assignedWorkouts.length}</span>
            </button>
          ) : null}
          <button
            className={libraryView === "shared" ? "active" : ""}
            onClick={() => setLibraryView("shared")}
            type="button"
          >
            Mutual Shared
            <span>{mutualSharedWorkouts.length}</span>
          </button>
        </div>
      ) : null}

      {libraryView === "shared" ? (
        mutualSharedWorkouts.length ? (
          <div className="workout-card-list">
            {mutualSharedWorkouts.map((share) => {
              const workout = share.workout || {};
              const sharedWorkout = {
                ...workout,
                share_id: share.share_id,
                isMutualSharedWorkout: true
              };
              const exercises = workout.workout_template_exercises || [];
              const muscleSummary = [...new Set(exercises.map((exercise) => exercise.muscle_group).filter(Boolean))];
              const sharedDate = share.shared_at
                ? new Date(share.shared_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                : "";

              return (
                <article className="workout-card assigned-library-card" key={share.share_id}>
                  <div className="workout-card-head">
                    <div>
                      <p className="eyebrow">Mutual shared</p>
                      <h2>{workout.name || "Shared workout"}</h2>
                      <p>{workoutSummary(workout)}</p>
                    </div>
                    <span className="status-pill active">Mutual</span>
                  </div>
                  <div className="workout-card-meta">
                    <span>{muscleSummary.length ? muscleSummary.join(", ") : "Shared workout"}</span>
                    <span>{share.shared_by_name ? `From ${share.shared_by_name}` : "From mutual"}</span>
                    <span>{sharedDate ? `Shared ${sharedDate}` : "Shared"}</span>
                  </div>
                  {workout.notes ? <p className="workout-notes">{workout.notes}</p> : null}
                  <button className="primary-action filled" onClick={() => startSession(sharedWorkout)} type="button">
                    Start
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel empty-state">
            <h2>No mutual shared workouts yet</h2>
            <p>Workouts shared by mutuals will appear here.</p>
          </div>
        )
      ) : role === "client" && libraryView === "assigned" ? (
        assignedWorkouts.length ? (
          <div className="workout-card-list">
            {assignedWorkouts.map((assignment) => {
              const workout = assignment.workout || {};
              const assignedWorkout = {
                ...workout,
                assignment_id: assignment.assignment_id,
                isAssignedWorkout: true
              };
              const exercises = workout.workout_template_exercises || [];
              const muscleSummary = [...new Set(exercises.map((exercise) => exercise.muscle_group).filter(Boolean))];
              const assignedDate = assignment.assigned_at
                ? new Date(assignment.assigned_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                : "";

              return (
                <article className="workout-card assigned-library-card" key={assignment.assignment_id}>
                  <div className="workout-card-head">
                    <div>
                      <p className="eyebrow">Coach assigned</p>
                      <h2>{workout.name || "Assigned workout"}</h2>
                      <p>{workoutSummary(workout)}</p>
                    </div>
                    <span className="status-pill active">Assigned</span>
                  </div>
                  <div className="workout-card-meta">
                    <span>{muscleSummary.length ? muscleSummary.join(", ") : "Coach workout"}</span>
                    <span>{assignedDate ? `Assigned ${assignedDate}` : "Assigned"}</span>
                  </div>
                  {workout.notes ? <p className="workout-notes">{workout.notes}</p> : null}
                  <button className="primary-action filled" onClick={() => startSession(assignedWorkout)} type="button">
                    Start
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel empty-state">
            <h2>No assigned workouts yet</h2>
            <p>Coach-assigned workouts will appear here after your coach assigns them.</p>
          </div>
        )
      ) : loading ? (
        <div className="panel">
          <p>Loading workouts...</p>
        </div>
      ) : workouts.length === 0 ? (
        <div className="panel empty-state">
          <h2>No workouts yet</h2>
          <p>Start with one strength workout. Plans will import from this library next.</p>
          <button className="primary-action filled" onClick={startNewWorkout} type="button">
            Build First Workout
          </button>
        </div>
      ) : (
        <>
          {filteredWorkouts.length === 0 ? (
            <div className="panel empty-state">
              <p>No workouts match that filter.</p>
            </div>
          ) : (
            <div className="workout-card-list">
              {filteredWorkouts.map((workout) => {
                const exercises = workout.workout_template_exercises || [];
                const totalSets = exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);
                const hasExerciseDetails = exercises.length > 0;
                const muscleSummary = [...new Set(exercises.map((exercise) => exercise.muscle_group).filter(Boolean))];
                const isHiitWorkout = workout.workout_type === "hiit";
                const lastSession = lastSessionByName[workout.name];
                const lastCompleted = lastSession
                  ? new Date(lastSession.completed_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short"
                    })
                  : "";
                const isExpanded = expandedWorkoutIds.has(workout.id);

                return (
                  <article className="workout-card prototype-workout-card" key={workout.id}>
                    <div className="workout-card-head prototype-workout-head">
                      <div>
                        <p className="eyebrow">{formatHiitTimerLabel(workout)}</p>
                        <h2>{workout.name}</h2>
                        <p>
                          {hasExerciseDetails
                            ? isHiitWorkout
                              ? `${exercises.length} exercises - ${workout.hiit_rounds || 1} rounds`
                              : `${exercises.length} exercises - ${totalSets} total sets`
                            : "Exercise details load on demand."}
                        </p>
                      </div>
                      <span className="status-pill">Template</span>
                    </div>

                    <div className="workout-card-meta">
                      <span>{muscleSummary.length ? muscleSummary.join(", ") : "Muscle details hidden"}</span>
                      <span>{lastCompleted ? `Last done ${lastCompleted}` : "Not completed yet"}</span>
                    </div>

                    {workout.notes ? <p className="workout-notes">{workout.notes}</p> : null}

                    {hasExerciseDetails ? (
                      <div className="workout-exercise-summary prototype-exercise-preview">
                        {(isExpanded ? exercises : exercises.slice(0, 4)).map((exercise) => (
                          <div key={exercise.id || `${workout.id}-${exercise.position}`}>
                            <strong>{exercise.exercise_name}</strong>
                            <span>{formatExerciseTarget(exercise, workout.workout_type)}</span>
                          </div>
                        ))}
                        {!isExpanded && exercises.length > 4 ? (
                          <p className="compact-help">+ {exercises.length - 4} more exercises</p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="library-actions prototype-workout-actions">
                      <button className="primary-action filled" onClick={() => startSession(workout)} type="button">
                        Start
                      </button>
                      <div className="session-menu-wrap workout-menu-wrap">
                        <button
                          aria-label={`${workout.name} options`}
                          className="icon-action"
                          onClick={() => setOpenWorkoutMenu((current) => (current === workout.id ? null : workout.id))}
                          type="button"
                        >
                          ...
                        </button>
                        {openWorkoutMenu === workout.id ? (
                          <div className="session-menu workout-action-menu">
                            {role === "coach" ? (
                              <button
                                onClick={() => openAssignWorkout(workout)}
                                type="button"
                              >
                                Assign
                              </button>
                            ) : null}
                            {role === "admin" ? (
                              <button
                                onClick={() => togglePublicTemplate(workout)}
                                type="button"
                              >
                                {workout.is_public_template ? "Hide from public" : "Show in public"}
                              </button>
                            ) : null}
                            <button
                              onClick={() => {
                                setOpenWorkoutMenu(null);
                                startEditWorkout(workout);
                              }}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setOpenWorkoutMenu(null);
                                duplicateWorkout(workout);
                              }}
                              type="button"
                            >
                              Duplicate
                            </button>
                            {mutualRecipients.length ? (
                              <button
                                onClick={() => openShareWorkout(workout)}
                                type="button"
                              >
                                Share with mutual
                              </button>
                            ) : null}
                            <button
                              onClick={() => {
                                setOpenWorkoutMenu(null);
                                toggleWorkoutDetails(workout);
                              }}
                              type="button"
                            >
                              {isExpanded ? "Hide details" : "Details"}
                            </button>
                            <button
                              onClick={() => archiveWorkout(workout.id)}
                              type="button"
                            >
                              Archive
                            </button>
                            <button
                              className="danger-text"
                              onClick={() => {
                                setOpenWorkoutMenu(null);
                                deleteWorkout(workout.id);
                              }}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {libraryView === "library" ? (
        <section className="archive-section">
          <button className="archive-toggle" onClick={() => setShowArchivedWorkouts((current) => !current)} type="button">
            <span>Archived workouts</span>
            <em>{archivedWorkouts.length}</em>
          </button>
          {showArchivedWorkouts ? (
            archivedWorkouts.length ? (
              <div className="archive-list">
                {archivedWorkouts.map((workout) => (
                  <article className="archive-card" key={workout.id}>
                    <div>
                      <strong>{workout.name}</strong>
                      <span>Archived {formatShortDate(workout.archived_at)} - {workoutSummary(workout)}</span>
                    </div>
                    <div className="archive-actions">
                      <button className="primary-action compact" onClick={() => restoreWorkout(workout.id)} type="button">
                        Restore
                      </button>
                      <button className="danger-link" onClick={() => deleteWorkout(workout.id)} type="button">
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="compact-help">No archived workouts.</p>
            )
          ) : null}
        </section>
      ) : null}

      {libraryView === "library" ? (
      <div className="history-section">
        <div className="section-row">
          <h2>Recent sessions</h2>
          <span className="status-pill">{recentSessions.length} saved</span>
        </div>

        {loadingSessionDetail ? <p className="form-message success">Loading session...</p> : null}

        {recentSessions.length ? (
          <div className="session-history-list">
            {recentSessions.map((session) => {
              const completedDate = new Date(session.completed_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short"
              });
              const isHiitSession = session.workout_type === "hiit";

              return (
                <button
                  className="session-history-card"
                  disabled={loadingSessionDetail}
                  key={session.id}
                  onClick={() => openSessionHistory(session)}
                  type="button"
                >
                  <div>
                    <p className="eyebrow">{completedDate}</p>
                    <h3>{session.name}</h3>
                    <p>
                      {formatDuration(session.duration_seconds || 0)} - {session.total_exercises} exercises
                    </p>
                  </div>
                  <div className="session-history-stats">
                    <strong>{session.completed_sets}</strong>
                    <span>{isHiitSession ? "splits" : "sets"}</span>
                    <strong>
                      {isHiitSession
                        ? formatShortDuration(session.duration_seconds || 0)
                        : `${Math.round(session.total_volume_kg || 0).toLocaleString()}kg`}
                    </strong>
                    <span>{isHiitSession ? "time" : "volume"}</span>
                    {session.rating ? <span>{session.rating}/5</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="panel empty-state">
            <p>No completed sessions yet.</p>
          </div>
        )}
      </div>
      ) : null}
    </section>
  );
}
