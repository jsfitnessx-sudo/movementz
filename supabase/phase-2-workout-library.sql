create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  source_type text not null default 'personal'
    check (source_type in ('personal', 'coach_assigned', 'shared')),
  workout_type text not null default 'strength'
    check (workout_type in ('strength', 'home', 'hiit', 'run', 'cardio', 'other')),
  name text not null,
  notes text,
  is_template boolean not null default true,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  position integer not null default 1,
  exercise_name text not null,
  muscle_group text,
  sets integer not null default 3,
  rep_min integer,
  rep_max integer,
  start_kg numeric,
  rest_seconds integer,
  tip text,
  superset_group text,
  created_at timestamptz not null default now()
);

alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;

drop policy if exists "Users can view own workout templates" on public.workout_templates;
drop policy if exists "Users can create own workout templates" on public.workout_templates;
drop policy if exists "Users can update own workout templates" on public.workout_templates;
drop policy if exists "Users can delete own workout templates" on public.workout_templates;

create policy "Users can view own workout templates"
on public.workout_templates
for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own workout templates"
on public.workout_templates
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own workout templates"
on public.workout_templates
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own workout templates"
on public.workout_templates
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Users can view own workout template exercises" on public.workout_template_exercises;
drop policy if exists "Users can create own workout template exercises" on public.workout_template_exercises;
drop policy if exists "Users can update own workout template exercises" on public.workout_template_exercises;
drop policy if exists "Users can delete own workout template exercises" on public.workout_template_exercises;

create policy "Users can view own workout template exercises"
on public.workout_template_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.template_id
      and wt.owner_id = auth.uid()
  )
);

create policy "Users can create own workout template exercises"
on public.workout_template_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.template_id
      and wt.owner_id = auth.uid()
  )
);

create policy "Users can update own workout template exercises"
on public.workout_template_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.template_id
      and wt.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.template_id
      and wt.owner_id = auth.uid()
  )
);

create policy "Users can delete own workout template exercises"
on public.workout_template_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.template_id
      and wt.owner_id = auth.uid()
  )
);

create index if not exists workout_templates_owner_id_idx
  on public.workout_templates(owner_id, created_at desc);

create index if not exists workout_template_exercises_template_id_idx
  on public.workout_template_exercises(template_id, position);
