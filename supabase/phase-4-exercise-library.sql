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

alter table public.user_exercise_options enable row level security;
alter table public.exercise_review_requests enable row level security;

drop policy if exists "Users manage own exercise options" on public.user_exercise_options;
create policy "Users manage own exercise options"
on public.user_exercise_options
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users create own exercise review requests" on public.exercise_review_requests;
drop policy if exists "Users view own exercise review requests" on public.exercise_review_requests;
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

create index if not exists user_exercise_options_owner_name_idx
  on public.user_exercise_options(owner_id, lower(exercise_name));

create index if not exists exercise_review_requests_status_created_idx
  on public.exercise_review_requests(status, created_at desc);
