-- Phase 10: Archive lifecycle
-- Adds workout template archiving. Training plans already have status in Phase 6.
-- The app hides archived workouts/plans from active libraries; archived blocks can
-- remain available for 30 days in history-oriented screens before permanent cleanup.

alter table public.workout_templates
  add column if not exists status text not null default 'active'
    check (status in ('active', 'archived'));

alter table public.training_plans
  add column if not exists status text not null default 'active'
    check (status in ('active', 'paused', 'archived'));

alter table public.workout_templates
  add column if not exists archived_at timestamptz;

alter table public.training_plans
  add column if not exists archived_at timestamptz;

create index if not exists workout_templates_owner_status_created_idx
  on public.workout_templates(owner_id, status, created_at desc);

create index if not exists workout_templates_archived_at_idx
  on public.workout_templates(archived_at)
  where status = 'archived';

create index if not exists training_plans_archived_at_idx
  on public.training_plans(archived_at)
  where status = 'archived';

create or replace function public.cleanup_expired_archives()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workout_templates
  where status = 'archived'
    and archived_at is not null
    and archived_at < now() - interval '30 days';

  delete from public.training_plans
  where status = 'archived'
    and archived_at is not null
    and archived_at < now() - interval '30 days';
end;
$$;
