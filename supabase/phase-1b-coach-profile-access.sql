-- Movementz Phase 1B: repair coach profile access
-- Run this if saving a coach profile says it violates row-level security.

alter table public.coach_profiles enable row level security;

drop policy if exists "coach_profiles_select_own" on public.coach_profiles;
drop policy if exists "coach_profiles_insert_own" on public.coach_profiles;
drop policy if exists "coach_profiles_update_own" on public.coach_profiles;
drop policy if exists "coach_profiles_manage_own" on public.coach_profiles;

create policy "coach_profiles_manage_own"
on public.coach_profiles
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
