-- Movementz Phase 19: admin settings, mindset resource/affirmation management, and factory reset.
-- Run after phase-18-mindset.sql.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.mindset_resources add column if not exists updated_at timestamptz not null default now();

create table if not exists public.mindset_affirmations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  theme text not null,
  text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mindset_affirmations enable row level security;

drop policy if exists "mindset_resources_select_active" on public.mindset_resources;
create policy "mindset_resources_select_active"
on public.mindset_resources
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "mindset_resources_insert_coach_admin" on public.mindset_resources;
drop policy if exists "mindset_resources_insert_admin" on public.mindset_resources;
create policy "mindset_resources_insert_admin"
on public.mindset_resources
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "mindset_resources_update_admin" on public.mindset_resources;
create policy "mindset_resources_update_admin"
on public.mindset_resources
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "mindset_affirmations_select_active" on public.mindset_affirmations;
create policy "mindset_affirmations_select_active"
on public.mindset_affirmations
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "mindset_affirmations_insert_admin" on public.mindset_affirmations;
create policy "mindset_affirmations_insert_admin"
on public.mindset_affirmations
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "mindset_affirmations_update_admin" on public.mindset_affirmations;
create policy "mindset_affirmations_update_admin"
on public.mindset_affirmations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists mindset_affirmations_active_theme_idx
  on public.mindset_affirmations(is_active, theme, created_at desc);

create or replace function public.set_mindset_resource_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mindset_resources_updated_at on public.mindset_resources;
create trigger mindset_resources_updated_at
before update on public.mindset_resources
for each row execute function public.set_mindset_resource_updated_at();

create or replace function public.set_mindset_affirmation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mindset_affirmations_updated_at on public.mindset_affirmations;
create trigger mindset_affirmations_updated_at
before update on public.mindset_affirmations
for each row execute function public.set_mindset_affirmation_updated_at();

create or replace function public.admin_delete_user_rows(
  target_table text,
  target_column text,
  target_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can factory reset accounts.';
  end if;

  if to_regclass('public.' || target_table) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = target_table
      and c.column_name = target_column
  ) then
    return 0;
  end if;

  execute format('delete from public.%I where %I = $1', target_table, target_column)
  using target_user_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.admin_delete_user_rows(text, text, uuid) to authenticated;

create or replace function public.admin_factory_reset_account(target_user_id uuid)
returns table(deleted_rows integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  total_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can factory reset accounts.';
  end if;

  if target_user_id is null then
    raise exception 'Choose an account to reset.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot factory reset the signed-in admin account.';
  end if;

  total_deleted := total_deleted + public.admin_delete_user_rows('coaching_messages', 'sender_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coaching_messages', 'coach_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coaching_messages', 'client_id', target_user_id);

  total_deleted := total_deleted + public.admin_delete_user_rows('coach_workout_assignments', 'coach_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coach_workout_assignments', 'client_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('training_plan_assignments', 'assigned_by', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('training_plan_assignments', 'client_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('training_plans', 'owner_id', target_user_id);

  total_deleted := total_deleted + public.admin_delete_user_rows('session_logs', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('workout_templates', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('goal_tracker_checkins', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('goal_trackers', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('progress_photos', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('daily_habit_logs', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('daily_mindset_logs', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('mindset_future_reminders', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('user_exercise_options', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('exercise_review_requests', 'requester_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('invites', 'inviter_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('invites', 'used_by', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coach_clients', 'coach_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coach_clients', 'client_id', target_user_id);

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'updated_at'
  ) then
    execute 'update public.profiles set updated_at = now() where id = $1'
    using target_user_id;
  end if;

  deleted_rows := total_deleted;
  return next;
end;
$$;

grant execute on function public.admin_factory_reset_account(uuid) to authenticated;
