-- Movementz Phase 14: attach progress photos to goal tracker setup and weekly check-ins
-- Run after phase-13-goal-trackers.sql.

alter table public.goal_trackers
  add column if not exists initial_photo_ids jsonb not null default '{}'::jsonb;

alter table public.goal_tracker_checkins
  add column if not exists photo_ids jsonb not null default '{}'::jsonb;

alter table public.progress_photos
  add column if not exists tracker_id uuid references public.goal_trackers(id) on delete set null;

alter table public.progress_photos
  add column if not exists tracker_week_number integer;

alter table public.progress_photos
  add column if not exists photo_context text not null default 'progress';

create index if not exists progress_photos_tracker_idx
  on public.progress_photos(tracker_id, tracker_week_number, pose);
