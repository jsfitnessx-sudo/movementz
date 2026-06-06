import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const muscleGroups = ["Chest", "Back", "Legs", "Shoulders", "Biceps", "Triceps", "Core"];
const CATALOG_SEARCH_LIMIT = 8;
const youtubeApiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

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
  search: "",
  suggestionOffset: 0
};

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

function createExerciseForMuscle(muscle, index, defaultSets = 4) {
  const options = exerciseLibrary[muscle] || [];
  return {
    ...emptyExercise,
    muscle_group: muscle,
    sets: defaultSets,
    exercise_name: options[index % options.length] || "",
    suggestionOffset: index
  };
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
  if (!youtubeApiKey) return null;

  const searchParams = new URLSearchParams({
    part: "snippet",
    maxResults: "1",
    q: `${exerciseName} exercise tutorial form`,
    safeSearch: "strict",
    type: "video",
    videoEmbeddable: "true",
    key: youtubeApiKey
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("YouTube demo search is unavailable right now.");
  }

  const result = await response.json();
  const videoId = result?.items?.[0]?.id?.videoId;
  if (!videoId) return null;

  return {
    embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
    externalUrl: `https://www.youtube.com/watch?v=${videoId}`
  };
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

function formatDuration(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function createDefaultSetup() {
  return {
    name: "",
    notes: "",
    workout_type: "strength",
    defaultSets: 4,
    muscleTargets: { ...createMuscleTargets(), Chest: 4 }
  };
}

export function WorkoutLibraryScreen({ user }) {
  const [workouts, setWorkouts] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [mode, setMode] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [setup, setSetup] = useState(createDefaultSetup);
  const [form, setForm] = useState({
    name: "",
    notes: "",
    workout_type: "strength",
    exercises: []
  });
  const [activeWorkout, setActiveWorkout] = useState(null);
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
  const [catalogExerciseNames, setCatalogExerciseNames] = useState(new Set());
  const [catalogSearchResults, setCatalogSearchResults] = useState({});
  const [swapCatalogResults, setSwapCatalogResults] = useState([]);
  const [demoVideo, setDemoVideo] = useState(null);
  const sessionInputRefs = useRef({});
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const editingWorkout = useMemo(
    () => workouts.find((workout) => workout.id === editingId),
    [editingId, workouts]
  );

  const totalTargetExercises = useMemo(
    () =>
      Object.values(setup.muscleTargets).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0
      ),
    [setup.muscleTargets]
  );

  const selectedMuscleTargets = useMemo(
    () => Object.entries(setup.muscleTargets).filter(([, count]) => Number(count) > 0),
    [setup.muscleTargets]
  );

  const customExerciseList = useMemo(
    () => Array.from(customExerciseNames).sort((a, b) => a.localeCompare(b)),
    [customExerciseNames]
  );

  const knownExerciseKeys = useMemo(() => {
    const names = [...getLocalExerciseNames(), ...customExerciseNames, ...catalogExerciseNames];
    return new Set(names.map(toExerciseKey));
  }, [catalogExerciseNames, customExerciseNames]);

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
      .select("id,name,notes,workout_type,created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      setMessage("Could not load workouts yet. Run the Phase 2 SQL in Supabase first.");
      setWorkouts([]);
    } else {
      setWorkouts(data || []);
    }
    setLoading(false);
  }, [user.id]);

  const loadRecentSessions = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setRecentSessions([]);
      return;
    }

    const { data, error } = await supabase
      .from("session_logs")
      .select("id,name,completed_at,duration_seconds,total_exercises,completed_sets,total_volume_kg,rating")
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

  const loadCustomExerciseOptions = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setCustomExerciseNames(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("user_exercise_options")
      .select("exercise_name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) {
      return;
    }

    setCustomExerciseNames(new Set((data || []).map((exercise) => exercise.exercise_name)));
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
        "id,name,completed_at,duration_seconds,total_exercises,completed_sets,total_volume_kg,rating,comment,session_log_exercises(id,position,exercise_name,original_exercise_name,muscle_group,target_sets,target_rep_min,target_rep_max,skipped,substituted,session_log_sets(id,set_number,kg,reps,completed))"
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

  useEffect(() => {
    const load = Promise.resolve().then(async () => {
      await loadWorkouts();
      await loadRecentSessions();
      await loadCustomExerciseOptions();
    });
    return () => {
      void load;
    };
  }, [loadCustomExerciseOptions, loadRecentSessions, loadWorkouts]);

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
      const foundNames = [];

      await Promise.all(
        searchableExercises.map(async (exercise) => {
          const { data, error } = await supabase
            .from("exercise_catalog")
            .select("exercise_name")
            .ilike("exercise_name", `%${exercise.search}%`)
            .order("exercise_name", { ascending: true })
            .limit(CATALOG_SEARCH_LIMIT);

          if (!error) {
            const names = (data || []).map((row) => row.exercise_name);
            nextResults[exercise.index] = names;
            foundNames.push(...names);
          }
        })
      );

      setCatalogSearchResults(nextResults);
      setCatalogExerciseNames((current) => new Set([...current, ...foundNames]));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [form.exercises, mode, user.id]);

  useEffect(() => {
    if (!supabase || user.id === "demo-user" || swapTargetIndex === null) return undefined;

    const cleanSearch = swapSearch.trim();
    if (cleanSearch.length < 2) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("exercise_catalog")
        .select("exercise_name")
        .ilike("exercise_name", `%${cleanSearch}%`)
        .order("exercise_name", { ascending: true })
        .limit(CATALOG_SEARCH_LIMIT);

      if (error) return;

      const names = (data || []).map((row) => row.exercise_name);
      setSwapCatalogResults(names);
      setCatalogExerciseNames((current) => new Set([...current, ...names]));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [swapSearch, swapTargetIndex, user.id]);

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

  async function loadWorkoutDetails(workout) {
    if (!supabase || user.id === "demo-user") return workout;

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("workout_templates")
      .select(
        "id,name,notes,workout_type,created_at,workout_template_exercises(id,position,exercise_name,muscle_group,sets,rep_min,rep_max,start_kg,rest_seconds,tip,superset_group)"
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

  function startNewWorkout() {
    setEditingId(null);
    setSetup(createDefaultSetup());
    setMessage("");
    setMode("setup");
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

    const exercises = [];
    const defaultSets = Number(setup.defaultSets) || 4;
    Object.entries(setup.muscleTargets).forEach(([muscle, count]) => {
      for (let index = 0; index < Number(count || 0); index += 1) {
        exercises.push(createExerciseForMuscle(muscle, index, defaultSets));
      }
    });

    setForm({
      name: setup.name,
      notes: setup.notes,
      workout_type: setup.workout_type,
      exercises
    });
    setMessage("");
    setMode("editor");
  }

  async function startEditWorkout(workout) {
    const detailedWorkout = await loadWorkoutDetails(workout);
    if (!detailedWorkout) return;

    setEditingId(detailedWorkout.id);
    setForm({
      name: detailedWorkout.name || "",
      notes: detailedWorkout.notes || "",
      workout_type: detailedWorkout.workout_type || "strength",
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
        search: "",
        suggestionOffset: 0
      }))
    });
    setMessage("");
    setMode("editor");
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

  function updateExercise(index, field, value) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, [field]: value } : exercise
      )
    }));
  }

  function chooseExercise(index, exerciseName, clearSearch = false, isTypedCustom = false) {
    const cleanExerciseName = exerciseName.trim();
    const isCustomExercise = isTypedCustom || !knownExerciseKeys.has(toExerciseKey(cleanExerciseName));

    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? {
              ...exercise,
              exercise_name: cleanExerciseName,
              is_custom_exercise: isCustomExercise,
              search: clearSearch ? "" : exercise.search
            }
          : exercise
      )
    }));
    setMessage("");
  }

  function refreshSuggestions(index) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? { ...exercise, suggestionOffset: exercise.suggestionOffset + 3 }
          : exercise
      )
    }));
    setMessage("Exercise options refreshed.");
  }

  async function showDemo(exerciseName) {
    if (!exerciseName) {
      setMessage("Choose an exercise first, then Demo will show its video.");
      return;
    }

    const searchUrl = getYouTubeExerciseSearchUrl(exerciseName);

    if (!supabase || user.id === "demo-user") {
      try {
        const youtubeDemo = await findYouTubeDemo(exerciseName);
        setDemoVideo({
          exerciseName,
          embedUrl: youtubeDemo?.embedUrl || "",
          externalUrl: youtubeDemo?.externalUrl || searchUrl
        });
      } catch (youtubeError) {
        setDemoVideo({ exerciseName, embedUrl: "", externalUrl: searchUrl, note: youtubeError.message });
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
        const youtubeDemo = await findYouTubeDemo(exerciseName);
        setDemoVideo({
          exerciseName,
          embedUrl: youtubeDemo?.embedUrl || "",
          externalUrl: youtubeDemo?.externalUrl || searchUrl,
          note: youtubeDemo ? "" : "YouTube auto-search is not configured yet."
        });
      } catch (youtubeError) {
        setDemoVideo({ exerciseName, embedUrl: "", externalUrl: searchUrl, note: youtubeError.message });
      }
      setMessage("");
      return;
    }

    const embedUrl = getYouTubeEmbedUrl(data.youtube_url);
    if (!embedUrl) {
      setDemoVideo({ exerciseName, embedUrl: "", externalUrl: data.youtube_url });
      return;
    }

    setDemoVideo({ exerciseName, embedUrl, externalUrl: data.youtube_url });
  }

  function addExercise() {
    setForm((current) => ({
      ...current,
      exercises: [...current.exercises, createExerciseForMuscle("Chest", current.exercises.length, 4)]
    }));
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

    if (!supabase || user.id === "demo-user") {
      const demoWorkout = {
        id: editingId || `demo-${Date.now()}`,
        name: cleanName,
        notes: form.notes,
        workout_type: form.workout_type,
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
    setMode("list");
  }

  async function deleteWorkout(workoutId) {
    setMessage("");

    if (!supabase || user.id === "demo-user") {
      setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      return;
    }

    const { error } = await supabase
      .from("workout_templates")
      .delete()
      .eq("id", workoutId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadWorkouts();
    }
  }

  async function startSession(workout) {
    const detailedWorkout = await loadWorkoutDetails(workout);
    if (!detailedWorkout) return;

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

  function playTone(type = "tap") {
    if (typeof window === "undefined") return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = type === "done" ? 880 : 420;
    gain.gain.setValueAtTime(type === "done" ? 0.12 : 0.055, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (type === "done" ? 0.18 : 0.06));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === "done" ? 0.18 : 0.06));
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
      setActiveNumberInput({ exerciseIndex, rowIndex, field: "reps" });
      return;
    }

    updateSessionRow(exerciseIndex, rowIndex, "done", true);
    playTone("done");

    if (rowIndex + 1 < exercise.sessionRows.length) {
      setActiveNumberInput({ exerciseIndex, rowIndex: rowIndex + 1, field: "kg" });
      return;
    }

    setActiveNumberInput(null);
  }

  function updateActiveNumber(value) {
    if (!activeNumberInput) return;
    updateSessionRow(activeNumberInput.exerciseIndex, activeNumberInput.rowIndex, activeNumberInput.field, value);
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

    playTone("tap");

    if (key === "delete") {
      updateActiveNumber(currentValue.slice(0, -1));
      return;
    }

    if (key === "." && currentValue.includes(".")) return;
    updateActiveNumber(`${currentValue}${key}`);
  }

  function openSwapExercise(exerciseIndex) {
    setSwapTargetIndex(exerciseIndex);
    setSwapSearch("");
    setSwapCatalogResults([]);
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
      setCompletedSession({
        id: `demo-session-${Date.now()}`,
        name: activeWorkout.name,
        startedAt,
        completedAt,
        durationSeconds,
        ...summary
      });
      setSaving(false);
      setMode("complete");
      return;
    }

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
      ...summary
    });
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
    setSessionFeedback({ rating: 0, comment: "" });
    setShareMode("transparent");
    setSharePhoto("");
    void loadRecentSessions();
    setMode("list");
  }

  function cancelActiveSession() {
    const shouldCancel = window.confirm("End this workout without saving it to history?");
    if (!shouldCancel) return;

    setActiveWorkout(null);
    setActiveNumberInput(null);
    setOpenSessionMenu(null);
    setSwapTargetIndex(null);
    setSwapSearch("");
    setMessage("");
    setMode("list");
  }

  function handleSharePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setSharePhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function drawShareImage(ctx, canvas, image = null) {
    const width = canvas.width;
    const height = canvas.height;
    const isBranded = shareMode === "branded";
    const duration = completedSession
      ? `${Math.floor(completedSession.durationSeconds / 60)}m ${completedSession.durationSeconds % 60}s`
      : "0s";
    const date = completedSession
      ? new Date(completedSession.completedAt).toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short"
        })
      : "";

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

    ctx.textAlign = "center";
    ctx.fillStyle = "#50d0c7";
    ctx.font = "700 56px Arial";
    ctx.fillText("MOVEMENTZ", width / 2, 190);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 54px Arial";
    ctx.fillText("WORKOUT COMPLETE", width / 2, 410);
    ctx.font = "900 86px Arial";
    ctx.fillText(completedSession?.name || "Workout", width / 2, 520);
    ctx.font = "700 38px Arial";
    ctx.fillText(completedSession?.name || "Workout", width / 2, 720);
    ctx.fillText(date, width / 2, 778);
    ctx.font = "900 54px Arial";
    ctx.fillText(duration, width / 2, 990);
    ctx.font = "900 46px Arial";
    ctx.fillText(`${completedSession?.totalExercises || 0} EXERCISES`, width / 2, 1120);
    ctx.fillStyle = "#50d0c7";
    ctx.font = "900 76px Arial";
    ctx.fillText(`${Math.round(completedSession?.totalVolumeKg || 0).toLocaleString()}kg`, width / 2, 1255);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px Arial";
    ctx.fillText("METZ", width / 2, 1650);
    ctx.font = "700 30px Arial";
    ctx.fillText("MOVE - TRAIN - GROW", width / 2, 1705);
    ctx.font = "600 24px Arial";
    ctx.fillText("Built with METZ", width / 2, 1815);
  }

  function saveShareImage() {
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

    if (sharePhoto) {
      const image = new Image();
      image.onload = () => {
        drawShareImage(context, canvas, image);
        download();
      };
      image.src = sharePhoto;
      return;
    }

    drawShareImage(context, canvas);
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

          {demoVideo.embedUrl ? (
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
        </div>
      </div>
    );
  }

  function renderSwapPanel(exercise) {
    const muscleOptions = exerciseLibrary[exercise?.muscle_group] || [];
    const hasSearch = swapSearch.trim().length >= 2;
    const searchOptions = hasSearch
      ? uniqueNames([
          ...swapCatalogResults,
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
          </div>

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
                        onFocus={() => setActiveNumberInput({ exerciseIndex, rowIndex, field: "kg" })}
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
                        onFocus={() => setActiveNumberInput({ exerciseIndex, rowIndex, field: "reps" })}
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
                onClick={() => pressKeypad(key)}
                type="button"
              >
                {key === "delete" ? "⌫" : key}
              </button>
            ))}
            <button className="keypad-hide" onClick={() => pressKeypad("hide")} type="button">
              ˅
            </button>
            <button className="keypad-next" onClick={() => pressKeypad("next")} type="button">
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
              <span>Sets done</span>
              <strong>{completedSession.completedSets}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{Math.round(completedSession.totalVolumeKg).toLocaleString()}kg</strong>
            </div>
          </div>

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
    const duration = `${Math.floor(completedSession.durationSeconds / 60)}m ${completedSession.durationSeconds % 60}s`;
    const sessionDate = new Date(completedSession.completedAt).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short"
    });

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
            <strong>METZ Branded</strong>
            <span>Dark overlay</span>
          </button>
        </div>

        <div className="share-preview-shell">
          <div
            className={shareMode === "branded" ? "share-preview branded" : "share-preview transparent"}
            style={sharePhoto ? { backgroundImage: `url(${sharePhoto})` } : undefined}
          >
            <div className="share-preview-overlay">
              <p className="share-logo">MOVEMENTZ</p>
              <p className="share-complete">Workout Complete</p>
              <h2>{completedSession.name}</h2>
              <div className="share-details">
                <strong>{completedSession.name}</strong>
                <span>{sessionDate}</span>
              </div>
              <strong className="share-duration">{duration}</strong>
              <p className="share-count">{completedSession.totalExercises} exercises</p>
              <strong className="share-volume">
                {Math.round(completedSession.totalVolumeKg).toLocaleString()}kg
              </strong>
              <div className="share-footer">
                <strong>METZ</strong>
                <span>Move - Train - Grow</span>
                <small>Built with METZ</small>
              </div>
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
              <span>Sets done</span>
              <strong>{selectedSession.completed_sets || 0}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{Math.round(selectedSession.total_volume_kg || 0).toLocaleString()}kg</strong>
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

            return (
              <article
                className={exercise.skipped ? "workout-card session-detail-card skipped" : "workout-card session-detail-card"}
                key={exercise.id}
              >
                <div className="workout-card-head">
                  <div>
                    <p className="eyebrow">{exercise.muscle_group || "Strength"}</p>
                    <h2>{exercise.exercise_name}</h2>
                    <p>
                      Target: {exercise.target_sets || 0} sets
                      {exercise.target_rep_min || exercise.target_rep_max
                        ? ` x ${exercise.target_rep_min || "?"}-${exercise.target_rep_max || "?"} reps`
                        : ""}
                    </p>
                  </div>
                  {exercise.substituted ? <span className="status-pill">Swapped</span> : null}
                  {exercise.skipped ? <span className="status-pill danger-pill">Skipped</span> : null}
                </div>

                {exercise.original_exercise_name && exercise.original_exercise_name !== exercise.exercise_name ? (
                  <p className="compact-help">Original: {exercise.original_exercise_name}</p>
                ) : null}

                {completedSets.length ? (
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

  if (mode === "setup") {
    return (
      <section className="screen-stack workout-library">
        <div className="screen-heading">
          <p className="eyebrow">Workout library</p>
          <h1>Build workout</h1>
          <p>Choose the muscle groups first, then pick exercises from quick options.</p>
        </div>

        <div className="workout-editor panel">
          <div className="library-toolbar">
            <button className="primary-action" onClick={() => setMode("list")} type="button">
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

          <label>
            Notes
            <textarea
              onChange={(event) => setSetup((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Workout notes, focus points, rest guidance, or coaching cues..."
              value={setup.notes}
            />
          </label>

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
              <h2>Pick muscles, then choose how many exercises</h2>
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
                    {count > 0 ? "✓ " : ""}
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
          <h1>{editingWorkout ? "Edit workout" : "Choose exercises"}</h1>
          <p>Use the quick options, refresh them, search, or type a requested exercise name.</p>
        </div>

        <form className="workout-editor panel" onSubmit={saveWorkout}>
          <div className="library-toolbar">
            <button
              className="primary-action"
              onClick={() => (editingId ? setMode("list") : setMode("setup"))}
              type="button"
            >
              Back
            </button>
          </div>

          {message ? <p className="form-message error">{message}</p> : null}

          <div className="exercise-list">
            <div className="section-row exercise-list-head">
              <h2>Exercises</h2>
              <button className="primary-action compact" onClick={addExercise} type="button">
                Add Exercise
              </button>
            </div>

            {form.exercises.map((exercise, index) => {
              const searchResults = exercise.search
                ? uniqueNames([
                    ...(catalogSearchResults[index] || []),
                    ...getLocalExerciseNames().filter((name) =>
                      name.toLowerCase().includes(exercise.search.toLowerCase())
                    ),
                    ...customExerciseList.filter((name) =>
                      name.toLowerCase().includes(exercise.search.toLowerCase())
                    )
                  ]).slice(0, 5)
                : [];

              return (
                <div className="exercise-editor" key={`${index}-${exercise.id || "new"}`}>
                  <div className="exercise-editor-head">
                    <div>
                      <strong>Exercise {index + 1}</strong>
                      <p className="muscle-label">{exercise.muscle_group}</p>
                    </div>
                    {exercise.exercise_name ? (
                      <button
                        className="primary-action compact demo-action"
                        onClick={() => showDemo(exercise.exercise_name)}
                        type="button"
                      >
                        Demo
                      </button>
                    ) : null}
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
                      {getSuggestions(exercise).map((suggestion) => (
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
                        className="primary-action compact refresh-action"
                        onClick={() => refreshSuggestions(index)}
                        title="Refresh suggestions"
                        type="button"
                      >
                        ↻
                      </button>
                      <button
                        className="danger-link remove-action"
                        onClick={() => removeExercise(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <label>
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
                  ) : exercise.search ? (
                    <button
                      className="primary-action compact"
                      onClick={() => chooseExercise(index, exercise.search, true, true)}
                      type="button"
                    >
                      Add "{exercise.search}" to my options
                    </button>
                  ) : null}

                  <div className="form-grid four">
                    <label>
                      Sets
                      <input
                        min="1"
                        onChange={(event) => updateExercise(index, "sets", event.target.value)}
                        type="number"
                        value={exercise.sets}
                      />
                    </label>
                    <label>
                      Rep min
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "rep_min", event.target.value)}
                        type="number"
                        value={exercise.rep_min}
                      />
                    </label>
                    <label>
                      Rep max
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "rep_max", event.target.value)}
                        type="number"
                        value={exercise.rep_max}
                      />
                    </label>
                    <label>
                      Start kg
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "start_kg", event.target.value)}
                        step="0.25"
                        type="number"
                        value={exercise.start_kg}
                      />
                    </label>
                  </div>

                  <div className="form-grid two">
                    <label>
                      Rest sec
                      <input
                        min="0"
                        onChange={(event) => updateExercise(index, "rest_seconds", event.target.value)}
                        type="number"
                        value={exercise.rest_seconds}
                      />
                    </label>
                    <label>
                      Tip
                      <input
                        onChange={(event) => updateExercise(index, "tip", event.target.value)}
                        placeholder="Optional cue"
                        value={exercise.tip}
                      />
                    </label>
                  </div>
                </div>
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
        <button className="primary-action filled" onClick={startNewWorkout} type="button">
          Build Workout
        </button>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}

      {loading ? (
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
        <div className="workout-card-list">
          {workouts.map((workout) => {
            const exercises = workout.workout_template_exercises || [];
            const totalSets = exercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0);
            const hasExerciseDetails = exercises.length > 0;

            return (
              <article className="workout-card" key={workout.id}>
                <div className="workout-card-head">
                  <div>
                    <p className="eyebrow">{workout.workout_type}</p>
                    <h2>{workout.name}</h2>
                    <p>
                      {hasExerciseDetails
                        ? `${exercises.length} exercises - ${totalSets} total sets`
                        : "Exercise details load when you start or edit."}
                    </p>
                  </div>
                  <span className="status-pill">Template</span>
                </div>

                {workout.notes ? <p className="workout-notes">{workout.notes}</p> : null}

                {hasExerciseDetails ? (
                  <div className="workout-exercise-summary">
                    {exercises.map((exercise) => (
                      <div key={exercise.id || `${workout.id}-${exercise.position}`}>
                        <strong>{exercise.exercise_name}</strong>
                        <span>
                          {exercise.sets || 0} sets
                          {exercise.rep_min || exercise.rep_max
                            ? ` x ${exercise.rep_min || "?"}-${exercise.rep_max || "?"} reps`
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="library-actions">
                  <button className="primary-action filled" onClick={() => startSession(workout)} type="button">
                    Start
                  </button>
                  <button className="primary-action" onClick={() => startEditWorkout(workout)} type="button">
                    Edit
                  </button>
                  <button className="primary-action danger" onClick={() => deleteWorkout(workout.id)} type="button">
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
                    <span>sets</span>
                    <strong>{Math.round(session.total_volume_kg || 0).toLocaleString()}kg</strong>
                    <span>volume</span>
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
    </section>
  );
}
