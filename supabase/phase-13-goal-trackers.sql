-- Movementz Phase 13: client goal trackers and weekly check-ins
-- Run after phase-12-progress-photos.sql.

create table if not exists public.goal_trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_name text not null,
  goal_type text not null check (goal_type in ('lose_weight', 'gain_muscle', 'recomp', 'get_fit')),
  gender text,
  age integer,
  height_cm numeric,
  activity_level text not null default 'moderate',
  start_weight_kg numeric,
  goal_weight_kg numeric,
  deficit_style text not null default 'moderate' check (deficit_style in ('conservative', 'moderate', 'aggressive')),
  maintenance_calories integer,
  target_calories integer,
  body_fat_percent numeric,
  fat_kg numeric,
  muscle_kg numeric,
  neck_cm numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  left_bicep_cm numeric,
  right_bicep_cm numeric,
  left_thigh_cm numeric,
  right_thigh_cm numeric,
  duration_weeks integer not null check (duration_weeks in (4, 6, 8, 10, 12)),
  start_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goal_trackers_user_status_idx
  on public.goal_trackers(user_id, status, start_date desc);

create table if not exists public.goal_tracker_checkins (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.goal_trackers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_number integer not null,
  checkin_date date not null default current_date,
  weight_kg numeric,
  body_fat_percent numeric,
  fat_kg numeric,
  muscle_kg numeric,
  neck_cm numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  left_bicep_cm numeric,
  right_bicep_cm numeric,
  left_thigh_cm numeric,
  right_thigh_cm numeric,
  energy integer,
  mood integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracker_id, week_number)
);

create index if not exists goal_tracker_checkins_tracker_week_idx
  on public.goal_tracker_checkins(tracker_id, week_number);

alter table public.goal_trackers enable row level security;
alter table public.goal_tracker_checkins enable row level security;

drop policy if exists "Goal trackers visible to owner and linked coach" on public.goal_trackers;
create policy "Goal trackers visible to owner and linked coach"
  on public.goal_trackers
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.coach_clients cc
      where cc.coach_id = auth.uid()
        and cc.client_id = goal_trackers.user_id
        and cc.status = 'active'
    )
  );

drop policy if exists "Users manage their own goal trackers" on public.goal_trackers;
create policy "Users manage their own goal trackers"
  on public.goal_trackers
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Goal checkins visible to owner and linked coach" on public.goal_tracker_checkins;
create policy "Goal checkins visible to owner and linked coach"
  on public.goal_tracker_checkins
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.coach_clients cc
      where cc.coach_id = auth.uid()
        and cc.client_id = goal_tracker_checkins.user_id
        and cc.status = 'active'
    )
  );

drop policy if exists "Users manage their own goal checkins" on public.goal_tracker_checkins;
create policy "Users manage their own goal checkins"
  on public.goal_tracker_checkins
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
