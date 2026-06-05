# Movementz Rebuild

This is the clean rebuild of Movementz.

The current prototype remains in `work/metz-app` and should be treated as a reference only.

## Setup

1. Copy `.env.example` to `.env`.
2. Add the new Supabase project URL and publishable anon key.
3. Run:

```powershell
npm install
npm run dev
```

## Architecture

The app is split by product area:

- `app`: app shell, routing and role decisions
- `features`: domain features such as auth, home, workouts and coach
- `layouts`: role-specific app layouts
- `lib`: Supabase, permissions and shared utilities
- `components`: reusable UI

The rebuild order follows `outputs/movementz-phase-0-product-blueprint.md`.
