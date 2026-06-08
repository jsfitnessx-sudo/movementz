-- Movementz Phase 16: coach-safe client progress summary
-- Run after phase-15-tracker-completion.sql.

create or replace function public.get_coach_client_progress_summary(target_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  linked boolean;
  tracker_row jsonb;
  checkin_count integer := 0;
  photo_count integer := 0;
  photo_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = target_client_id
      and cc.status = 'active'
  )
  into linked;

  if not linked then
    raise exception 'This client is not actively linked to this coach.';
  end if;

  select to_jsonb(gt)
  into tracker_row
  from (
    select
      id,
      goal_name,
      goal_type,
      start_weight_kg,
      goal_weight_kg,
      maintenance_calories,
      target_calories,
      duration_weeks,
      start_date,
      status,
      completed_at,
      archived_at,
      created_at
    from public.goal_trackers
    where user_id = target_client_id
      and status in ('active', 'completed', 'archived')
    order by
      case status when 'active' then 0 when 'completed' then 1 else 2 end,
      start_date desc,
      created_at desc
    limit 1
  ) gt;

  if tracker_row is not null then
    select count(*)
    into checkin_count
    from public.goal_tracker_checkins gtc
    where gtc.tracker_id = (tracker_row->>'id')::uuid;
  end if;

  select count(*)
  into photo_count
  from public.progress_photos pp
  where pp.user_id = target_client_id;

  select coalesce(jsonb_agg(to_jsonb(photo_item)), '[]'::jsonb)
  into photo_rows
  from (
    select
      id,
      pose,
      note,
      thumbnail_path,
      taken_at,
      created_at
    from public.progress_photos
    where user_id = target_client_id
    order by taken_at desc
    limit 6
  ) photo_item;

  return jsonb_build_object(
    'tracker', tracker_row,
    'checkin_count', checkin_count,
    'photo_count', photo_count,
    'photos', photo_rows
  );
end;
$$;

grant execute on function public.get_coach_client_progress_summary(uuid) to authenticated;
