-- Movementz Phase 42: mutual request and mutual workout share notifications.
-- Run after phase-32-paid-user-access.sql and phase-41-coach-unlink-and-mutual-workout-shares.sql.

do $$
declare
  notification_type_constraint text;
begin
  for notification_type_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.app_notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%notification_type%'
  loop
    execute format(
      'alter table public.app_notifications drop constraint %I',
      notification_type_constraint
    );
  end loop;
end
$$;

alter table public.app_notifications
add constraint app_notifications_notification_type_check
check (
  notification_type in (
    'message',
    'feed_like',
    'feed_comment',
    'mutual_request',
    'mutual_accept',
    'mutual_workout_share',
    'workout_logged',
    'pr',
    'tracker_updated',
    'food_logged',
    'exercise_request',
    'admin_request',
    'reminder'
  )
);

create or replace function public.request_mutual(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_id uuid;
  actor_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.user_has_paid_access(auth.uid()) then
    raise exception 'Upgrade to request mutual access.';
  end if;

  if not public.user_has_paid_access(target_user_id) then
    raise exception 'That user needs paid access before mutual features can be used.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot add yourself as a mutual.';
  end if;

  select coalesce(p.full_name, p.email, 'Movementz user')
  into actor_name
  from public.profiles p
  where p.id = auth.uid();

  select mc.id
  into connection_id
  from public.mutual_connections mc
  where (mc.requester_id = auth.uid() and mc.recipient_id = target_user_id)
     or (mc.requester_id = target_user_id and mc.recipient_id = auth.uid())
  limit 1;

  if connection_id is null then
    insert into public.mutual_connections(requester_id, recipient_id, status)
    values (auth.uid(), target_user_id, 'pending')
    returning id into connection_id;
  else
    update public.mutual_connections
    set requester_id = auth.uid(),
        recipient_id = target_user_id,
        status = 'pending',
        responded_at = null,
        created_at = now()
    where id = connection_id
      and status = 'rejected';
  end if;

  perform public.create_app_notification(
    target_user_id,
    auth.uid(),
    'mutual_request',
    actor_name || ' sent you a mutual request.',
    'Accept to share feed activity, messages and workouts.',
    'feed',
    jsonb_build_object('connection_id', connection_id, 'view', 'mutuals')
  );

  return connection_id;
end;
$$;

grant execute on function public.request_mutual(uuid) to authenticated;

create or replace function public.share_workout_with_mutual(p_workout_template_id uuid, p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  share_id uuid;
  template_owner uuid;
  template_source text;
  template_name text;
  actor_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.user_has_paid_access(auth.uid()) or not public.user_has_paid_access(p_recipient_id) then
    raise exception 'Both users need paid access before mutual workout sharing.';
  end if;

  if not exists (
    select 1
    from public.mutual_connections mc
    where mc.status = 'active'
      and (
        (mc.requester_id = auth.uid() and mc.recipient_id = p_recipient_id)
        or (mc.requester_id = p_recipient_id and mc.recipient_id = auth.uid())
      )
  ) then
    raise exception 'You can only share workouts with active mutuals.';
  end if;

  select wt.owner_id, coalesce(wt.source_type, 'personal'), wt.name
  into template_owner, template_source, template_name
  from public.workout_templates wt
  where wt.id = p_workout_template_id;

  if template_owner is null then
    raise exception 'Workout not found.';
  end if;

  if template_owner <> auth.uid() then
    raise exception 'You can only share workouts from your own library.';
  end if;

  if template_source = 'coach_assigned' then
    raise exception 'Coach-assigned workouts cannot be shared.';
  end if;

  if exists (
    select 1
    from public.coach_workout_assignments cwa
    where cwa.workout_template_id = p_workout_template_id
      and cwa.client_id = auth.uid()
      and cwa.status in ('active', 'paused')
  ) then
    raise exception 'Coach-assigned workouts cannot be shared.';
  end if;

  insert into public.mutual_workout_shares (workout_template_id, sender_id, recipient_id, status, shared_at, revoked_at)
  values (p_workout_template_id, auth.uid(), p_recipient_id, 'active', now(), null)
  on conflict (workout_template_id, sender_id, recipient_id)
  do update set status = 'active', shared_at = excluded.shared_at, revoked_at = null
  returning id into share_id;

  select coalesce(p.full_name, p.email, 'Movementz user')
  into actor_name
  from public.profiles p
  where p.id = auth.uid();

  perform public.create_app_notification(
    p_recipient_id,
    auth.uid(),
    'mutual_workout_share',
    actor_name || ' shared a workout with you.',
    coalesce(template_name, 'Shared workout') || ' is ready in your Mutual Shared workouts.',
    'workouts',
    jsonb_build_object('share_id', share_id, 'workout_template_id', p_workout_template_id, 'view', 'shared')
  );

  return share_id;
end;
$$;

grant execute on function public.share_workout_with_mutual(uuid, uuid) to authenticated;
