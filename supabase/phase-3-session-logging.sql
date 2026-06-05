create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workout_template_id uuid references public.workout_templates(id) on delete set null,
  name text not null,
  notes text,
  workout_type text not null default 'strength',
  status text not null default 'completed'
    check (status in ('completed', 'abandoned')),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  duration_seconds integer not null default 0,
  total_exercises integer not null default 0,
  completed_sets integer not null default 0,
  total_volume_kg numeric not null default 0,
  rating integer check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.session_log_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_logs(id) on delete cascade,
  workout_template_exercise_id uuid references public.workout_template_exercises(id) on delete set null,
  position integer not null default 1,
  exercise_name text not null,
  original_exercise_name text,
  muscle_group text,
  target_sets integer,
  target_rep_min integer,
  target_rep_max integer,
  skipped boolean not null default false,
  substituted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.session_log_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_log_exercises(id) on delete cascade,
  set_number integer not null,
  kg numeric,
  reps integer,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.session_logs enable row level security;
alter table public.session_log_exercises enable row level security;
alter table public.session_log_sets enable row level security;

drop policy if exists "Users manage own session logs" on public.session_logs;
create policy "Users manage own session logs"
on public.session_logs
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users view own session log exercises" on public.session_log_exercises;
drop policy if exists "Users create own session log exercises" on public.session_log_exercises;
create policy "Users view own session log exercises"
on public.session_log_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.session_logs sl
    where sl.id = session_log_exercises.session_id
      and sl.owner_id = auth.uid()
  )
);

create policy "Users create own session log exercises"
on public.session_log_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.session_logs sl
    where sl.id = session_log_exercises.session_id
      and sl.owner_id = auth.uid()
  )
);

drop policy if exists "Users view own session log sets" on public.session_log_sets;
drop policy if exists "Users create own session log sets" on public.session_log_sets;
create policy "Users view own session log sets"
on public.session_log_sets
for select
to authenticated
using (
  exists (
    select 1
    from public.session_log_exercises sle
    join public.session_logs sl on sl.id = sle.session_id
    where sle.id = session_log_sets.session_exercise_id
      and sl.owner_id = auth.uid()
  )
);

create policy "Users create own session log sets"
on public.session_log_sets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.session_log_exercises sle
    join public.session_logs sl on sl.id = sle.session_id
    where sle.id = session_log_sets.session_exercise_id
      and sl.owner_id = auth.uid()
  )
);

create index if not exists session_logs_owner_completed_idx
  on public.session_logs(owner_id, completed_at desc);

create index if not exists session_log_exercises_session_idx
  on public.session_log_exercises(session_id, position);

create index if not exists session_log_sets_exercise_idx
  on public.session_log_sets(session_exercise_id, set_number);
