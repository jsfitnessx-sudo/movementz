-- Movementz Phase 16: coach-safe client progress summary
-- Run after phase-15-tracker-completion.sql.

create or replace function public.get_coach_client_progress_summary(target_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  linked boolean;
  tracker_row jsonb;
  checkin_count integer := 0;
  photo_count integer := 0;
  photo_rows jsonb := '[]'::jsonb;
  checkin_rows jsonb := '[]'::jsonb;
  completed_tracker_rows jsonb := '[]'::jsonb;
  assigned_plan_rows jsonb := '[]'::jsonb;
  latest_workout_rows jsonb := '[]'::jsonb;
  latest_workout_row jsonb;
  record_session_rows jsonb := '[]'::jsonb;
  workout_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = target_client_id
      and cc.status = 'active'
  )
  into linked;

  if not linked then
    raise exception 'This client is not actively linked to this coach.';
  end if;

  select to_jsonb(gt)
  into tracker_row
  from (
    select
      id,
      goal_name,
      goal_type,
      gender,
      age,
      height_cm,
      activity_level,
      start_weight_kg,
      goal_weight_kg,
      deficit_style,
      maintenance_calories,
      target_calories,
      body_fat_percent,
      fat_kg,
      muscle_kg,
      neck_cm,
      chest_cm,
      waist_cm,
      hips_cm,
      left_bicep_cm,
      right_bicep_cm,
      left_thigh_cm,
      right_thigh_cm,
      duration_weeks,
      start_date,
      status,
      completed_at,
      archived_at,
      created_at
    from public.goal_trackers
    where user_id = target_client_id
      and status in ('active', 'completed', 'archived')
    order by
      case status when 'active' then 0 when 'completed' then 1 else 2 end,
      start_date desc,
      created_at desc
    limit 1
  ) gt;

  if tracker_row is not null then
    select count(*)
    into checkin_count
    from public.goal_tracker_checkins gtc
    where gtc.tracker_id = (tracker_row->>'id')::uuid;

    select coalesce(jsonb_agg(to_jsonb(checkin_item) order by checkin_item.week_number), '[]'::jsonb)
    into checkin_rows
    from (
      select
        id,
        week_number,
        checkin_date,
        weight_kg,
        body_fat_percent,
        fat_kg,
        muscle_kg,
        neck_cm,
        chest_cm,
        waist_cm,
        hips_cm,
        left_bicep_cm,
        right_bicep_cm,
        left_thigh_cm,
        right_thigh_cm,
        energy,
        mood,
        notes,
        photo_ids,
        created_at
      from public.goal_tracker_checkins
      where tracker_id = (tracker_row->>'id')::uuid
      order by week_number
      limit 20
    ) checkin_item;
  end if;

  select coalesce(jsonb_agg(to_jsonb(completed_tracker_item) order by completed_tracker_item.completed_at desc nulls last), '[]'::jsonb)
  into completed_tracker_rows
  from (
    select
      id,
      goal_name,
      goal_type,
      duration_weeks,
      start_date,
      status,
      completed_at,
      final_summary,
      created_at
    from public.goal_trackers
    where user_id = target_client_id
      and status in ('completed', 'archived')
      and final_summary is not null
    order by completed_at desc nulls last, created_at desc
    limit 6
  ) completed_tracker_item;

  select count(*)
  into photo_count
  from public.progress_photos pp
  where pp.user_id = target_client_id;

  select coalesce(jsonb_agg(to_jsonb(photo_item)), '[]'::jsonb)
  into photo_rows
  from (
    select
      id,
      pose,
      note,
      thumbnail_path,
      taken_at,
      created_at
    from public.progress_photos
    where user_id = target_client_id
    order by taken_at desc
    limit 6
  ) photo_item;

  select count(*)
  into workout_count
  from public.session_logs sl
  where sl.owner_id = target_client_id
    and sl.status = 'completed';

  select to_jsonb(workout_item)
  into latest_workout_row
  from (
    select
      id,
      name,
      workout_type,
      completed_at,
      duration_seconds,
      total_exercises,
      completed_sets,
      total_volume_kg,
      rating
    from public.session_logs
    where owner_id = target_client_id
      and status = 'completed'
    order by completed_at desc
    limit 1
  ) workout_item;

  select coalesce(jsonb_agg(to_jsonb(workout_item)), '[]'::jsonb)
  into latest_workout_rows
  from (
    select
      id,
      name,
      workout_type,
      completed_at,
      duration_seconds,
      total_exercises,
      completed_sets,
      total_volume_kg,
      rating
    from public.session_logs
    where owner_id = target_client_id
      and status = 'completed'
    order by completed_at desc
    limit 8
  ) workout_item;

  select coalesce(jsonb_agg(session_item order by (session_item->>'completed_at')::timestamptz desc nulls last), '[]'::jsonb)
  into record_session_rows
  from (
    select jsonb_build_object(
      'id', sl.id,
      'name', sl.name,
      'workout_type', sl.workout_type,
      'completed_at', sl.completed_at,
      'duration_seconds', sl.duration_seconds,
      'total_exercises', sl.total_exercises,
      'completed_sets', sl.completed_sets,
      'total_volume_kg', sl.total_volume_kg,
      'session_log_exercises', coalesce(exercise_rows.exercises, '[]'::jsonb)
    ) as session_item
    from public.session_logs sl
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sle.id,
        'exercise_name', sle.exercise_name,
        'split_duration_seconds', sle.split_duration_seconds,
        'session_log_sets', coalesce(set_rows.sets, '[]'::jsonb)
      ) order by sle.position), '[]'::jsonb) as exercises
      from public.session_log_exercises sle
      left join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', sls.id,
          'set_number', sls.set_number,
          'kg', sls.kg,
          'reps', sls.reps,
          'completed', sls.completed
        ) order by sls.set_number), '[]'::jsonb) as sets
        from public.session_log_sets sls
        where sls.session_exercise_id = sle.id
      ) set_rows on true
      where sle.session_id = sl.id
    ) exercise_rows on true
    where sl.owner_id = target_client_id
      and sl.status = 'completed'
    order by sl.completed_at desc
    limit 60
  ) sessions;

  select coalesce(jsonb_agg(plan_item), '[]'::jsonb)
  into assigned_plan_rows
  from (
    select jsonb_build_object(
      'assignment_id', tpa.id,
      'status', tpa.status,
      'assigned_at', tpa.created_at,
      'plan_id', tp.id,
      'name', tp.name,
      'plan_type', tp.plan_type,
      'block_weeks', tp.block_weeks,
      'created_at', tp.created_at,
      'workout_count', coalesce(plan_workouts.workout_count, 0),
      'scheduled_days', coalesce(plan_workouts.scheduled_days, '[]'::jsonb)
    ) as plan_item
    from public.training_plan_assignments tpa
    join public.training_plans tp on tp.id = tpa.plan_id
    left join lateral (
      select
        count(*) as workout_count,
        jsonb_agg(distinct day_value) filter (where day_value is not null) as scheduled_days
      from public.training_plan_workouts tpw
      left join lateral unnest(tpw.scheduled_days) as days(day_value) on true
      where tpw.plan_id = tp.id
    ) plan_workouts on true
    where tpa.client_id = target_client_id
      and tpa.assigned_by = auth.uid()
      and tpa.status = 'active'
    order by tpa.created_at desc
    limit 6
  ) plans;

  return jsonb_build_object(
    'tracker', tracker_row,
    'checkins', checkin_rows,
    'checkin_count', checkin_count,
    'photo_count', photo_count,
    'photos', photo_rows,
    'assigned_plans', assigned_plan_rows,
    'workout_count', workout_count,
    'latest_workout', latest_workout_row,
    'latest_workouts', latest_workout_rows,
    'record_sessions', record_session_rows,
    'completed_trackers', completed_tracker_rows,
    'prs', 0,
    'habits', '[]'::jsonb
  );
end;
$$;

grant execute on function public.get_coach_client_progress_summary(uuid) to authenticated;
