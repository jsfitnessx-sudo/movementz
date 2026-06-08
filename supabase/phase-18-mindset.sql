-- Movementz Phase 18: mindset logs and resources
-- Run after phase-17-daily-habits.sql.

create table if not exists public.daily_mindset_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  mood_score integer not null default 3 check (mood_score between 1 and 5),
  mood_note text,
  support_need text,
  affirmation text,
  morning_focus text,
  reminder_minutes integer,
  support_tags text[] not null default '{}',
  gratitude text,
  reflection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.mindset_resources (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  category text,
  description text,
  url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.daily_mindset_logs enable row level security;
alter table public.mindset_resources enable row level security;

drop policy if exists "daily_mindset_logs_select_own_or_linked_coach" on public.daily_mindset_logs;
create policy "daily_mindset_logs_select_own_or_linked_coach"
on public.daily_mindset_logs
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = daily_mindset_logs.user_id
      and cc.status = 'active'
  )
);

drop policy if exists "daily_mindset_logs_insert_own" on public.daily_mindset_logs;
create policy "daily_mindset_logs_insert_own"
on public.daily_mindset_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_mindset_logs_update_own" on public.daily_mindset_logs;
create policy "daily_mindset_logs_update_own"
on public.daily_mindset_logs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "mindset_resources_select_active" on public.mindset_resources;
create policy "mindset_resources_select_active"
on public.mindset_resources
for select
to authenticated
using (is_active = true);

drop policy if exists "mindset_resources_insert_coach_admin" on public.mindset_resources;
create policy "mindset_resources_insert_coach_admin"
on public.mindset_resources
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('coach', 'admin')
  )
);

create index if not exists daily_mindset_logs_user_date_idx
  on public.daily_mindset_logs(user_id, log_date desc);

create index if not exists mindset_resources_active_created_idx
  on public.mindset_resources(is_active, created_at desc);

create or replace function public.set_daily_mindset_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_mindset_logs_updated_at on public.daily_mindset_logs;
create trigger daily_mindset_logs_updated_at
before update on public.daily_mindset_logs
for each row execute function public.set_daily_mindset_logs_updated_at();
