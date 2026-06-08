-- Movementz Phase 26: public workout template library.
-- Run after phase-2-workout-library.sql.

alter table public.workout_templates
  add column if not exists is_public_template boolean not null default false;

create index if not exists workout_templates_public_library_idx
  on public.workout_templates(is_public_template, workout_type, created_at desc)
  where status = 'active';

drop policy if exists "Authenticated users view public workout templates" on public.workout_templates;
create policy "Authenticated users view public workout templates"
on public.workout_templates
for select
to authenticated
using (is_public_template = true and status = 'active');

drop policy if exists "Authenticated users view public workout template exercises" on public.workout_template_exercises;
create policy "Authenticated users view public workout template exercises"
on public.workout_template_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.template_id
      and wt.is_public_template = true
      and wt.status = 'active'
  )
);

create or replace function public.get_public_workout_templates(template_kind text default 'all')
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(template_item order by template_item->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', wt.id,
      'name', wt.name,
      'notes', wt.notes,
      'workout_type', wt.workout_type,
      'hiit_timer_type', wt.hiit_timer_type,
      'hiit_rounds', wt.hiit_rounds,
      'hiit_work_seconds', wt.hiit_work_seconds,
      'hiit_rest_seconds', wt.hiit_rest_seconds,
      'hiit_station_rest_seconds', wt.hiit_station_rest_seconds,
      'hiit_countdown_seconds', wt.hiit_countdown_seconds,
      'hiit_goal_seconds', wt.hiit_goal_seconds,
      'hiit_focus_area', wt.hiit_focus_area,
      'created_at', wt.created_at,
      'exercise_count', coalesce(exercises.exercise_count, 0),
      'workout_template_exercises', coalesce(exercises.items, '[]'::jsonb)
    ) as template_item
    from public.workout_templates wt
    left join lateral (
      select
        count(*)::integer as exercise_count,
        jsonb_agg(jsonb_build_object(
          'id', wte.id,
          'position', wte.position,
          'exercise_name', wte.exercise_name,
          'muscle_group', wte.muscle_group,
          'sets', wte.sets,
          'rep_min', wte.rep_min,
          'rep_max', wte.rep_max,
          'target_type', wte.target_type,
          'target_value', wte.target_value
        ) order by wte.position) as items
      from public.workout_template_exercises wte
      where wte.template_id = wt.id
    ) exercises on true
    where wt.is_public_template = true
      and wt.status = 'active'
      and (
        coalesce(template_kind, 'all') = 'all'
        or wt.workout_type = template_kind
      )
    order by wt.created_at desc
    limit 60
  ) templates;
$$;

grant execute on function public.get_public_workout_templates(text) to authenticated;

create or replace function public.copy_public_workout_template(source_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_template public.workout_templates;
  new_template_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into source_template
  from public.workout_templates wt
  where wt.id = source_template_id
    and wt.is_public_template = true
    and wt.status = 'active';

  if source_template.id is null then
    raise exception 'Public template not found.';
  end if;

  insert into public.workout_templates (
    owner_id,
    created_by,
    source_type,
    name,
    notes,
    workout_type,
    hiit_timer_type,
    hiit_rounds,
    hiit_work_seconds,
    hiit_rest_seconds,
    hiit_station_rest_seconds,
    hiit_countdown_seconds,
    hiit_goal_seconds,
    hiit_focus_area,
    visibility,
    is_template,
    status
  )
  values (
    auth.uid(),
    source_template.owner_id,
    'shared',
    source_template.name,
    source_template.notes,
    source_template.workout_type,
    source_template.hiit_timer_type,
    source_template.hiit_rounds,
    source_template.hiit_work_seconds,
    source_template.hiit_rest_seconds,
    source_template.hiit_station_rest_seconds,
    source_template.hiit_countdown_seconds,
    source_template.hiit_goal_seconds,
    source_template.hiit_focus_area,
    'private',
    true,
    'active'
  )
  returning workout_templates.id into new_template_id;

  insert into public.workout_template_exercises (
    template_id,
    position,
    exercise_name,
    muscle_group,
    sets,
    rep_min,
    rep_max,
    start_kg,
    rest_seconds,
    tip,
    superset_group,
    target_type,
    target_value
  )
  select
    new_template_id,
    position,
    exercise_name,
    muscle_group,
    sets,
    rep_min,
    rep_max,
    start_kg,
    rest_seconds,
    tip,
    superset_group,
    target_type,
    target_value
  from public.workout_template_exercises
  where template_id = source_template_id
  order by position;

  return new_template_id;
end;
$$;

grant execute on function public.copy_public_workout_template(uuid) to authenticated;
