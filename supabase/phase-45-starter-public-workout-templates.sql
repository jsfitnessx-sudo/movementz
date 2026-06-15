-- Movementz Phase 45: public workout ideas seed.
-- Run after phase-26-public-template-library.sql.
-- Current release seeds Beginner Gym, Strength, HIIT, Upper Body, Lower Body and Full Body x 5 each.

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

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, hiit_timer_type, hiit_rounds, hiit_work_seconds, hiit_rest_seconds, hiit_countdown_seconds, hiit_focus_area, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'hiit', 'interval', 3, 40, 20, 10, 'Full Body',
    'HIIT 1 - Low Impact Sweat',
    'library:phase1; category:hiit; A low-impact HIIT workout for conditioning without jumping. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, target_type, target_value, rest_seconds, tip)
  values
    (template_id, 1, 'Step Up', 'Legs', 3, null, null, 'reps', 10, 20, 'Alternate legs each rep.'),
    (template_id, 2, 'Incline Push Up', 'Chest', 3, null, null, 'reps', 10, 20, 'Use a height that keeps reps clean.'),
    (template_id, 3, 'Banded Row', 'Back', 3, null, null, 'reps', 12, 20, 'Squeeze shoulder blades.'),
    (template_id, 4, 'Bodyweight Squat', 'Legs', 3, null, null, 'reps', 12, 20, 'Keep the pace smooth.'),
    (template_id, 5, 'Dead Bug', 'Core', 3, null, null, 'reps', 10, 20, 'Count reps per side.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, hiit_timer_type, hiit_rounds, hiit_work_seconds, hiit_rest_seconds, hiit_countdown_seconds, hiit_focus_area, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'hiit', 'interval', 3, 40, 20, 10, 'Lower',
    'HIIT 2 - Legs and Lungs',
    'library:phase1; category:hiit; A lower-body HIIT workout for legs, glutes and conditioning. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, target_type, target_value, rest_seconds, tip)
  values
    (template_id, 1, 'Goblet Squat', 'Legs', 3, null, null, 'reps', 12, 20, 'Use a steady full range.'),
    (template_id, 2, 'Reverse Lunge', 'Legs', 3, null, null, 'reps', 10, 20, 'Count reps per leg.'),
    (template_id, 3, 'Hip Thrust', 'Glutes', 3, null, null, 'reps', 12, 20, 'Pause at the top.'),
    (template_id, 4, 'DB Romanian Deadlift', 'Legs', 3, null, null, 'reps', 10, 20, 'Hinge with control.'),
    (template_id, 5, 'Mountain Climber', 'Core', 3, null, null, 'reps', 20, 20, 'Keep hips steady.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, hiit_timer_type, hiit_rounds, hiit_work_seconds, hiit_rest_seconds, hiit_countdown_seconds, hiit_focus_area, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'hiit', 'interval', 3, 35, 25, 10, 'Upper',
    'HIIT 3 - Upper Pump Conditioning',
    'library:phase1; category:hiit; An upper-body HIIT workout mixing push, pull and core work. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, target_type, target_value, rest_seconds, tip)
  values
    (template_id, 1, 'DB Push Press', 'Shoulders', 3, null, null, 'reps', 10, 25, 'Drive with legs then press.'),
    (template_id, 2, 'Renegade Row', 'Back', 3, null, null, 'reps', 8, 25, 'Count reps per side.'),
    (template_id, 3, 'Push Up', 'Chest', 3, null, null, 'reps', 10, 25, 'Use knees if needed.'),
    (template_id, 4, 'DB Curl to Press', 'Shoulders', 3, null, null, 'reps', 10, 25, 'Move smoothly.'),
    (template_id, 5, 'Plank Shoulder Tap', 'Core', 3, null, null, 'reps', 12, 25, 'Keep hips quiet.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, hiit_timer_type, hiit_rounds, hiit_work_seconds, hiit_rest_seconds, hiit_countdown_seconds, hiit_focus_area, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'hiit', 'for_time', 3, null, null, 10, 'Cardio',
    'HIIT 4 - Gym Floor For Time',
    'library:phase1; category:hiit; A simple for-time gym floor workout using cardio and bodyweight stations. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, target_type, target_value, rest_seconds, tip)
  values
    (template_id, 1, 'Treadmill Run', 'Cardio', 3, null, null, 'meters', 300, 30, 'Run or walk fast.'),
    (template_id, 2, 'Kettlebell Swing', 'Glutes', 3, null, null, 'reps', 15, 30, 'Snap hips, not arms.'),
    (template_id, 3, 'Box Step Over', 'Legs', 3, null, null, 'reps', 12, 30, 'Move with control.'),
    (template_id, 4, 'Ski Erg', 'Cardio', 3, null, null, 'meters', 200, 30, 'Strong pulls, steady rhythm.'),
    (template_id, 5, 'Sit Up', 'Core', 3, null, null, 'reps', 15, 30, 'Use a smooth pace.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, hiit_timer_type, hiit_rounds, hiit_work_seconds, hiit_rest_seconds, hiit_countdown_seconds, hiit_focus_area, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'hiit', 'interval', 3, 40, 15, 10, 'Full Body',
    'HIIT 5 - Full Body Burner',
    'library:phase1; category:hiit; A full-body HIIT workout for a stronger conditioning push. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, target_type, target_value, rest_seconds, tip)
  values
    (template_id, 1, 'DB Thruster', 'Full Body', 3, null, null, 'reps', 10, 15, 'Squat then press overhead.'),
    (template_id, 2, 'Burpee', 'Full Body', 3, null, null, 'reps', 8, 15, 'Step back instead of jumping if needed.'),
    (template_id, 3, 'Alternating DB Snatch', 'Full Body', 3, null, null, 'reps', 10, 15, 'Count total reps.'),
    (template_id, 4, 'Shuttle Run', 'Cardio', 3, null, null, 'meters', 100, 15, 'Turn under control.'),
    (template_id, 5, 'Russian Twist', 'Core', 3, null, null, 'reps', 20, 15, 'Rotate through the torso.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Upper Body 1 - Chest and Back Starter',
    'library:phase1; category:upper_body; An upper-body workout balancing chest and back. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'DB Flat Press', 'Chest', 3, 8, 12, 75, 'Control the bottom.'),
    (template_id, 2, 'Lat Pulldown', 'Back', 3, 8, 12, 75, 'Pull elbows down.'),
    (template_id, 3, 'Incline DB Press', 'Chest', 3, 8, 12, 75, 'Keep elbows tucked.'),
    (template_id, 4, 'Seated Row', 'Back', 3, 8, 12, 75, 'Pause at the squeeze.'),
    (template_id, 5, 'Cable Face Pull', 'Shoulders', 3, 10, 15, 60, 'Pull toward eye level.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Upper Body 2 - Shoulders and Arms',
    'library:phase1; category:upper_body; A shoulder and arm focused upper-body workout. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'DB Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Brace before pressing.'),
    (template_id, 2, 'DB Lateral Raise', 'Shoulders', 3, 10, 15, 60, 'Lift to shoulder height.'),
    (template_id, 3, 'Rear Delt Fly', 'Shoulders', 3, 10, 15, 60, 'Keep arms wide.'),
    (template_id, 4, 'DB Curl', 'Biceps', 3, 10, 12, 60, 'Keep elbows still.'),
    (template_id, 5, 'Overhead DB Triceps Extension', 'Triceps', 3, 10, 12, 60, 'Move slowly behind the head.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Upper Body 3 - Push Focus',
    'library:phase1; category:upper_body; An upper-body push workout for chest, shoulders and triceps. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Machine Chest Press', 'Chest', 3, 8, 12, 75, 'Keep shoulders pinned.'),
    (template_id, 2, 'Incline DB Press', 'Chest', 3, 8, 12, 75, 'Press smoothly.'),
    (template_id, 3, 'Machine Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Avoid shrugging.'),
    (template_id, 4, 'Cable Fly', 'Chest', 3, 10, 15, 60, 'Squeeze at the front.'),
    (template_id, 5, 'Rope Triceps Pushdown', 'Triceps', 3, 10, 15, 60, 'Lock out with control.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Upper Body 4 - Pull Focus',
    'library:phase1; category:upper_body; An upper-body pull workout for back, rear delts and biceps. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Assisted Pull Up', 'Back', 3, 6, 10, 90, 'Use clean reps.'),
    (template_id, 2, 'Chest Supported Row', 'Back', 3, 8, 12, 75, 'Pull elbows behind you.'),
    (template_id, 3, 'Straight Arm Pulldown', 'Back', 3, 10, 15, 60, 'Keep arms nearly straight.'),
    (template_id, 4, 'Cable Face Pull', 'Shoulders', 3, 10, 15, 60, 'Pull toward eyes.'),
    (template_id, 5, 'Hammer Curl', 'Biceps', 3, 10, 12, 60, 'Keep wrists neutral.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Upper Body 5 - Dumbbell Only',
    'library:phase1; category:upper_body; A dumbbell-only upper-body workout for simple gym or home setup. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'DB Flat Press', 'Chest', 3, 8, 12, 75, 'Keep wrists stacked.'),
    (template_id, 2, 'One Arm DB Row', 'Back', 3, 8, 12, 75, 'Count reps per side.'),
    (template_id, 3, 'DB Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Press without leaning back.'),
    (template_id, 4, 'DB Lateral Raise', 'Shoulders', 3, 10, 15, 60, 'Use light control.'),
    (template_id, 5, 'DB Curl', 'Biceps', 3, 10, 12, 60, 'Control the lowering phase.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Lower Body 1 - Quad Builder',
    'library:phase1; category:lower_body; A lower-body workout focused on quads with supporting hamstring and calf work. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Leg Press', 'Legs', 3, 8, 12, 90, 'Use a stance that lets knees track cleanly.'),
    (template_id, 2, 'DB Goblet Squat', 'Legs', 3, 8, 12, 75, 'Keep chest tall and depth comfortable.'),
    (template_id, 3, 'Leg Extension', 'Legs', 3, 10, 15, 60, 'Squeeze the quads at the top.'),
    (template_id, 4, 'Seated Leg Curl', 'Legs', 3, 10, 15, 60, 'Control the return.'),
    (template_id, 5, 'Standing Calf Raise', 'Calves', 3, 10, 15, 60, 'Pause at the top and bottom.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Lower Body 2 - Glute and Hamstring Base',
    'library:phase1; category:lower_body; A lower-body session built around glutes, hamstrings and strong hip hinges. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Hip Thrust', 'Glutes', 3, 8, 12, 90, 'Pause briefly at full hip extension.'),
    (template_id, 2, 'Romanian Deadlift', 'Legs', 3, 8, 12, 90, 'Push hips back and keep lats tight.'),
    (template_id, 3, 'Lying Leg Curl', 'Legs', 3, 10, 15, 60, 'Keep hips down on the pad.'),
    (template_id, 4, 'Cable Pull Through', 'Glutes', 3, 10, 15, 75, 'Hinge through the hips.'),
    (template_id, 5, 'Glute Bridge Abduction', 'Glutes', 3, 12, 15, 60, 'Keep tension on the band.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Lower Body 3 - Dumbbell Legs',
    'library:phase1; category:lower_body; A dumbbell lower-body workout for legs and glutes without machines. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'DB Romanian Deadlift', 'Legs', 3, 8, 12, 75, 'Keep dumbbells close to your legs.'),
    (template_id, 2, 'DB Reverse Lunge', 'Legs', 3, 8, 10, 75, 'Count reps per leg.'),
    (template_id, 3, 'DB Step Up', 'Legs', 3, 8, 10, 75, 'Drive through the whole foot.'),
    (template_id, 4, 'DB Sumo Squat', 'Glutes', 3, 10, 12, 75, 'Sit down between the hips.'),
    (template_id, 5, 'DB Calf Raise', 'Calves', 3, 12, 15, 60, 'Move through a full range.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Lower Body 4 - Unilateral Control',
    'library:phase1; category:lower_body; A single-leg focused lower-body workout for balance, control and strength. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Bulgarian Split Squat', 'Legs', 3, 8, 10, 90, 'Use a shorter range if hips feel tight.'),
    (template_id, 2, 'Single Leg Leg Press', 'Legs', 3, 8, 12, 75, 'Keep knee tracking over toes.'),
    (template_id, 3, 'Single Leg Romanian Deadlift', 'Legs', 3, 8, 10, 75, 'Reach hips back before lowering.'),
    (template_id, 4, 'Walking Lunge', 'Legs', 3, 10, 12, 75, 'Count reps per leg.'),
    (template_id, 5, 'Single Leg Calf Raise', 'Calves', 3, 10, 15, 60, 'Use support for balance.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Lower Body 5 - Machine Leg Day',
    'library:phase1; category:lower_body; A machine-based lower-body workout for a simple gym leg day. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Hack Squat', 'Legs', 3, 8, 12, 90, 'Keep your back against the pad.'),
    (template_id, 2, 'Seated Leg Curl', 'Legs', 3, 10, 15, 60, 'Pause briefly at the squeeze.'),
    (template_id, 3, 'Leg Extension', 'Legs', 3, 10, 15, 60, 'Control the lowering phase.'),
    (template_id, 4, 'Cable Glute Kickback', 'Glutes', 3, 10, 15, 60, 'Move from the hip, not the lower back.'),
    (template_id, 5, 'Seated Calf Raise', 'Calves', 3, 12, 15, 60, 'Use a steady tempo.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Full Body 1 - Balanced Gym Session',
    'library:phase1; category:full_body; A balanced full-body workout with legs, push, pull and core. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Leg Press', 'Legs', 3, 8, 12, 90, 'Control the bottom position.'),
    (template_id, 2, 'DB Flat Press', 'Chest', 3, 8, 12, 75, 'Keep wrists stacked.'),
    (template_id, 3, 'Lat Pulldown', 'Back', 3, 8, 12, 75, 'Pull elbows toward ribs.'),
    (template_id, 4, 'DB Romanian Deadlift', 'Legs', 3, 8, 12, 75, 'Hinge with soft knees.'),
    (template_id, 5, 'Cable Crunch', 'Core', 3, 10, 15, 60, 'Round through the ribs.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Full Body 2 - Dumbbell Full Body',
    'library:phase1; category:full_body; A dumbbell full-body workout for a simple gym or home setup. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'DB Goblet Squat', 'Legs', 3, 8, 12, 75, 'Hold the dumbbell close.'),
    (template_id, 2, 'DB Romanian Deadlift', 'Legs', 3, 8, 12, 75, 'Push hips back.'),
    (template_id, 3, 'DB Floor Press', 'Chest', 3, 8, 12, 75, 'Pause elbows lightly on the floor.'),
    (template_id, 4, 'One Arm DB Row', 'Back', 3, 8, 12, 75, 'Count reps per side.'),
    (template_id, 5, 'DB Dead Bug Pullover', 'Core', 3, 8, 12, 60, 'Keep ribs down.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Full Body 3 - Machine Full Body',
    'library:phase1; category:full_body; A machine-based full-body workout for an easy-to-follow gym session. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Hack Squat', 'Legs', 3, 8, 12, 90, 'Use a controlled range.'),
    (template_id, 2, 'Machine Chest Press', 'Chest', 3, 8, 12, 75, 'Keep shoulders pinned.'),
    (template_id, 3, 'Seated Row', 'Back', 3, 8, 12, 75, 'Pause at the squeeze.'),
    (template_id, 4, 'Seated Leg Curl', 'Legs', 3, 10, 15, 60, 'Control every rep.'),
    (template_id, 5, 'Machine Shoulder Press', 'Shoulders', 3, 8, 12, 75, 'Press without shrugging.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Full Body 4 - Strength Foundation',
    'library:phase1; category:full_body; A full-body strength foundation session using squat, hinge, push and pull patterns. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Back Squat', 'Legs', 3, 5, 8, 120, 'Brace before each rep.'),
    (template_id, 2, 'Romanian Deadlift', 'Legs', 3, 6, 10, 120, 'Keep lats tight.'),
    (template_id, 3, 'Incline DB Press', 'Chest', 3, 8, 10, 90, 'Press smoothly.'),
    (template_id, 4, 'Chest Supported Row', 'Back', 3, 8, 10, 90, 'Pull elbows behind you.'),
    (template_id, 5, 'Pallof Press', 'Core', 3, 10, 12, 60, 'Resist rotation.');

  insert into public.workout_templates (
    owner_id, created_by, source_type, workout_type, name, notes, visibility, is_template, is_public_template, status
  )
  values (
    template_owner, template_owner, 'personal', 'strength',
    'Full Body 5 - Athletic Mix',
    'library:phase1; category:full_body; A full-body gym mix with legs, upper body and trunk stability. Copy this into your library before editing.',
    'private', true, true, 'active'
  )
  returning id into template_id;
  insert into public.workout_template_exercises (template_id, position, exercise_name, muscle_group, sets, rep_min, rep_max, rest_seconds, tip)
  values
    (template_id, 1, 'Trap Bar Deadlift', 'Legs', 3, 5, 8, 120, 'Push the floor away.'),
    (template_id, 2, 'Push Up', 'Chest', 3, 8, 15, 75, 'Use a clean plank position.'),
    (template_id, 3, 'Assisted Pull Up', 'Back', 3, 6, 10, 90, 'Use assistance that keeps reps clean.'),
    (template_id, 4, 'DB Walking Lunge', 'Legs', 3, 8, 10, 75, 'Count reps per leg.'),
    (template_id, 5, 'Farmer Carry', 'Core', 3, 30, 45, 60, 'Walk tall with ribs stacked.');
end $$;

notify pgrst, 'reload schema';
