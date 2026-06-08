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
      .slice(0, 6)
  };
}
