-- Movementz Phase 45: public workout ideas seed.
-- Run after phase-26-public-template-library.sql.
-- Current release seeds Beginner Gym x 5 and Strength x 5.

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
    and is_public_template = true;

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Beginner Gym 1 - Machine Full Body Start',
    'library:phase1; category:beginner_gym; A simple machine-based starter session for learning the gym floor. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Machine Chest Press', 'Chest', 3, 8, 12, 75, 'Keep shoulders down and press smoothly.'),
    (template_id, 2, 'Lat Pulldown', 'Back', 3, 8, 12, 75, 'Pull elbows toward your ribs.'),
    (template_id, 3, 'Leg Press', 'Legs', 3, 10, 12, 90, 'Lower with control and do not lock knees.'),
    (template_id, 4, 'Seated Leg Curl', 'Legs', 3, 10, 15, 60, 'Pause briefly at the squeeze.'),
    (template_id, 5, 'Cable Crunch', 'Core', 3, 10, 15, 60, 'Round through the ribs.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Beginner Gym 2 - Dumbbell Basics',
    'library:phase1; category:beginner_gym; A beginner dumbbell session using simple movement patterns. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Goblet Squat', 'Legs', 3, 8, 12, 90, 'Keep the dumbbell close to your chest.'),
    (template_id, 2, 'DB Flat Press', 'Chest', 3, 8, 12, 75, 'Control the dumbbells at the bottom.'),
    (template_id, 3, 'One Arm DB Row', 'Back', 3, 8, 12, 75, 'Pull toward the hip.'),
    (template_id, 4, 'DB Romanian Deadlift', 'Legs', 3, 8, 12, 90, 'Hinge from the hips with a flat back.'),
    (template_id, 5, 'DB Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Brace before each press.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Beginner Gym 3 - Lower Confidence',
    'library:phase1; category:beginner_gym; A lower-body beginner session for building leg and glute confidence. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Leg Press', 'Legs', 3, 10, 12, 90, 'Use a comfortable range of motion.'),
    (template_id, 2, 'Hip Thrust', 'Glutes', 3, 10, 12, 75, 'Pause at full hip extension.'),
    (template_id, 3, 'Seated Leg Curl', 'Legs', 3, 10, 15, 60, 'Control every rep.'),
    (template_id, 4, 'Leg Extension', 'Legs', 3, 10, 15, 60, 'Squeeze the quads at the top.'),
    (template_id, 5, 'Dead Bug', 'Core', 3, 8, 12, 45, 'Move slowly and keep ribs down.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Beginner Gym 4 - Upper Confidence',
    'library:phase1; category:beginner_gym; A beginner upper-body session using stable machines and cables. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Machine Chest Press', 'Chest', 3, 8, 12, 75, 'Keep your back against the pad.'),
    (template_id, 2, 'Seated Row', 'Back', 3, 8, 12, 75, 'Pull elbows back and squeeze.'),
    (template_id, 3, 'Lat Pulldown', 'Back', 3, 8, 12, 75, 'Keep the chest tall.'),
    (template_id, 4, 'DB Lateral Raise', 'Shoulders', 3, 10, 15, 60, 'Lift to shoulder height.'),
    (template_id, 5, 'Rope Triceps Pushdown', 'Triceps', 3, 10, 15, 60, 'Keep elbows tucked.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Beginner Gym 5 - Starter Circuit',
    'library:phase1; category:beginner_gym; A balanced beginner gym session with simple full-body exercises. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Chest Supported Row', 'Back', 3, 8, 12, 75, 'Keep chest on the pad.'),
    (template_id, 2, 'Goblet Squat', 'Legs', 3, 8, 12, 90, 'Stay tall through the torso.'),
    (template_id, 3, 'Incline Push Up', 'Chest', 3, 8, 12, 60, 'Use a bench height that feels controlled.'),
    (template_id, 4, 'Cable Face Pull', 'Shoulders', 3, 10, 15, 60, 'Pull toward eye level.'),
    (template_id, 5, 'Dead Bug', 'Core', 3, 8, 12, 45, 'Move slowly and keep ribs down.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Strength 1 - Push Base',
    'library:phase1; category:strength; A classic push strength session for chest, shoulders and triceps. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Barbell Bench Press', 'Chest', 3, 6, 8, 120, 'Use a strong setup and controlled bar path.'),
    (template_id, 2, 'Incline DB Press', 'Chest', 3, 8, 10, 90, 'Keep elbows slightly tucked.'),
    (template_id, 3, 'Machine Shoulder Press', 'Shoulders', 3, 8, 10, 90, 'Press without shrugging.'),
    (template_id, 4, 'Cable Lateral Raise', 'Shoulders', 3, 10, 15, 60, 'Lead with elbows.'),
    (template_id, 5, 'Rope Triceps Pushdown', 'Triceps', 3, 10, 15, 60, 'Lock out with control.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Strength 2 - Pull Base',
    'library:phase1; category:strength; A pull strength session for back, rear delts and biceps. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Lat Pulldown', 'Back', 3, 6, 10, 90, 'Drive elbows down.'),
    (template_id, 2, 'Barbell Row', 'Back', 3, 6, 10, 120, 'Brace before each rep.'),
    (template_id, 3, 'Seated Cable Row', 'Back', 3, 8, 12, 90, 'Pause at the squeeze.'),
    (template_id, 4, 'Rear Delt Fly', 'Shoulders', 3, 10, 15, 60, 'Keep the movement wide.'),
    (template_id, 5, 'EZ Bar Curl', 'Biceps', 3, 8, 12, 60, 'Keep elbows still.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Strength 3 - Leg Base',
    'library:phase1; category:strength; A strength-focused leg session built around squat and hinge patterns. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Back Squat', 'Legs', 3, 5, 8, 150, 'Brace and keep knees tracking.'),
    (template_id, 2, 'Romanian Deadlift', 'Legs', 3, 6, 10, 120, 'Push hips back and keep lats tight.'),
    (template_id, 3, 'Leg Press', 'Legs', 3, 8, 12, 90, 'Control the bottom.'),
    (template_id, 4, 'Walking Lunge', 'Legs', 3, 8, 10, 90, 'Count reps per leg.'),
    (template_id, 5, 'Standing Calf Raise', 'Calves', 3, 10, 15, 60, 'Pause at the top.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Strength 4 - Upper Strength Mix',
    'library:phase1; category:strength; A balanced upper-body strength session with push and pull work. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Incline Barbell Press', 'Chest', 3, 6, 8, 120, 'Press with a steady tempo.'),
    (template_id, 2, 'Chest Supported Row', 'Back', 3, 6, 10, 90, 'Pull elbows behind you.'),
    (template_id, 3, 'DB Shoulder Press', 'Shoulders', 3, 8, 10, 90, 'Avoid leaning back.'),
    (template_id, 4, 'Assisted Pull Up', 'Back', 3, 6, 10, 90, 'Use assistance that keeps reps clean.'),
    (template_id, 5, 'Cable Curl', 'Biceps', 3, 10, 12, 60, 'Control the lowering phase.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Strength 5 - Posterior Chain',
    'library:phase1; category:strength; A posterior-chain strength session for glutes, hamstrings and back. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Deadlift', 'Back', 3, 4, 6, 150, 'Set your brace before each pull.'),
    (template_id, 2, 'Hip Thrust', 'Glutes', 3, 8, 10, 120, 'Pause hard at the top.'),
    (template_id, 3, 'Seated Leg Curl', 'Legs', 3, 8, 12, 75, 'Control every rep.'),
    (template_id, 4, 'Back Extension', 'Back', 3, 10, 12, 75, 'Move through the hips.'),
    (template_id, 5, 'Cable Pull Through', 'Glutes', 3, 10, 15, 75, 'Hinge through the hips and squeeze glutes.');
end $$;

notify pgrst, 'reload schema';
