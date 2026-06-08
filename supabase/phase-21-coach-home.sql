-- Movementz Phase 21: coach home dashboard and admin hide reinforcement.
-- Run after phase-20-home-admin-privacy.sql.

alter table public.mindset_resources
  add column if not exists updated_at timestamptz not null default now();

alter table public.mindset_affirmations
  add column if not exists updated_at timestamptz not null default now();

alter table public.goal_trackers
  add column if not exists completed_at timestamptz;

alter table public.goal_trackers
  add column if not exists archived_at timestamptz;

alter table public.goal_trackers
  add column if not exists final_summary jsonb not null default '{}'::jsonb;

create index if not exists goal_trackers_user_completed_idx
  on public.goal_trackers(user_id, completed_at desc)
  where status = 'completed';

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

create or replace function public.get_coach_home_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  has_coach_profile boolean := false;
  client_ids uuid[] := '{}'::uuid[];
  active_clients integer := 0;
  new_clients integer := 0;
  lost_clients integer := 0;
  struggle_count integer := 0;
  low_count integer := 0;
  workouts_today integer := 0;
  habit_logging integer := 0;
  habit_compliant integer := 0;
  affirmation_text text := 'Be Yourself';
  due_soon_rows jsonb := '[]'::jsonb;
  activity_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select lower(coalesce(p.role, ''))
  into current_role
  from public.profiles p
  where p.id = auth.uid();

  select exists (
    select 1
    from public.coach_profiles cp
    where cp.user_id = auth.uid()
  )
  into has_coach_profile;

  if current_role not in ('coach', 'admin') and not has_coach_profile then
    raise exception 'Only coaches can load the coach dashboard.';
  end if;

  select coalesce(array_agg(cc.client_id) filter (where cc.status = 'active'), '{}'::uuid[])
  into client_ids
  from public.coach_clients cc
  where cc.coach_id = auth.uid();

  select count(*)::integer
  into active_clients
  from public.coach_clients cc
  where cc.coach_id = auth.uid()
    and cc.status = 'active';

  select count(*)::integer
  into new_clients
  from public.coach_clients cc
  where cc.coach_id = auth.uid()
    and cc.status = 'active'
    and cc.created_at >= date_trunc('week', now());

  select count(*)::integer
  into lost_clients
  from public.coach_clients cc
  where cc.coach_id = auth.uid()
    and cc.status not in ('active', 'invited');

  if active_clients > 0 then
    select count(*)::integer
    into struggle_count
    from public.daily_mindset_logs dml
    where dml.user_id = any(client_ids)
      and dml.log_date >= current_date - interval '6 days'
      and dml.mood_score = 1;

    select count(*)::integer
    into low_count
    from public.daily_mindset_logs dml
    where dml.user_id = any(client_ids)
      and dml.log_date >= current_date - interval '6 days'
      and dml.mood_score = 2;

    select count(*)::integer
    into workouts_today
    from public.session_logs sl
    where sl.owner_id = any(client_ids)
      and sl.status = 'completed'
      and sl.completed_at >= current_date
      and sl.completed_at < current_date + interval '1 day';

    select round((count(*)::numeric / active_clients) * 100)::integer
    into habit_logging
    from public.daily_habit_logs dhl
    where dhl.user_id = any(client_ids)
      and dhl.log_date = current_date;

    select round((count(*)::numeric / active_clients) * 100)::integer
    into habit_compliant
    from public.daily_habit_logs dhl
    where dhl.user_id = any(client_ids)
      and dhl.log_date = current_date
      and dhl.completion_percent >= 80;
  end if;

  select ma.text
  into affirmation_text
  from public.mindset_affirmations ma
  where ma.is_active = true
  order by md5(ma.id::text || current_date::text)
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.days_left asc, item.plan_name asc), '[]'::jsonb)
  into due_soon_rows
  from (
    select
      tpa.id as assignment_id,
      tp.id as plan_id,
      coalesce(p.full_name, p.email, 'Client') as client_name,
      tp.name as plan_name,
      (tpa.created_at::date + ((coalesce(tp.block_weeks, 4) * 7)::integer))::date as due_date,
      ((tpa.created_at::date + ((coalesce(tp.block_weeks, 4) * 7)::integer))::date - current_date)::integer as days_left
    from public.training_plan_assignments tpa
    join public.training_plans tp on tp.id = tpa.plan_id
    join public.profiles p on p.id = tpa.client_id
    where tpa.assigned_by = auth.uid()
      and tpa.client_id = any(client_ids)
      and tpa.status = 'active'
      and tp.plan_type = 'block'
      and tp.status <> 'archived'
      and (tpa.created_at::date + ((coalesce(tp.block_weeks, 4) * 7)::integer))::date between current_date and current_date + 7
    order by days_left asc
    limit 8
  ) item;

  select coalesce(jsonb_agg(to_jsonb(feed) order by feed.created_at desc), '[]'::jsonb)
  into activity_rows
  from (
    select *
    from (
      select
        sl.id::text as id,
        case
          when coalesce(sl.total_volume_kg, 0) > coalesce((
            select max(prev.total_volume_kg)
            from public.session_logs prev
            where prev.owner_id = sl.owner_id
              and prev.status = 'completed'
              and prev.completed_at < sl.completed_at
          ), 0) and coalesce(sl.total_volume_kg, 0) > 0
          then 'pr'
          else 'workout'
        end as type,
        coalesce(p.full_name, p.email, 'Client') as client_name,
        p.avatar_url,
        case
          when coalesce(sl.total_volume_kg, 0) > coalesce((
            select max(prev.total_volume_kg)
            from public.session_logs prev
            where prev.owner_id = sl.owner_id
              and prev.status = 'completed'
              and prev.completed_at < sl.completed_at
          ), 0) and coalesce(sl.total_volume_kg, 0) > 0
          then 'hit a new PR in ' || sl.name || '.'
          else 'completed ' || sl.name || '.'
        end as title,
        case
          when coalesce(sl.total_volume_kg, 0) > 0
          then trim(to_char(sl.total_volume_kg, 'FM999999990.0')) || 'kg total volume'
          else coalesce(sl.completed_sets, 0)::text || ' completed sets'
        end as detail,
        sl.completed_at as created_at
      from public.session_logs sl
      join public.profiles p on p.id = sl.owner_id
      where sl.owner_id = any(client_ids)
        and sl.status = 'completed'
      order by sl.completed_at desc
      limit 12
    ) workouts
    union all
    select *
    from (
      select
        dml.id::text as id,
        'mood'::text as type,
        coalesce(p.full_name, p.email, 'Client') as client_name,
        p.avatar_url,
        'logged a mood check-in: ' ||
          case dml.mood_score
            when 5 then 'Great'
            when 4 then 'Good'
            when 3 then 'Okay'
            when 2 then 'Low'
            when 1 then 'Struggling'
            else 'Checked in'
          end || '.' as title,
        'Mood check-in'::text as detail,
        dml.created_at as created_at
      from public.daily_mindset_logs dml
      join public.profiles p on p.id = dml.user_id
      where dml.user_id = any(client_ids)
      order by dml.created_at desc
      limit 10
    ) moods
    union all
    select *
    from (
      select
        dhl.id::text as id,
        'habit'::text as type,
        coalesce(p.full_name, p.email, 'Client') as client_name,
        p.avatar_url,
        'logged daily habits.'::text as title,
        dhl.completion_percent::text || '% complete' as detail,
        dhl.updated_at as created_at
      from public.daily_habit_logs dhl
      join public.profiles p on p.id = dhl.user_id
      where dhl.user_id = any(client_ids)
      order by dhl.updated_at desc
      limit 10
    ) habits
    order by created_at desc
    limit 20
  ) feed;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'struggle_moods_week', coalesce(struggle_count, 0),
      'low_moods_week', coalesce(low_count, 0),
      'client_workouts_today', coalesce(workouts_today, 0),
      'habit_logging_today', coalesce(habit_logging, 0),
      'habit_compliant_today', coalesce(habit_compliant, 0),
      'total_clients', coalesce(active_clients, 0),
      'new_clients_week', coalesce(new_clients, 0),
      'lost_clients', coalesce(lost_clients, 0)
    ),
    'affirmation', coalesce(affirmation_text, 'Be Yourself'),
    'due_soon', coalesce(due_soon_rows, '[]'::jsonb),
    'activity', coalesce(activity_rows, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_coach_home_summary() to authenticated;
