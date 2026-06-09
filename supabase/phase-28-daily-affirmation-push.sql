-- Movementz Phase 28: daily affirmation push send log.
-- Run after phase-27-push-notifications.sql.

create table if not exists public.daily_affirmation_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  affirmation_date date not null,
  affirmation_text text not null,
  push_count integer not null default 0,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, affirmation_date)
);

alter table public.daily_affirmation_pushes enable row level security;

drop policy if exists "daily_affirmation_pushes_select_own" on public.daily_affirmation_pushes;
create policy "daily_affirmation_pushes_select_own"
on public.daily_affirmation_pushes
for select
to authenticated
using (user_id = auth.uid());

create index if not exists daily_affirmation_pushes_user_date_idx
  on public.daily_affirmation_pushes(user_id, affirmation_date desc);
