# Movementz Rebuild

This is the clean rebuild of Movementz.

The current prototype remains in `work/metz-app` and should be treated as a reference only.

## Setup

1. Copy `.env.example` to `.env`.
2. Add the new Supabase project URL and publishable anon key.
3. In Supabase SQL Editor, run `supabase/phase-1-auth-profiles.sql`.
4. Run `supabase/phase-2-workout-library.sql`.
5. Run `supabase/phase-3-session-logging.sql`.
6. Run `supabase/phase-4-exercise-library.sql`.
7. Run:

```powershell
npm install
npm run dev
```

## Phase 1

The first live foundation includes:

- normal user login/signup
- coach signup
- profile records created from Supabase Auth
- coach profile records
- coach/client link table
- invite table foundation
- row-level security policies for profile access

## Architecture

The app is split by product area:

- `app`: app shell, routing and role decisions
- `features`: domain features such as auth, home, workouts and coach
- `layouts`: role-specific app layouts
- `lib`: Supabase, permissions and shared utilities
- `components`: reusable UI

The rebuild order follows `outputs/movementz-phase-0-product-blueprint.md`.

Workout-specific logging and completion flow notes live in `docs/workout-roadmap.md`.
