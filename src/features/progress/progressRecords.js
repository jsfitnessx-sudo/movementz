export function estimateOneRepMax(kg, reps) {
  const weight = Number(kg) || 0;
  const repCount = Number(reps) || 0;
  if (!weight || !repCount) return 0;
  return weight * (1 + repCount / 30);
}

export function formatRecordDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatRecordDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return minutes ? `${minutes}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;
}

export function buildProgressRecords(sessions) {
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
    count: maxWeightByExercise.size + forTimeByWorkout.size + (bestVolume ? 1 : 0),
    forTime: [...forTimeByWorkout.values()].slice(0, 5),
    maxWeight: [...maxWeightByExercise.values()].sort((left, right) => right.kg - left.kg).slice(0, 6),
    oneRepMax: [...bestOneRepByExercise.values()]
      .sort((left, right) => right.estimatedOneRepMax - left.estimatedOneRepMax)
      .slice(0, 6),
    sessions: sessions || []
  };
}

function startOfWeek(date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  const day = nextDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + mondayOffset);
  return nextDate;
}

function formatWeekLabel(date) {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function completedSetVolume(exercise) {
  return (exercise.session_log_sets || []).reduce((total, set) => {
    if (!set.completed) return total;
    return total + (Number(set.kg) || 0) * (Number(set.reps) || 0);
  }, 0);
}

export function buildWorkoutTrendData(sessions, numberOfWeeks = 4) {
  const completedSessions = [...(sessions || [])]
    .filter((session) => session?.completed_at)
    .sort((left, right) => new Date(left.completed_at) - new Date(right.completed_at));

  if (!completedSessions.length) {
    return {
      weekLabels: Array.from({ length: numberOfWeeks }, (_, index) => `W${index + 1}`),
      exerciseOptions: [],
      workoutOptions: [],
      forTimeOptions: [],
      exerciseSeries: {},
      workoutSeries: {},
      forTimeSeries: {}
    };
  }

  const latestDate = new Date(completedSessions.at(-1).completed_at);
  const firstWeekStart = startOfWeek(latestDate);
  firstWeekStart.setDate(firstWeekStart.getDate() - (numberOfWeeks - 1) * 7);
  const weekStarts = Array.from({ length: numberOfWeeks }, (_, index) => {
    const weekDate = new Date(firstWeekStart);
    weekDate.setDate(firstWeekStart.getDate() + index * 7);
    return weekDate;
  });
  const weekLabels = weekStarts.map((weekDate, index) => `W${index + 1} ${formatWeekLabel(weekDate)}`);

  const exerciseSeries = {};
  const workoutSeries = {};
  const forTimeSeries = {};

  const bucketIndexFor = (value) => {
    const date = new Date(value);
    const diffDays = Math.floor((startOfWeek(date) - firstWeekStart) / 86400000);
    const index = Math.floor(diffDays / 7);
    return index >= 0 && index < numberOfWeeks ? index : -1;
  };

  const ensurePoints = (store, key) => {
    if (!store[key]) {
      store[key] = weekLabels.map((label) => ({ label, value: 0, hasValue: false }));
    }
    return store[key];
  };

  for (const session of completedSessions) {
    const weekIndex = bucketIndexFor(session.completed_at);
    if (weekIndex < 0) continue;

    if (session.workout_type === "hiit") {
      const points = ensurePoints(forTimeSeries, session.name || "For Time");
      const duration = Number(session.duration_seconds) || 0;
      if (duration && (!points[weekIndex].hasValue || duration < points[weekIndex].value)) {
        points[weekIndex] = { ...points[weekIndex], value: duration, hasValue: true };
      }
      continue;
    }

    const workoutName = session.name || "Workout";
    const workoutPoints = ensurePoints(workoutSeries, workoutName);
    workoutPoints[weekIndex] = {
      ...workoutPoints[weekIndex],
      value: Number(workoutPoints[weekIndex].value || 0) + Number(session.total_volume_kg || 0),
      hasValue: true
    };

    for (const exercise of session.session_log_exercises || []) {
      const exerciseName = exercise.exercise_name || "Exercise";
      const volume = completedSetVolume(exercise);
      if (!volume) continue;
      const exercisePoints = ensurePoints(exerciseSeries, exerciseName);
      exercisePoints[weekIndex] = {
        ...exercisePoints[weekIndex],
        value: Number(exercisePoints[weekIndex].value || 0) + volume,
        hasValue: true
      };
    }
  }

  const usedOptions = (store) =>
    Object.entries(store)
      .filter(([, points]) => points.some((point) => point.hasValue))
      .map(([name]) => name)
      .sort((left, right) => left.localeCompare(right));

  return {
    weekLabels,
    exerciseOptions: usedOptions(exerciseSeries),
    workoutOptions: usedOptions(workoutSeries),
    forTimeOptions: usedOptions(forTimeSeries),
    exerciseSeries,
    workoutSeries,
    forTimeSeries
  };
}
