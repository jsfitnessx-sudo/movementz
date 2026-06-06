create table if not exists public.user_exercise_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  muscle_group text,
  equipment text,
  source text not null default 'user_custom'
    check (source in ('user_custom', 'exercisedb', 'admin')),
  created_at timestamptz not null default now(),
  unique(owner_id, exercise_name)
);

create table if not exists public.exercise_review_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  muscle_group text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  youtube_url text,
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique(requester_id, exercise_name)
);

create table if not exists public.exercise_catalog (
  id uuid primary key default gen_random_uuid(),
  exercise_key text not null unique,
  exercise_name text not null,
  muscle_group text,
  equipment text,
  body_part text,
  target text,
  source text not null default 'exercisedb',
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_demo_links (
  id uuid primary key default gen_random_uuid(),
  exercise_key text not null unique,
  exercise_name text not null,
  muscle_group text,
  youtube_url text not null,
  source_request_id uuid references public.exercise_review_requests(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_exercise_options enable row level security;
alter table public.exercise_review_requests enable row level security;
alter table public.exercise_catalog enable row level security;
alter table public.exercise_demo_links enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins view profiles" on public.profiles;
create policy "Admins view profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "Users manage own exercise options" on public.user_exercise_options;
create policy "Users manage own exercise options"
on public.user_exercise_options
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Authenticated users view exercise catalog" on public.exercise_catalog;
drop policy if exists "Users add pending exercise catalog entries" on public.exercise_catalog;
drop policy if exists "Admins manage exercise catalog" on public.exercise_catalog;
create policy "Authenticated users view exercise catalog"
on public.exercise_catalog
for select
to authenticated
using (true);

create policy "Users add pending exercise catalog entries"
on public.exercise_catalog
for insert
to authenticated
with check (source = 'user_custom');

create policy "Admins manage exercise catalog"
on public.exercise_catalog
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users view exercise demos" on public.exercise_demo_links;
drop policy if exists "Admins manage exercise demos" on public.exercise_demo_links;
create policy "Authenticated users view exercise demos"
on public.exercise_demo_links
for select
to authenticated
using (true);

create policy "Admins manage exercise demos"
on public.exercise_demo_links
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users create own exercise review requests" on public.exercise_review_requests;
drop policy if exists "Users view own exercise review requests" on public.exercise_review_requests;
drop policy if exists "Admins view exercise review requests" on public.exercise_review_requests;
drop policy if exists "Admins update exercise review requests" on public.exercise_review_requests;
create policy "Users create own exercise review requests"
on public.exercise_review_requests
for insert
to authenticated
with check (requester_id = auth.uid());

create policy "Users view own exercise review requests"
on public.exercise_review_requests
for select
to authenticated
using (requester_id = auth.uid());

create policy "Admins view exercise review requests"
on public.exercise_review_requests
for select
to authenticated
using (public.is_admin());

create policy "Admins update exercise review requests"
on public.exercise_review_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists user_exercise_options_owner_name_idx
  on public.user_exercise_options(owner_id, lower(exercise_name));

create index if not exists exercise_review_requests_status_created_idx
  on public.exercise_review_requests(status, created_at desc);

create index if not exists exercise_catalog_name_idx
  on public.exercise_catalog(lower(exercise_name));

create index if not exists exercise_catalog_muscle_idx
  on public.exercise_catalog(muscle_group, lower(exercise_name));

create index if not exists exercise_demo_links_key_idx
  on public.exercise_demo_links(exercise_key);

insert into public.exercise_catalog (exercise_key, exercise_name, muscle_group, source)
values
  ('barbell bench press', 'Barbell Bench Press', 'Chest', 'seed'),
  ('db flat press', 'DB Flat Press', 'Chest', 'seed'),
  ('incline db press', 'Incline DB Press', 'Chest', 'seed'),
  ('machine chest press', 'Machine Chest Press', 'Chest', 'seed'),
  ('cable fly', 'Cable Fly', 'Chest', 'seed'),
  ('pec deck', 'Pec Deck', 'Chest', 'seed'),
  ('push up', 'Push Up', 'Chest', 'seed'),
  ('decline db press', 'Decline DB Press', 'Chest', 'seed'),
  ('lat pulldown', 'Lat Pulldown', 'Back', 'seed'),
  ('seated row', 'Seated Row', 'Back', 'seed'),
  ('one arm db row', 'One Arm DB Row', 'Back', 'seed'),
  ('barbell row', 'Barbell Row', 'Back', 'seed'),
  ('chest supported row', 'Chest Supported Row', 'Back', 'seed'),
  ('straight arm pulldown', 'Straight Arm Pulldown', 'Back', 'seed'),
  ('assisted pull up', 'Assisted Pull Up', 'Back', 'seed'),
  ('cable pullover', 'Cable Pullover', 'Back', 'seed'),
  ('back squat', 'Back Squat', 'Legs', 'seed'),
  ('romanian deadlift', 'Romanian Deadlift', 'Legs', 'seed'),
  ('leg press', 'Leg Press', 'Legs', 'seed'),
  ('leg extension', 'Leg Extension', 'Legs', 'seed'),
  ('seated leg curl', 'Seated Leg Curl', 'Legs', 'seed'),
  ('walking lunge', 'Walking Lunge', 'Legs', 'seed'),
  ('bulgarian split squat', 'Bulgarian Split Squat', 'Legs', 'seed'),
  ('hip thrust', 'Hip Thrust', 'Legs', 'seed'),
  ('db shoulder press', 'DB Shoulder Press', 'Shoulders', 'seed'),
  ('machine shoulder press', 'Machine Shoulder Press', 'Shoulders', 'seed'),
  ('db lateral raise', 'DB Lateral Raise', 'Shoulders', 'seed'),
  ('cable lateral raise', 'Cable Lateral Raise', 'Shoulders', 'seed'),
  ('rear delt fly', 'Rear Delt Fly', 'Shoulders', 'seed'),
  ('arnold press', 'Arnold Press', 'Shoulders', 'seed'),
  ('bb overhead press', 'BB Overhead Press', 'Shoulders', 'seed'),
  ('face pull', 'Face Pull', 'Shoulders', 'seed'),
  ('db curl', 'DB Curl', 'Biceps', 'seed'),
  ('ez bar curl', 'EZ Bar Curl', 'Biceps', 'seed'),
  ('cable curl', 'Cable Curl', 'Biceps', 'seed'),
  ('hammer curl', 'Hammer Curl', 'Biceps', 'seed'),
  ('preacher curl', 'Preacher Curl', 'Biceps', 'seed'),
  ('incline db curl', 'Incline DB Curl', 'Biceps', 'seed'),
  ('machine curl', 'Machine Curl', 'Biceps', 'seed'),
  ('rope curl', 'Rope Curl', 'Biceps', 'seed'),
  ('rope pushdown', 'Rope Pushdown', 'Triceps', 'seed'),
  ('overhead cable extension', 'Overhead Cable Extension', 'Triceps', 'seed'),
  ('skull crusher', 'Skull Crusher', 'Triceps', 'seed'),
  ('close grip bench press', 'Close Grip Bench Press', 'Triceps', 'seed'),
  ('assisted dip', 'Assisted Dip', 'Triceps', 'seed'),
  ('single arm pushdown', 'Single Arm Pushdown', 'Triceps', 'seed'),
  ('triceps extension machine', 'Triceps Extension Machine', 'Triceps', 'seed'),
  ('bench dip', 'Bench Dip', 'Triceps', 'seed'),
  ('plank', 'Plank', 'Core', 'seed'),
  ('dead bug', 'Dead Bug', 'Core', 'seed'),
  ('cable crunch', 'Cable Crunch', 'Core', 'seed'),
  ('hanging knee raise', 'Hanging Knee Raise', 'Core', 'seed'),
  ('ab wheel', 'Ab Wheel', 'Core', 'seed'),
  ('russian twist', 'Russian Twist', 'Core', 'seed'),
  ('pallof press', 'Pallof Press', 'Core', 'seed'),
  ('side plank', 'Side Plank', 'Core', 'seed')
on conflict (exercise_key) do update
set exercise_name = excluded.exercise_name,
    muscle_group = excluded.muscle_group,
    source = excluded.source,
    updated_at = now();
