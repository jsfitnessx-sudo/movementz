-- Movementz Phase 1: accounts, profiles and coach/client links
-- Run this in a fresh Supabase SQL Editor tab.
-- This version intentionally uses no database functions/triggers.

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

alter table public.profiles enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.coach_clients enable row level security;
alter table public.invites enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "coach_profiles_select_own" on public.coach_profiles;
create policy "coach_profiles_select_own"
on public.coach_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "coach_profiles_insert_own" on public.coach_profiles;
create policy "coach_profiles_insert_own"
on public.coach_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "coach_profiles_update_own" on public.coach_profiles;
create policy "coach_profiles_update_own"
on public.coach_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "coach_clients_select_own" on public.coach_clients;
create policy "coach_clients_select_own"
on public.coach_clients
for select
to authenticated
using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists "coach_clients_insert_as_coach" on public.coach_clients;
create policy "coach_clients_insert_as_coach"
on public.coach_clients
for insert
to authenticated
with check (coach_id = auth.uid());

drop policy if exists "coach_clients_update_as_coach" on public.coach_clients;
create policy "coach_clients_update_as_coach"
on public.coach_clients
for update
to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists "invites_select_own" on public.invites;
create policy "invites_select_own"
on public.invites
for select
to authenticated
using (inviter_id = auth.uid() or used_by = auth.uid());

drop policy if exists "invites_insert_own" on public.invites;
create policy "invites_insert_own"
on public.invites
for insert
to authenticated
with check (inviter_id = auth.uid());

drop policy if exists "invites_update_own" on public.invites;
create policy "invites_update_own"
on public.invites
for update
to authenticated
using (inviter_id = auth.uid() or used_by = auth.uid())
with check (inviter_id = auth.uid() or used_by = auth.uid());
