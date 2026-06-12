import { useMemo, useState } from "react";
import { buildWorkoutTrendData, formatRecordDuration } from "./progressRecords.js";

function formatVolume(value) {
  return `${Math.round(Number(value) || 0).toLocaleString()}kg`;
}

function TrendLineChart({ emptyText, label, points, suffix = "", valueFormatter = null }) {
  const cleanPoints = (points || []).filter((point) => point.hasValue);
  if (cleanPoints.length < 2) {
    return (
      <article className="mini-line-chart workout-trend-chart empty">
        <p className="eyebrow">{label}</p>
        <span>{emptyText}</span>
      </article>
    );
  }

  const values = cleanPoints.map((point) => Number(point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = cleanPoints
    .map((point, index) => {
      const x = cleanPoints.length === 1 ? 50 : (index / (cleanPoints.length - 1)) * 100;
      const y = 86 - ((Number(point.value) - min) / range) * 72;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const formatValue = valueFormatter || ((value) => `${Math.round(Number(value) || 0).toLocaleString()}${suffix}`);

  return (
    <article className="mini-line-chart workout-trend-chart teal">
      <p className="eyebrow">{label}</p>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={path} />
      </svg>
      <div className="mini-chart-labels">
        <span>{cleanPoints[0].label}: {formatValue(cleanPoints[0].value)}</span>
        <strong>{cleanPoints.at(-1).label}: {formatValue(cleanPoints.at(-1).value)}</strong>
      </div>
      <div className="workout-trend-points">
        {(points || []).map((point) => (
          <span className={point.hasValue ? "" : "muted"} key={point.label}>
            <em>{point.label}</em>
            <strong>{point.hasValue ? formatValue(point.value) : "-"}</strong>
          </span>
        ))}
      </div>
    </article>
  );
}

function SelectControl({ label, options, value, onChange }) {
  return (
    <label className="workout-trend-select">
      <span>{label}</span>
      <select disabled={!options.length} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length ? options.map((option) => <option key={option} value={option}>{option}</option>) : <option>No data yet</option>}
      </select>
    </label>
  );
}

export function WorkoutTrendPanel({ sessions }) {
  const trends = useMemo(() => buildWorkoutTrendData(sessions, 4), [sessions]);
  const [exerciseName, setExerciseName] = useState("");
  const [workoutName, setWorkoutName] = useState("");
  const [forTimeName, setForTimeName] = useState("");

  const selectedExercise = trends.exerciseOptions.includes(exerciseName) ? exerciseName : trends.exerciseOptions[0] || "";
  const selectedWorkout = trends.workoutOptions.includes(workoutName) ? workoutName : trends.workoutOptions[0] || "";
  const selectedForTime = trends.forTimeOptions.includes(forTimeName) ? forTimeName : trends.forTimeOptions[0] || "";

  return (
    <div className="workout-trend-panel">
      <div className="workout-trend-controls">
        <SelectControl label="Exercise volume" options={trends.exerciseOptions} value={selectedExercise} onChange={setExerciseName} />
        <SelectControl label="Workout volume" options={trends.workoutOptions} value={selectedWorkout} onChange={setWorkoutName} />
        <SelectControl label="For Time result" options={trends.forTimeOptions} value={selectedForTime} onChange={setForTimeName} />
      </div>

      <div className="tracker-chart-grid workout-trend-grid">
        <TrendLineChart
          emptyText="Complete this exercise in at least two weeks to graph volume."
          label={selectedExercise ? `${selectedExercise} volume` : "Exercise volume"}
          points={trends.exerciseSeries[selectedExercise] || []}
          valueFormatter={formatVolume}
        />
        <TrendLineChart
          emptyText="Complete this workout in at least two weeks to graph total volume."
          label={selectedWorkout ? `${selectedWorkout} total volume` : "Workout total volume"}
          points={trends.workoutSeries[selectedWorkout] || []}
          valueFormatter={formatVolume}
        />
        <TrendLineChart
          emptyText="Complete a For Time workout in at least two weeks to graph speed."
          label={selectedForTime ? `${selectedForTime} time` : "For Time result"}
          points={trends.forTimeSeries[selectedForTime] || []}
          valueFormatter={formatRecordDuration}
        />
      </div>
    </div>
  );
}
