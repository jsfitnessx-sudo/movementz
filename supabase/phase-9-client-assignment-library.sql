-- Phase 9: Client assignment library helpers
-- Run this after Phase 8. These RPCs keep client assigned-work reads stable
-- without relying on nested PostgREST joins through assignment RLS policies.

create or replace function public.get_my_assigned_workouts()
returns table (
  assignment_id uuid,
  assignment_status text,
  assigned_at timestamptz,
  workout jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    cwa.id as assignment_id,
    cwa.status as assignment_status,
    cwa.assigned_at,
    jsonb_build_object(
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
      'workout_template_exercises', coalesce(exercises.items, '[]'::jsonb)
    ) as workout
  from public.coach_workout_assignments cwa
  join public.workout_templates wt on wt.id = cwa.workout_template_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', wte.id,
        'position', wte.position,
        'exercise_name', wte.exercise_name,
        'muscle_group', wte.muscle_group,
        'sets', wte.sets,
        'rep_min', wte.rep_min,
        'rep_max', wte.rep_max,
        'start_kg', wte.start_kg,
        'rest_seconds', wte.rest_seconds,
        'tip', wte.tip,
        'target_type', wte.target_type,
        'target_value', wte.target_value
      )
      order by wte.position
    ) as items
    from public.workout_template_exercises wte
    where wte.template_id = wt.id
  ) exercises on true
  where cwa.client_id = auth.uid()
    and cwa.status = 'active'
  order by cwa.assigned_at desc
  limit 50;
$$;

grant execute on function public.get_my_assigned_workouts() to authenticated;

create or replace function public.get_my_assigned_plans()
returns table (
  assignment_id uuid,
  assignment_status text,
  assigned_at timestamptz,
  plan jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    tpa.id as assignment_id,
    tpa.status as assignment_status,
    tpa.created_at as assigned_at,
    jsonb_build_object(
      'id', tp.id,
      'name', tp.name,
      'plan_type', tp.plan_type,
      'block_weeks', tp.block_weeks,
      'instructions', tp.instructions,
      'training_plan_workouts', coalesce(plan_workouts.items, '[]'::jsonb)
    ) as plan
  from public.training_plan_assignments tpa
  join public.training_plans tp on tp.id = tpa.plan_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', tpw.id,
        'workout_template_id', tpw.workout_template_id,
        'position', tpw.position,
        'name', tpw.name,
        'workout_type', tpw.workout_type,
        'source_type', tpw.source_type,
        'summary', tpw.summary,
        'scheduled_days', tpw.scheduled_days
      )
      order by tpw.position
    ) as items
    from public.training_plan_workouts tpw
    where tpw.plan_id = tp.id
  ) plan_workouts on true
  where tpa.client_id = auth.uid()
    and tpa.status = 'active'
  order by tpa.created_at desc
  limit 50;
$$;

grant execute on function public.get_my_assigned_plans() to authenticated;

create or replace function public.get_my_assigned_plan_workout(p_workout_template_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
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
    'workout_template_exercises', coalesce(exercises.items, '[]'::jsonb)
  )
  from public.training_plan_assignments tpa
  join public.training_plan_workouts tpw on tpw.plan_id = tpa.plan_id
  join public.workout_templates wt on wt.id = tpw.workout_template_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', wte.id,
        'position', wte.position,
        'exercise_name', wte.exercise_name,
        'muscle_group', wte.muscle_group,
        'sets', wte.sets,
        'rep_min', wte.rep_min,
        'rep_max', wte.rep_max,
        'start_kg', wte.start_kg,
        'rest_seconds', wte.rest_seconds,
        'tip', wte.tip,
        'target_type', wte.target_type,
        'target_value', wte.target_value
      )
      order by wte.position
    ) as items
    from public.workout_template_exercises wte
    where wte.template_id = wt.id
  ) exercises on true
  where tpa.client_id = auth.uid()
    and tpa.status = 'active'
    and tpw.workout_template_id = p_workout_template_id
  order by tpa.created_at desc, tpw.position asc
  limit 1;
$$;

grant execute on function public.get_my_assigned_plan_workout(uuid) to authenticated;
