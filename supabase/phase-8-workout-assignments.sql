-- Movementz Phase 8: direct workout assignments
-- Run this after phase-1-auth-profiles.sql, phase-2-workout-library.sql, and phase-7-coach-client-links.sql.

create table if not exists public.coach_workout_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  workout_template_id uuid not null references public.workout_templates(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused', 'archived')),
  note text,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (coach_id, client_id, workout_template_id)
);

alter table public.coach_workout_assignments enable row level security;

drop policy if exists "Coaches manage linked workout assignments" on public.coach_workout_assignments;
drop policy if exists "Coaches manage own workout assignments" on public.coach_workout_assignments;
create policy "Coaches manage own workout assignments"
on public.coach_workout_assignments
for all
to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists "Clients view own workout assignments" on public.coach_workout_assignments;
create policy "Clients view own workout assignments"
on public.coach_workout_assignments
for select
to authenticated
using (client_id = auth.uid());

drop policy if exists "Clients update own workout assignment status" on public.coach_workout_assignments;
create policy "Clients update own workout assignment status"
on public.coach_workout_assignments
for update
to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

drop policy if exists "Clients view assigned workout templates" on public.workout_templates;
create policy "Clients view assigned workout templates"
on public.workout_templates
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_workout_assignments cwa
    where cwa.workout_template_id = workout_templates.id
      and cwa.client_id = auth.uid()
      and cwa.status = 'active'
  )
);

drop policy if exists "Clients view assigned workout exercises" on public.workout_template_exercises;
create policy "Clients view assigned workout exercises"
on public.workout_template_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_workout_assignments cwa
    where cwa.workout_template_id = workout_template_exercises.template_id
      and cwa.client_id = auth.uid()
      and cwa.status = 'active'
  )
);

create index if not exists coach_workout_assignments_coach_idx
  on public.coach_workout_assignments(coach_id, assigned_at desc);

create index if not exists coach_workout_assignments_client_idx
  on public.coach_workout_assignments(client_id, status, assigned_at desc);
