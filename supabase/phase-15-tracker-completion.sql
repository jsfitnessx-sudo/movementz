-- Movementz Phase 15: tracker completion summary
-- Run after phase-14-tracker-photos.sql.

alter table public.goal_trackers
  add column if not exists completed_at timestamptz;

alter table public.goal_trackers
  add column if not exists archived_at timestamptz;

alter table public.goal_trackers
  add column if not exists final_summary jsonb not null default '{}'::jsonb;

create index if not exists goal_trackers_user_completed_idx
  on public.goal_trackers(user_id, completed_at desc)
  where status = 'completed';
