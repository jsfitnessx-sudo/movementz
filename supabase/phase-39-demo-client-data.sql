-- Movementz Phase 39: demo client history for Tom Salaivao and Coach Paid 7.
-- This is demo data only. It does not change app code.
--
-- Target client:
--   Tom Salaivao / joseph.sal79@gmail.com / 4867d9c1-50c2-471e-b2bd-0467d28c7368
-- Target coach:
--   Coach Paid 7 / metzmvmnt@gmail.com / 9066f8b6-b721-4491-b3ca-5b5a9cdf0a7c
--
-- Safe to rerun: it removes prior Movementz demo seed rows for this pair first,
-- then recreates a current 8-week demo block with 7 completed weeks.

do $$
declare
  demo_client_id uuid := '4867d9c1-50c2-471e-b2bd-0467d28c7368';
  demo_coach_id uuid := '9066f8b6-b721-4491-b3ca-5b5a9cdf0a7c';
  demo_start_date date := (current_date - interval '49 days')::date;
  demo_tracker_id uuid;
  demo_plan_id uuid;
  demo_upper_a_id uuid;
  demo_upper_b_id uuid;
  demo_lower_id uuid;
  demo_checkin_item_id uuid;
  week_index integer;
  workout_index integer;
  completed_date date;
  session_id uuid;
  exercise_id uuid;
  exercise_record record;
  set_index integer;
  set_kg numeric;
  set_reps integer;
  session_volume numeric;
