-- Movementz Phase 20: admin hide helpers, mindset privacy, and home summary support.
-- Run after phase-19-admin-settings.sql.

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

create or replace function public.admin_hide_mindset_resource(resource_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can hide resources.';
  end if;

  update public.mindset_resources
  set is_active = false,
      updated_at = now()
  where id = resource_id;

  if not found then
    raise exception 'Resource not found.';
  end if;

  return resource_id;
end;
$$;

grant execute on function public.admin_hide_mindset_resource(uuid) to authenticated;

create or replace function public.admin_hide_mindset_affirmation(affirmation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can hide affirmations.';
  end if;

  update public.mindset_affirmations
  set is_active = false,
      updated_at = now()
  where id = affirmation_id;

  if not found then
    raise exception 'Affirmation not found.';
  end if;

  return affirmation_id;
end;
$$;

grant execute on function public.admin_hide_mindset_affirmation(uuid) to authenticated;

drop policy if exists "daily_mindset_logs_select_own_or_linked_coach" on public.daily_mindset_logs;
drop policy if exists "daily_mindset_logs_select_own_or_admin" on public.daily_mindset_logs;
create policy "daily_mindset_logs_select_own_or_admin"
on public.daily_mindset_logs
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create or replace function public.get_coach_client_mood_summary(target_client_id uuid)
returns table (
  log_date date,
  mood_score integer
)
language sql
security definer
set search_path = public
as $$
  select dml.log_date, dml.mood_score
  from public.daily_mindset_logs dml
  where dml.user_id = target_client_id
    and exists (
      select 1
      from public.coach_clients cc
      where cc.coach_id = auth.uid()
        and cc.client_id = target_client_id
        and cc.status = 'active'
    )
  order by dml.log_date desc
  limit 30;
$$;

grant execute on function public.get_coach_client_mood_summary(uuid) to authenticated;
