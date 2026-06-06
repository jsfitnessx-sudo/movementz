const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || process.env.VITE_RAPIDAPI_KEY;
const RAPIDAPI_HOST = "exercisedb.p.rapidapi.com";

const bodyPartMap = {
  Chest: "chest",
  Back: "back",
  Shoulders: "shoulders",
  Biceps: "upper arms",
  Triceps: "upper arms",
  Legs: "upper legs",
  Quads: "upper legs",
  Hamstrings: "upper legs",
  Glutes: "upper legs",
  Calves: "lower legs",
  Core: "waist",
  Abs: "waist"
};

function titleCase(value = "") {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function formatExercise(exercise) {
  return {
    id: exercise.id || exercise.name,
    exercise_name: titleCase(exercise.name || ""),
    muscle_group: titleCase(exercise.bodyPart || exercise.target || ""),
    equipment: exercise.equipment || "",
    thumbnail_url: exercise.gifUrl || ""
  };
}

export default async function handler(request, response) {
  if (!RAPIDAPI_KEY) {
    response.status(200).json({ exercises: [], configured: false });
    return;
  }

  const query = String(request.query.query || "").trim();
  const muscle = String(request.query.muscle || "").trim();
  const limit = Math.min(Math.max(Number(request.query.limit) || 12, 1), 20);

  let path = `/exercises?limit=${limit}&offset=0`;
  if (query) {
    path = `/exercises/name/${encodeURIComponent(query.toLowerCase())}?limit=${limit}&offset=0`;
  } else if (muscle) {
    const bodyPart = bodyPartMap[muscle] || muscle.toLowerCase();
    path = `/exercises/bodyPart/${encodeURIComponent(bodyPart)}?limit=${limit}&offset=0`;
  }

  try {
    const apiResponse = await fetch(`https://${RAPIDAPI_HOST}${path}`, {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY
      }
    });

    if (!apiResponse.ok) {
      response.status(apiResponse.status).json({ exercises: [], configured: true });
      return;
    }

    const data = await apiResponse.json();
    const exercises = Array.isArray(data) ? data.slice(0, limit).map(formatExercise) : [];
    response.status(200).json({ exercises, configured: true });
  } catch {
    response.status(500).json({ exercises: [], configured: true });
  }
}