begin
  if not exists (select 1 from auth.users where id = demo_client_id and lower(email) = 'joseph.sal79@gmail.com') then
    raise exception 'Tom client account not found with expected UID/email.';
  end if;

  if not exists (select 1 from auth.users where id = demo_coach_id and lower(email) = 'metzmvmnt@gmail.com') then
    raise exception 'Coach Paid 7 account not found with expected UID/email.';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    access_tier,
    admin_granted_paid_access
  )
  values (
    demo_client_id,
    'joseph.sal79@gmail.com',
    'Tom Salaivao',
    'client',
    'free',
    true
  )
  on conflict (id)
  do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = case
      when public.profiles.role in ('admin', 'coach') then public.profiles.role
      else 'client'
    end,
    admin_granted_paid_access = true,
    updated_at = now();

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    access_tier,
    subscription_status
  )
  values (
    demo_coach_id,
    'metzmvmnt@gmail.com',
    'Coach Paid 7',
    'coach',
    'coach',
    'active'
  )
  on conflict (id)
  do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    access_tier = 'coach',
    subscription_status = coalesce(nullif(public.profiles.subscription_status, ''), 'active'),
    updated_at = now();

  update public.profiles
  set role = 'client',
      access_tier = case
        when access_tier in ('coach', 'admin') then access_tier
        else 'free'
      end,
      admin_granted_paid_access = true,
      updated_at = now()
  where id = demo_client_id
    and role not in ('admin', 'coach');

  update public.profiles
  set access_tier = 'coach',
      subscription_status = coalesce(nullif(subscription_status, ''), 'active'),
      updated_at = now()
  where id = demo_coach_id
    and role <> 'admin';

  insert into public.coach_profiles (user_id, qualification, experience_areas, about_me, verification_status)
  values (
    demo_coach_id,
    'Movementz demo coach',
    array['Strength Training', 'Weightloss', 'Hyrox'],
    'Demo coach profile used to show a fully populated client journey.',
    'verified'
  )
  on conflict (user_id)
  do update set
    verification_status = 'verified',
    updated_at = now();

  insert into public.coach_clients (coach_id, client_id, status)
  values (demo_coach_id, demo_client_id, 'active')
  on conflict on constraint coach_clients_coach_id_client_id_key
  do update set status = 'active';

  -- Remove prior seeded demo rows for a clean rerun.
  delete from public.session_logs
  where owner_id = demo_client_id
    and comment = 'Movementz demo seed';

  delete from public.goal_trackers
  where user_id = demo_client_id
    and goal_name = 'Demo 8 Week Weight Loss Block';

  delete from public.training_plans
  where owner_id = demo_coach_id
    and instructions like '%Movementz demo seed%';

  delete from public.workout_templates
  where (owner_id = demo_client_id or owner_id = demo_coach_id)
    and notes like '%Movementz demo seed%';

  delete from public.daily_habit_logs
  where user_id = demo_client_id
    and log_date between demo_start_date and current_date;

  delete from public.daily_mindset_logs
  where user_id = demo_client_id
    and log_date between demo_start_date and current_date;

  delete from public.food_log_entries
  where user_id = demo_client_id
    and log_date between demo_start_date and current_date;

  delete from public.food_day_targets
  where user_id = demo_client_id
    and target_date between demo_start_date and current_date;

  delete from public.food_month_targets
  where user_id = demo_client_id
    and month_start between date_trunc('month', demo_start_date)::date and date_trunc('month', current_date)::date;

  delete from public.coach_calendar_items
  where coach_id = demo_coach_id
    and client_id = demo_client_id
    and title = 'Demo Weekly Check-In';

  -- Three coach-created templates assigned to the client.
  insert into public.workout_templates (owner_id, created_by, source_type, workout_type, name, notes, visibility)
  values (demo_coach_id, demo_coach_id, 'coach_assigned', 'strength', 'Demo Upper Body A', 'Movementz demo seed - progressive upper body day A.', 'private')
  returning id into demo_upper_a_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, start_kg, rest_seconds)
  values
    (demo_upper_a_id, 1, 'Barbell Bench Press', 'Chest', 3, 8, 10, 70, 90),
    (demo_upper_a_id, 2, 'Incline DB Press', 'Chest', 3, 10, 12, 24, 75),
    (demo_upper_a_id, 3, 'Seated Cable Row', 'Back', 3, 10, 12, 55, 75),
    (demo_upper_a_id, 4, 'Triceps Pushdown', 'Triceps', 3, 12, 15, 32, 60);

  insert into public.workout_templates (owner_id, created_by, source_type, workout_type, name, notes, visibility)
  values (demo_coach_id, demo_coach_id, 'coach_assigned', 'strength', 'Demo Upper Body B', 'Movementz demo seed - progressive upper body day B.', 'private')
  returning id into demo_upper_b_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, start_kg, rest_seconds)
  values
    (demo_upper_b_id, 1, 'Overhead Press', 'Shoulders', 3, 8, 10, 40, 90),
    (demo_upper_b_id, 2, 'Lat Pulldown', 'Back', 3, 10, 12, 58, 75),
    (demo_upper_b_id, 3, 'One Arm DB Row', 'Back', 3, 10, 12, 30, 75),
    (demo_upper_b_id, 4, 'DB Bicep Curl', 'Biceps', 3, 12, 15, 14, 60);

  insert into public.workout_templates (owner_id, created_by, source_type, workout_type, name, notes, visibility)
  values (demo_coach_id, demo_coach_id, 'coach_assigned', 'strength', 'Demo Lower Body', 'Movementz demo seed - progressive lower body day.', 'private')
  returning id into demo_lower_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, start_kg, rest_seconds)
  values
    (demo_lower_id, 1, 'Back Squat', 'Legs', 3, 8, 10, 90, 120),
    (demo_lower_id, 2, 'Romanian Deadlift', 'Hamstrings', 3, 8, 10, 85, 120),
    (demo_lower_id, 3, 'Leg Press', 'Legs', 3, 10, 12, 160, 90),
    (demo_lower_id, 4, 'Seated Leg Curl', 'Hamstrings', 3, 12, 15, 45, 60);

  insert into public.coach_workout_assignments (coach_id, client_id, workout_template_id, status, note, assigned_at)
  values
    (demo_coach_id, demo_client_id, demo_upper_a_id, 'active', 'Demo assignment - Monday upper body progression.', demo_start_date),
    (demo_coach_id, demo_client_id, demo_upper_b_id, 'active', 'Demo assignment - Wednesday upper body progression.', demo_start_date),
    (demo_coach_id, demo_client_id, demo_lower_id, 'active', 'Demo assignment - Friday lower body progression.', demo_start_date)
  on conflict on constraint coach_workout_assignments_coach_id_client_id_workout_template_id_key
  do update set status = 'active', note = excluded.note;

  insert into public.training_plans (owner_id, name, plan_type, block_weeks, instructions, created_at)
  values (
    demo_coach_id,
    'Tom Demo 8 Week Strength + Fat Loss Block',
    'block',
    8,
    'Movementz demo seed. Three progressive strength sessions per week with weekly tracker check-ins.',
    demo_start_date
  )
  returning id into demo_plan_id;

  insert into public.training_plan_workouts (plan_id, workout_template_id, position, name, workout_type, source_type, summary, scheduled_days)
  values
    (demo_plan_id, demo_upper_a_id, 1, 'Upper Body A', 'strength', 'imported', 'Horizontal push/pull strength focus.', array['Monday']),
    (demo_plan_id, demo_upper_b_id, 2, 'Upper Body B', 'strength', 'imported', 'Vertical push/pull and arms.', array['Wednesday']),
    (demo_plan_id, demo_lower_id, 3, 'Lower Body', 'strength', 'imported', 'Squat, hinge and leg accessory work.', array['Friday']);

  insert into public.training_plan_assignments (plan_id, client_id, assigned_by, status, created_at)
  values (demo_plan_id, demo_client_id, demo_coach_id, 'active', demo_start_date)
  on conflict (plan_id, client_id)
  do update set status = 'active';

  -- Active tracker with 7 of 8 weeks completed.
  insert into public.goal_trackers (
    user_id,
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
    status
  )
  values (
    demo_client_id,
    'Demo 8 Week Weight Loss Block',
    'lose_weight',
    'Male',
    47,
    178,
    'moderate',
    102.4,
    96.0,
    'moderate',
    2850,
    2300,
    31.0,
    31.7,
    70.7,
    41.0,
    112.0,
    108.0,
    111.0,
    36.0,
    36.2,
    63.0,
    63.5,
    8,
    demo_start_date,
    'active'
  )
  returning id into demo_tracker_id;

  for week_index in 1..7 loop
    insert into public.goal_tracker_checkins (
      tracker_id,
      user_id,
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
      notes
    )
    values (
      demo_tracker_id,
      demo_client_id,
      week_index,
      demo_start_date + ((week_index - 1) * 7 + 6),
      case week_index
        when 1 then 101.8
        when 2 then 100.9
        when 3 then 101.2
        when 4 then 99.7
        when 5 then 98.9
        when 6 then 98.2
        else 97.4
      end,
      case week_index
        when 1 then 30.5
        when 2 then 30.0
        when 3 then 30.2
        when 4 then 29.1
        when 5 then 28.7
        when 6 then 28.2
        else 27.8
      end,
      case week_index
        when 1 then 31.0
        when 2 then 30.3
        when 3 then 30.6
        when 4 then 29.0
        when 5 then 28.4
        when 6 then 27.7
        else 27.1
      end,
      case week_index
        when 1 then 70.8
        when 2 then 70.6
        when 3 then 70.6
        when 4 then 70.7
        when 5 then 70.5
        when 6 then 70.5
        else 70.3
      end,
      40.8 - (week_index * 0.08),
      111.6 - (week_index * 0.35),
      107.4 - (week_index * 1.05),
      110.6 - (week_index * 0.55),
      36.0 + (week_index * 0.03),
      36.2 + (week_index * 0.03),
      63.0 - (week_index * 0.18),
      63.5 - (week_index * 0.18),
      case when week_index in (3, 6) then 3 else 4 end,
      case when week_index in (2, 5, 7) then 5 else 4 end,
      'Demo check-in week ' || week_index || ': weight trending down with normal fluctuations; training consistency strong.'
    );
  end loop;

  -- Completed workout history.
  for week_index in 1..7 loop
    for workout_index in 1..3 loop
      completed_date := demo_start_date + ((week_index - 1) * 7) + case workout_index when 1 then 1 when 2 then 3 else 5 end;
      session_volume := 0;

      insert into public.session_logs (
        owner_id,
        workout_template_id,
        name,
        notes,
        workout_type,
        status,
        started_at,
        completed_at,
        duration_seconds,
        total_exercises,
        completed_sets,
        total_volume_kg,
        rating,
        comment
      )
      values (
        demo_client_id,
        case workout_index when 1 then demo_upper_a_id when 2 then demo_upper_b_id else demo_lower_id end,
        case workout_index when 1 then 'Upper Body A' when 2 then 'Upper Body B' else 'Lower Body' end,
        'Movementz demo seed session. Progressive overload and adherence demo.',
        'strength',
        'completed',
        completed_date + time '06:30',
        completed_date + time '07:28',
        3300 + (workout_index * 120) + (week_index * 35),
        4,
        12,
        0,
        case when week_index >= 5 then 5 else 4 end,
        'Movementz demo seed'
      )
      returning id into session_id;

      for exercise_record in
        select *
        from (
          values
            (1, 'Barbell Bench Press', 'Chest', 70, 8, 1),
            (2, 'Incline DB Press', 'Chest', 24, 10, 1),
            (3, 'Seated Cable Row', 'Back', 55, 10, 1),
            (4, 'Triceps Pushdown', 'Triceps', 32, 12, 1),
            (1, 'Overhead Press', 'Shoulders', 40, 8, 2),
            (2, 'Lat Pulldown', 'Back', 58, 10, 2),
            (3, 'One Arm DB Row', 'Back', 30, 10, 2),
            (4, 'DB Bicep Curl', 'Biceps', 14, 12, 2),
            (1, 'Back Squat', 'Legs', 90, 8, 3),
            (2, 'Romanian Deadlift', 'Hamstrings', 85, 8, 3),
            (3, 'Leg Press', 'Legs', 160, 10, 3),
            (4, 'Seated Leg Curl', 'Hamstrings', 45, 12, 3)
        ) as exercise_seed(position, exercise_name, muscle_group, base_kg, base_reps, workout_slot)
        where workout_slot = workout_index
        order by position
      loop
        insert into public.session_log_exercises (
          session_id,
          position,
          exercise_name,
          muscle_group,
          target_sets,
          target_rep_min,
          target_rep_max
        )
        values (
          session_id,
          exercise_record.position,
          exercise_record.exercise_name,
          exercise_record.muscle_group,
          3,
          exercise_record.base_reps,
          exercise_record.base_reps + 2
        )
        returning id into exercise_id;

        for set_index in 1..3 loop
          set_kg := exercise_record.base_kg + ((week_index - 1) * case when exercise_record.base_kg >= 80 then 2.5 else 1.25 end) + ((set_index - 2) * 1.25);
          set_reps := greatest(6, exercise_record.base_reps + case when set_index = 1 then 2 when set_index = 2 then 1 else 0 end - case when week_index in (3, 6) and set_index = 3 then 1 else 0 end);
          session_volume := session_volume + (set_kg * set_reps);

          insert into public.session_log_sets (session_exercise_id, set_number, kg, reps, completed)
          values (exercise_id, set_index, round(set_kg, 1), set_reps, true);
        end loop;
      end loop;

      update public.session_logs
      set total_volume_kg = round(session_volume, 1)
      where id = session_id;
    end loop;
  end loop;

  -- Daily habits, mindset and gratitude for the last 49 days.
  for week_index in 0..48 loop
    insert into public.daily_habit_logs (
      user_id,
      log_date,
      completion_percent,
      workout_completed,
      steps,
      water_liters,
      protein_g,
      sleep_hours,
      nutrition_compliance,
      mindset
    )
    values (
      demo_client_id,
      demo_start_date + week_index,
      case when extract(dow from demo_start_date + week_index) in (0, 6) then 75 else 90 end,
      extract(dow from demo_start_date + week_index) in (1, 3, 5),
      7800 + ((week_index % 9) * 430),
      2.4 + ((week_index % 4) * 0.15),
      155 + ((week_index % 5) * 7),
      6.4 + ((week_index % 6) * 0.18),
      case when week_index % 8 = 0 then 'mostly' else 'yes' end,
      jsonb_build_object(
        'gratitude', true,
        'personal_development', week_index % 2 = 0,
        'mindfulness', week_index % 3 <> 0,
        'positive_checkin', true,
        'daily_win', week_index % 4 <> 0
      )
    );

    insert into public.daily_mindset_logs (
      user_id,
      log_date,
      mood_score,
      mood_note,
      support_need,
      affirmation,
      weekly_focus,
      morning_focus,
      affirmation_themes,
      support_tags,
      gratitude,
      reflection
    )
    values (
      demo_client_id,
      demo_start_date + week_index,
      case when week_index % 11 = 0 then 3 when week_index % 7 = 0 then 4 else 5 end,
      'Demo mood log: focused and building confidence through consistent actions.',
      case when week_index % 13 = 0 then 'Could use a reminder to plan meals before busy days.' else null end,
      'I follow through on the actions that move me forward.',
      'Hit the sessions, hit protein, stay patient.',
      'Complete today''s checklist before dinner.',
      array['confidence', 'discipline'],
      array['nutrition', 'training'],
      case week_index % 5
        when 0 then 'Grateful for feeling stronger in the gym.'
        when 1 then 'Grateful for having a coach keeping me accountable.'
        when 2 then 'Grateful for better energy this week.'
        when 3 then 'Grateful for staying consistent even when busy.'
        else 'Grateful for the progress showing in the data.'
      end,
      'Demo reflection: small improvements are adding up.'
    );
  end loop;

  -- Food targets and realistic recent food logs.
  insert into public.food_month_targets (user_id, month_start, target_calories)
  select demo_client_id, month_start::date, 2300
  from generate_series(date_trunc('month', demo_start_date)::date, date_trunc('month', current_date)::date, interval '1 month') month_start
  on conflict (user_id, month_start)
  do update set target_calories = excluded.target_calories, updated_at = now();

  insert into public.food_day_targets (user_id, target_date, target_calories)
  select demo_client_id, day_value::date, 2300
  from generate_series(demo_start_date, current_date, interval '1 day') day_value
  on conflict (user_id, target_date)
  do update set target_calories = excluded.target_calories, updated_at = now();

  for week_index in 0..48 loop
    insert into public.food_log_entries (user_id, log_date, meal_type, food_name, quantity, unit, calories, protein_g, carbs_g, fat_g)
    values
      (demo_client_id, demo_start_date + week_index, 'breakfast', 'Oats, whey and banana', 1, 'serving', 520 + (week_index % 3) * 20, 42, 72, 9),
      (demo_client_id, demo_start_date + week_index, 'lunch', 'Chicken breast rice bowl', 1, 'serving', 650 + (week_index % 4) * 25, 58, 78, 12),
      (demo_client_id, demo_start_date + week_index, 'dinner', 'Lean beef mince with sweet potato', 1, 'serving', 740 + (week_index % 5) * 18, 55, 70, 24),
      (demo_client_id, demo_start_date + week_index, 'snack', 'Greek yoghurt and berries', 1, 'serving', 260 + (week_index % 2) * 30, 28, 26, 4);
  end loop;

  -- Recent coach check-ins so the coach client view has responses to inspect.
  insert into public.coach_calendar_items (
    coach_id,
    client_id,
    item_type,
    title,
    notes,
    starts_at,
    ends_at,
    status,
    recurrence_frequency,
    recurrence_until,
    checkin_questions
  )
  values (
    demo_coach_id,
    demo_client_id,
    'checkin',
    'Demo Weekly Check-In',
    'Movementz demo seed weekly check-in for Tom.',
    demo_start_date + time '09:00',
    demo_start_date + time '09:15',
    'scheduled',
    'weekly',
    (demo_start_date + interval '8 weeks')::date,
    jsonb_build_array(
      jsonb_build_object('id', 'energy', 'label', 'Energy this week', 'type', 'rating'),
      jsonb_build_object('id', 'mood', 'label', 'Mood this week', 'type', 'rating'),
      jsonb_build_object('id', 'win', 'label', 'Biggest win', 'type', 'text'),
      jsonb_build_object('id', 'challenge', 'label', 'Biggest challenge', 'type', 'text'),
      jsonb_build_object('id', 'question', 'label', 'Question for coach', 'type', 'text')
    )
  )
  returning id into demo_checkin_item_id;

  for week_index in 4..7 loop
    insert into public.coach_checkin_responses (
      calendar_item_id,
      coach_id,
      client_id,
      occurrence_date,
      responses,
      notes,
      submitted_at
    )
    values (
      demo_checkin_item_id,
      demo_coach_id,
      demo_client_id,
      demo_start_date + ((week_index - 1) * 7 + 6),
      jsonb_build_object(
        'energy', case when week_index = 6 then 3 else 4 end,
        'mood', case when week_index = 7 then 5 else 4 end,
        'win', 'Hit all three planned workouts and weight is trending down.',
        'challenge', case when week_index = 6 then 'Sleep was a little low during a busy work week.' else 'Managing hunger late at night.' end,
        'question', 'Should we adjust calories if weight drops too fast next week?'
      ),
      'Demo submitted check-in for week ' || week_index || '.',
      demo_start_date + ((week_index - 1) * 7 + 6) + time '18:30'
    );
  end loop;

  raise notice 'Movementz demo client data loaded for Tom Salaivao and Coach Paid 7.';
end $$;

-- Optional verification after running:
-- select count(*) as demo_sessions
-- from public.session_logs
-- where owner_id = '4867d9c1-50c2-471e-b2bd-0467d28c7368'
--   and comment = 'Movementz demo seed';
--
-- select count(*) as tracker_checkins
-- from public.goal_tracker_checkins
-- where user_id = '4867d9c1-50c2-471e-b2bd-0467d28c7368';
--
-- select count(*) as habit_days
-- from public.daily_habit_logs
-- where user_id = '4867d9c1-50c2-471e-b2bd-0467d28c7368';
