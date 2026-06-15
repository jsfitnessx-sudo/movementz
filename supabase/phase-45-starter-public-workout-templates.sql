-- Movementz Phase 45: starter public workout templates.
-- Run after phase-26-public-template-library.sql.

do $$
declare
  template_owner uuid;
  template_id uuid;
begin
  select p.id
  into template_owner
  from public.profiles p
  where p.role = 'admin'
     or p.access_tier = 'admin'
     or lower(coalesce(p.email, '')) = 'jsfitnessx@gmail.com'
  order by case when lower(coalesce(p.email, '')) = 'jsfitnessx@gmail.com' then 0 else 1 end
  limit 1;

  if template_owner is null then
    raise exception 'Create or restore an admin profile before seeding public workout templates.';
  end if;

  delete from public.workout_templates
  where owner_id = template_owner
    and is_public_template = true
    and name in (
      'Beginner Full Body Machines',
      'Dumbbell Upper Body Starter',
      'Lower Body Foundation',
      'Low Impact HIIT Starter',
      'Glutes + Core Beginner'
    );

  insert into public.workout_templates (
    owner_id,
    created_by,
    source_type,
    workout_type,
    name,
    notes,
    visibility,
    is_template,
    is_public_template,
    status
  )
  values (
    template_owner,
    template_owner,
    'personal',
    'strength',
    'Beginner Full Body Machines',
    'Beginner gym template. Tags: beginner, full body, machines, strength. Copy this into your library before editing.',
    'private',
    true,
    true,
    'active'
  )
  returning id into template_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Machine Chest Press', 'Chest', 3, 8, 12, 75, 'Keep shoulders pinned and press smoothly.'),
    (template_id, 2, 'Lat Pulldown', 'Back', 3, 8, 12, 75, 'Pull elbows down toward ribs.'),
    (template_id, 3, 'Leg Press', 'Legs', 3, 10, 12, 90, 'Control the lowering phase.'),
    (template_id, 4, 'Seated Leg Curl', 'Legs', 3, 10, 15, 60, 'Pause briefly at the squeeze.'),
    (template_id, 5, 'DB Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Brace before each press.'),
    (template_id, 6, 'Cable Crunch', 'Core', 3, 10, 15, 60, 'Round through the ribs, not the hips.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner,
    template_owner,
    'personal',
    'strength',
    'Dumbbell Upper Body Starter',
    'Upper-body dumbbell template. Tags: beginner, dumbbell, upper body, strength. Copy this into your library before editing.',
    'private',
    true,
    true,
    'active'
  )
  returning id into template_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'DB Flat Press', 'Chest', 3, 8, 12, 75, 'Stop each rep with control.'),
    (template_id, 2, 'One Arm DB Row', 'Back', 3, 8, 12, 75, 'Pull to the hip.'),
    (template_id, 3, 'Incline DB Press', 'Chest', 3, 8, 12, 75, 'Keep elbows slightly tucked.'),
    (template_id, 4, 'DB Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Avoid arching the lower back.'),
    (template_id, 5, 'DB Curl', 'Biceps', 2, 10, 15, 60, 'Keep elbows still.'),
    (template_id, 6, 'Overhead DB Triceps Extension', 'Triceps', 2, 10, 15, 60, 'Move slowly behind the head.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner,
    template_owner,
    'personal',
    'strength',
    'Lower Body Foundation',
    'Lower-body template. Tags: beginner, lower body, legs, glutes, strength. Copy this into your library before editing.',
    'private',
    true,
    true,
    'active'
  )
  returning id into template_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Goblet Squat', 'Legs', 3, 8, 12, 90, 'Sit between the hips and stay tall.'),
    (template_id, 2, 'Romanian Deadlift', 'Legs', 3, 8, 12, 90, 'Hinge at the hips with soft knees.'),
    (template_id, 3, 'Walking Lunge', 'Legs', 3, 8, 10, 75, 'Count reps per leg.'),
    (template_id, 4, 'Hip Thrust', 'Glutes', 3, 10, 15, 75, 'Pause at full hip extension.'),
    (template_id, 5, 'Leg Extension', 'Legs', 2, 12, 15, 60, 'Control the top and bottom.');

  insert into public.workout_templates (
    owner_id,
    created_by,
    source_type,
    workout_type,
    hiit_timer_type,
    hiit_rounds,
    hiit_work_seconds,
    hiit_rest_seconds,
    hiit_countdown_seconds,
    hiit_focus_area,
    name,
    notes,
    visibility,
    is_template,
    is_public_template,
    status
  )
  values (
    template_owner,
    template_owner,
    'personal',
    'hiit',
    'interval',
    4,
    40,
    20,
    10,
    'Full Body',
    'Low Impact HIIT Starter',
    'Beginner HIIT template. Tags: beginner, hiit, conditioning, low impact, full body. Copy this into your library before editing.',
    'private',
    true,
    true,
    'active'
  )
  returning id into template_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, target_type, target_value, rest_seconds, tip)
  values
    (template_id, 1, 'Step Up', 'Lower', 4, null, null, 'reps', 10, 20, 'Alternate legs each rep.'),
    (template_id, 2, 'Banded Row', 'Upper', 4, null, null, 'reps', 12, 20, 'Squeeze shoulder blades.'),
    (template_id, 3, 'Bodyweight Squat', 'Lower', 4, null, null, 'reps', 12, 20, 'Smooth pace.'),
    (template_id, 4, 'Plank Shoulder Tap', 'Core', 4, null, null, 'reps', 12, 20, 'Keep hips steady.'),
    (template_id, 5, 'Marching Glute Bridge', 'Glutes', 4, null, null, 'reps', 10, 20, 'Alternate sides with control.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner,
    template_owner,
    'personal',
    'strength',
    'Glutes + Core Beginner',
    'Glutes and core template. Tags: beginner, glutes, booty, core, lower body. Copy this into your library before editing.',
    'private',
    true,
    true,
    'active'
  )
  returning id into template_id;

  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Hip Thrust', 'Glutes', 3, 10, 12, 75, 'Pause hard at the top.'),
    (template_id, 2, 'Banded Lateral Walk', 'Glutes', 3, 12, 15, 45, 'Small controlled steps.'),
    (template_id, 3, 'Bulgarian Split Squat', 'Legs', 3, 8, 10, 75, 'Count reps per leg.'),
    (template_id, 4, 'Cable Crunch', 'Core', 3, 10, 15, 60, 'Exhale as you crunch.'),
    (template_id, 5, 'Side Plank', 'Core', 3, 20, 30, 45, 'Hold seconds per side.');
end $$;

notify pgrst, 'reload schema';
