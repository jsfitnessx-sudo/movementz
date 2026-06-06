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

alter table public.exercise_review_requests enable row level security;
alter table public.exercise_catalog enable row level security;
alter table public.exercise_demo_links enable row level security;

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

create index if not exists exercise_review_requests_status_created_idx
  on public.exercise_review_requests(status, created_at desc);

create index if not exists exercise_catalog_name_idx
  on public.exercise_catalog(lower(exercise_name));

create index if not exists exercise_catalog_muscle_idx
  on public.exercise_catalog(muscle_group, lower(exercise_name));

create index if not exists exercise_demo_links_key_idx
  on public.exercise_demo_links(exercise_key);
