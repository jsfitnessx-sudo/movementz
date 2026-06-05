# Workout Roadmap

This rebuild keeps workouts in order: Workout Library, Active Workout Logging, then Plan Library.

## Active Workout Logging

- Save completed sessions to Supabase session log tables.
- Save exercises, sets, skipped exercises, and swapped/substituted exercises.
- Pull true previous-set history from saved session logs.
- Add a proper workout completion flow after the user ends a workout:
  - session summary
  - progression/PB highlights
  - session rating
  - optional user comment
  - Save & Finish action
- Add a post-completion social/share screen:
  - transparent workout-complete image option
  - Movementz/METZ branded overlay option
  - optional uploaded photo background
  - save/share image action

## Exercise Media

- Add ExerciseDB or another exercise media source after local workout logging is stable.
- Link media to stable exercise records rather than temporary exercise names.
