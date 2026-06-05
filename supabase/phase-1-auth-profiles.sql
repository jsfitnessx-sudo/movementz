-- Movementz Phase 1: accounts, profiles and coach/client links
-- Run this in the Supabase SQL Editor for the new Movementz project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  first_name text,
  last_name text,
  role text not null default 'normal_user'
    check (role in ('normal_user', 'client', 'coach', 'admin')),
  avatar_url text,
  gender text,
  age integer check (age is null or age between 13 and 120),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  qualification text,
  experience_areas text[] not null default '{}',
  about_me text,
  years_experience integer check (years_experience is null or years_experience >= 0),
  verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('invited', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  unique (coach_id, client_id),
  check (coach_id <> client_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  inviter_id uuid references public.profiles(id) on delete cascade,
  invite_type text not null default 'client'
    check (invite_type in ('client', 'coach', 'mutual')),
  email text,
  expires_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists coach_profiles_set_updated_at on public.coach_profiles;
create trigger coach_profiles_set_updated_at
before update on public.coach_profiles
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_user_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'normal_user');
  selected_role text;
  experience_values text[] := '{}';
begin
  selected_role := case
    when requested_role in ('normal_user', 'client', 'coach', 'admin') then requested_role
    else 'normal_user'
  end;

  insert into public.profiles (id, email, full_name, role, gender, age, location)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    selected_role,
    nullif(new.raw_user_meta_data->>'gender', ''),
    nullif(new.raw_user_meta_data->>'age', '')::integer,
    nullif(new.raw_user_meta_data->>'location', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = excluded.role,
    gender = coalesce(excluded.gender, public.profiles.gender),
    age = coalesce(excluded.age, public.profiles.age),
    location = coalesce(excluded.location, public.profiles.location);

  if jsonb_typeof(new.raw_user_meta_data->'experience_areas') = 'array' then
    select coalesce(array_agg(value), '{}')
    into experience_values
    from jsonb_array_elements_text(new.raw_user_meta_data->'experience_areas') as value;
  end if;

  if selected_role = 'coach' then
    insert into public.coach_profiles (user_id, qualification, experience_areas, about_me)
    values (
      new.id,
      nullif(new.raw_user_meta_data->>'qualification', ''),
      experience_values,
      nullif(new.raw_user_meta_data->>'about_me', '')
    )
    on conflict (user_id) do update
    set
      qualification = coalesce(excluded.qualification, public.coach_profiles.qualification),
      experience_areas = excluded.experience_areas,
      about_me = coalesce(excluded.about_me, public.coach_profiles.about_me);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.coach_clients enable row level security;
alter table public.invites enable row level security;

drop policy if exists "profiles_select_allowed" on public.profiles;
create policy "profiles_select_allowed"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'admin'
  or exists (
    select 1 from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = profiles.id
      and cc.status in ('active', 'invited')
  )
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id = auth.uid()
      and cc.coach_id = profiles.id
      and cc.status in ('active', 'invited')
  )
);

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin')
with check (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "coach_profiles_select_allowed" on public.coach_profiles;
create policy "coach_profiles_select_allowed"
on public.coach_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() in ('admin', 'coach')
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id = auth.uid()
      and cc.coach_id = coach_profiles.user_id
      and cc.status in ('active', 'invited')
  )
);

drop policy if exists "coach_profiles_update_own_or_admin" on public.coach_profiles;
create policy "coach_profiles_update_own_or_admin"
on public.coach_profiles
for update
to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'admin')
with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "coach_profiles_insert_own_or_admin" on public.coach_profiles;
create policy "coach_profiles_insert_own_or_admin"
on public.coach_profiles
for insert
to authenticated
with check (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "coach_clients_select_allowed" on public.coach_clients;
create policy "coach_clients_select_allowed"
on public.coach_clients
for select
to authenticated
using (
  coach_id = auth.uid()
  or client_id = auth.uid()
  or public.current_user_role() = 'admin'
);

drop policy if exists "coach_clients_insert_coach_or_admin" on public.coach_clients;
create policy "coach_clients_insert_coach_or_admin"
on public.coach_clients
for insert
to authenticated
with check (
  coach_id = auth.uid()
  or public.current_user_role() = 'admin'
);

drop policy if exists "coach_clients_update_coach_or_admin" on public.coach_clients;
create policy "coach_clients_update_coach_or_admin"
on public.coach_clients
for update
to authenticated
using (coach_id = auth.uid() or public.current_user_role() = 'admin')
with check (coach_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "invites_select_own_or_admin" on public.invites;
create policy "invites_select_own_or_admin"
on public.invites
for select
to authenticated
using (
  inviter_id = auth.uid()
  or used_by = auth.uid()
  or public.current_user_role() = 'admin'
);

drop policy if exists "invites_insert_own_or_admin" on public.invites;
create policy "invites_insert_own_or_admin"
on public.invites
for insert
to authenticated
with check (
  inviter_id = auth.uid()
  or public.current_user_role() = 'admin'
);

drop policy if exists "invites_update_own_or_admin" on public.invites;
create policy "invites_update_own_or_admin"
on public.invites
for update
to authenticated
using (
  inviter_id = auth.uid()
  or used_by = auth.uid()
  or public.current_user_role() = 'admin'
)
with check (
  inviter_id = auth.uid()
  or used_by = auth.uid()
  or public.current_user_role() = 'admin'
);
