-- Movementz Phase 17: daily habit logs
-- Run after phase-16-coach-client-progress.sql.

create table if not exists public.daily_habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  completion_percent integer not null default 0 check (completion_percent >= 0 and completion_percent <= 100),
  workout_completed boolean not null default false,
  steps integer check (steps is null or steps >= 0),
  water_liters numeric(5,2) check (water_liters is null or water_liters >= 0),
  protein_g integer check (protein_g is null or protein_g >= 0),
  sleep_hours numeric(4,2) check (sleep_hours is null or sleep_hours >= 0),
  nutrition_compliance text check (nutrition_compliance is null or nutrition_compliance in ('yes', 'mostly', 'no')),
  mindset jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.daily_habit_logs enable row level security;

drop policy if exists "daily_habit_logs_select_own_or_linked_coach" on public.daily_habit_logs;
create policy "daily_habit_logs_select_own_or_linked_coach"
on public.daily_habit_logs
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = daily_habit_logs.user_id
      and cc.status = 'active'
  )
);

drop policy if exists "daily_habit_logs_insert_own" on public.daily_habit_logs;
create policy "daily_habit_logs_insert_own"
on public.daily_habit_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_habit_logs_update_own" on public.daily_habit_logs;
create policy "daily_habit_logs_update_own"
on public.daily_habit_logs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "daily_habit_logs_delete_own" on public.daily_habit_logs;
create policy "daily_habit_logs_delete_own"
on public.daily_habit_logs
for delete
to authenticated
using (user_id = auth.uid());

create index if not exists daily_habit_logs_user_date_idx
  on public.daily_habit_logs(user_id, log_date desc);

create or replace function public.set_daily_habit_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_habit_logs_updated_at on public.daily_habit_logs;
create trigger daily_habit_logs_updated_at
before update on public.daily_habit_logs
for each row execute function public.set_daily_habit_logs_updated_at();
