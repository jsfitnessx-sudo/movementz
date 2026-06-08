-- Movementz Phase 25: app notifications and mutual direct messaging.
-- Run after phase-23-mutual-feed.sql and phase-24-food-log.sql.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (
    notification_type in (
      'message',
      'feed_like',
      'feed_comment',
      'mutual_request',
      'mutual_accept',
      'workout_logged',
      'pr',
      'tracker_updated',
      'food_logged',
      'exercise_request',
      'admin_request',
      'reminder'
    )
  ),
  title text not null,
  body text,
  link_tab text,
  link_payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mutual_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table public.app_notifications enable row level security;
alter table public.mutual_messages enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own"
on public.app_notifications
for select
to authenticated
using (recipient_id = auth.uid());

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own"
on public.app_notifications
for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists "mutual_messages_select_thread" on public.mutual_messages;
create policy "mutual_messages_select_thread"
on public.mutual_messages
for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "mutual_messages_insert_active_mutual" on public.mutual_messages;
create policy "mutual_messages_insert_active_mutual"
on public.mutual_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.mutual_connections mc
    where mc.status = 'active'
      and (
        (mc.requester_id = auth.uid() and mc.recipient_id = mutual_messages.recipient_id)
        or (mc.recipient_id = auth.uid() and mc.requester_id = mutual_messages.recipient_id)
      )
  )
);

create index if not exists app_notifications_recipient_unread_idx
  on public.app_notifications(recipient_id, read_at, created_at desc);

create index if not exists app_notifications_type_idx
  on public.app_notifications(recipient_id, notification_type, read_at, created_at desc);

create index if not exists mutual_messages_thread_created_idx
  on public.mutual_messages(least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);

create index if not exists mutual_messages_recipient_unread_idx
  on public.mutual_messages(recipient_id, read_at, created_at desc)
  where read_at is null;

create or replace function public.create_app_notification(
  target_user_id uuid,
  actor_user_id uuid,
  notice_type text,
  notice_title text,
  notice_body text default null,
  target_tab text default null,
  payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_id uuid;
begin
  if target_user_id is null or target_user_id = actor_user_id then
    return null;
  end if;

  insert into public.app_notifications(
    recipient_id,
    actor_id,
    notification_type,
    title,
    body,
    link_tab,
    link_payload
  )
  values (
    target_user_id,
    actor_user_id,
    notice_type,
    left(trim(coalesce(notice_title, 'Movementz update')), 180),
    nullif(left(trim(coalesce(notice_body, '')), 500), ''),
    target_tab,
    coalesce(payload, '{}'::jsonb)
  )
  returning app_notifications.id into notice_id;

  return notice_id;
end;
$$;

grant execute on function public.create_app_notification(uuid, uuid, text, text, text, text, jsonb) to authenticated;

create or replace function public.get_my_notification_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_rows jsonb := '[]'::jsonb;
  unread_total integer := 0;
  unread_messages integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select count(*)::integer
  into unread_total
  from public.app_notifications an
  where an.recipient_id = auth.uid()
    and an.read_at is null
    and an.notification_type <> 'message';

  select count(*)::integer
  into unread_messages
  from public.app_notifications an
  where an.recipient_id = auth.uid()
    and an.read_at is null
    and an.notification_type = 'message';

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
  into recent_rows
  from (
    select
      an.id,
      an.notification_type,
      an.title,
      an.body,
      an.link_tab,
      an.link_payload,
      an.read_at,
      an.created_at,
      an.actor_id,
      coalesce(p.full_name, p.email, 'Movementz') as actor_name,
      p.avatar_url as actor_avatar_url
    from public.app_notifications an
    left join public.profiles p on p.id = an.actor_id
    where an.recipient_id = auth.uid()
    order by an.created_at desc
    limit 30
  ) item;

  return jsonb_build_object(
    'unread_total', coalesce(unread_total, 0),
    'unread_messages', coalesce(unread_messages, 0),
    'items', recent_rows
  );
end;
$$;

grant execute on function public.get_my_notification_summary() to authenticated;

create or replace function public.mark_app_notifications_read(notification_id uuid default null, filter_type text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer := 0;
begin
  update public.app_notifications an
  set read_at = now()
  where an.recipient_id = auth.uid()
    and an.read_at is null
    and (notification_id is null or an.id = notification_id)
    and (filter_type is null or an.notification_type = filter_type);

  get diagnostics touched = row_count;
  return touched;
end;
$$;

grant execute on function public.mark_app_notifications_read(uuid, text) to authenticated;

create or replace function public.get_my_message_threads()
returns table (
  peer_id uuid,
  peer_name text,
  peer_email text,
  peer_avatar_url text,
  relationship_role text,
  latest_body text,
  latest_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
as $$
  with coaching_links as (
    select
      cc.coach_id,
      cc.client_id,
      case when cc.coach_id = auth.uid() then cc.client_id else cc.coach_id end as peer_id,
      case when cc.coach_id = auth.uid() then 'client' else 'coach' end as relationship_role
    from public.coach_clients cc
    where cc.status = 'active'
      and (cc.coach_id = auth.uid() or cc.client_id = auth.uid())
  ),
  coaching_threads as (
    select
      links.peer_id,
      coalesce(peer.full_name, peer.email, 'Movementz user') as peer_name,
      peer.email as peer_email,
      peer.avatar_url as peer_avatar_url,
      links.relationship_role,
      latest.body as latest_body,
      latest.created_at as latest_at,
      coalesce(unread.count, 0) as unread_count
    from coaching_links links
    left join public.profiles peer on peer.id = links.peer_id
    left join lateral (
      select cm.body, cm.created_at
      from public.coaching_messages cm
      where cm.coach_id = links.coach_id
        and cm.client_id = links.client_id
      order by cm.created_at desc
      limit 1
    ) latest on true
    left join lateral (
      select count(*)::bigint
      from public.coaching_messages cm
      where cm.coach_id = links.coach_id
        and cm.client_id = links.client_id
        and cm.sender_id <> auth.uid()
        and cm.read_at is null
    ) unread on true
  ),
  mutual_links as (
    select
      case when mc.requester_id = auth.uid() then mc.recipient_id else mc.requester_id end as peer_id
    from public.mutual_connections mc
    where mc.status = 'active'
      and (mc.requester_id = auth.uid() or mc.recipient_id = auth.uid())
  ),
  mutual_threads as (
    select
      ml.peer_id,
      coalesce(peer.full_name, peer.email, 'Movementz user') as peer_name,
      peer.email as peer_email,
      peer.avatar_url as peer_avatar_url,
      'mutual'::text as relationship_role,
      latest.body as latest_body,
      latest.created_at as latest_at,
      coalesce(unread.count, 0) as unread_count
    from mutual_links ml
    join public.profiles peer on peer.id = ml.peer_id
    left join lateral (
      select mm.body, mm.created_at
      from public.mutual_messages mm
      where (mm.sender_id = auth.uid() and mm.recipient_id = ml.peer_id)
         or (mm.recipient_id = auth.uid() and mm.sender_id = ml.peer_id)
      order by mm.created_at desc
      limit 1
    ) latest on true
    left join lateral (
      select count(*)::bigint
      from public.mutual_messages mm
      where mm.recipient_id = auth.uid()
        and mm.sender_id = ml.peer_id
        and mm.read_at is null
    ) unread on true
  )
  select *
  from (
    select * from coaching_threads
    union all
    select * from mutual_threads
  ) threads
  order by latest_at desc nulls last, peer_name asc;
$$;

grant execute on function public.get_my_message_threads() to authenticated;

create or replace function public.get_coaching_messages(target_peer_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  thread public.coach_clients;
  has_mutual boolean := false;
begin
  select *
  into thread
  from public.coach_clients cc
  where cc.status = 'active'
    and (
      (cc.coach_id = auth.uid() and cc.client_id = target_peer_id)
      or (cc.client_id = auth.uid() and cc.coach_id = target_peer_id)
    )
  limit 1;

  if thread.id is not null then
    update public.coaching_messages cm
    set read_at = now()
    where cm.coach_id = thread.coach_id
      and cm.client_id = thread.client_id
      and cm.sender_id <> auth.uid()
      and cm.read_at is null;

    perform public.mark_app_notifications_read(null, 'message');

    return query
      select recent.id, recent.sender_id, recent.body, recent.created_at
      from (
        select cm.id, cm.sender_id, cm.body, cm.created_at
        from public.coaching_messages cm
        where cm.coach_id = thread.coach_id
          and cm.client_id = thread.client_id
        order by cm.created_at desc
        limit 80
      ) recent
      order by recent.created_at asc;
    return;
  end if;

  select exists (
    select 1
    from public.mutual_connections mc
    where mc.status = 'active'
      and (
        (mc.requester_id = auth.uid() and mc.recipient_id = target_peer_id)
        or (mc.recipient_id = auth.uid() and mc.requester_id = target_peer_id)
      )
  ) into has_mutual;

  if not has_mutual then
    raise exception 'No active message thread found.';
  end if;

  update public.mutual_messages mm
  set read_at = now()
  where mm.sender_id = target_peer_id
    and mm.recipient_id = auth.uid()
    and mm.read_at is null;

  perform public.mark_app_notifications_read(null, 'message');

  return query
    select recent.id, recent.sender_id, recent.body, recent.created_at
    from (
      select mm.id, mm.sender_id, mm.body, mm.created_at
      from public.mutual_messages mm
      where (mm.sender_id = auth.uid() and mm.recipient_id = target_peer_id)
         or (mm.recipient_id = auth.uid() and mm.sender_id = target_peer_id)
      order by mm.created_at desc
      limit 80
    ) recent
    order by recent.created_at asc;
end;
$$;

grant execute on function public.get_coaching_messages(uuid) to authenticated;

create or replace function public.send_coaching_message(target_peer_id uuid, message_body text)
returns table (
  id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  thread public.coach_clients;
  created_coach_message public.coaching_messages;
  created_mutual_message public.mutual_messages;
  sender_name text;
  has_mutual boolean := false;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if char_length(trim(coalesce(message_body, ''))) = 0 then
    raise exception 'Write a message first.';
  end if;

  select coalesce(full_name, email, 'Movementz user')
  into sender_name
  from public.profiles p
  where p.id = auth.uid();

  select *
  into thread
  from public.coach_clients cc
  where cc.status = 'active'
    and (
      (cc.coach_id = auth.uid() and cc.client_id = target_peer_id)
      or (cc.client_id = auth.uid() and cc.coach_id = target_peer_id)
    )
  limit 1;

  if thread.id is not null then
    insert into public.coaching_messages (coach_id, client_id, sender_id, body)
    values (thread.coach_id, thread.client_id, auth.uid(), trim(message_body))
    returning * into created_coach_message;

    perform public.create_app_notification(
      target_peer_id,
      auth.uid(),
      'message',
      sender_name || ' sent you a message.',
      trim(message_body),
      'messages',
      jsonb_build_object('peer_id', auth.uid(), 'message_id', created_coach_message.id)
    );

    return query select created_coach_message.id, created_coach_message.created_at;
    return;
  end if;

  select exists (
    select 1
    from public.mutual_connections mc
    where mc.status = 'active'
      and (
        (mc.requester_id = auth.uid() and mc.recipient_id = target_peer_id)
        or (mc.recipient_id = auth.uid() and mc.requester_id = target_peer_id)
      )
  ) into has_mutual;

  if not has_mutual then
    raise exception 'No active message thread found.';
  end if;

  insert into public.mutual_messages(sender_id, recipient_id, body)
  values (auth.uid(), target_peer_id, trim(message_body))
  returning * into created_mutual_message;

  perform public.create_app_notification(
    target_peer_id,
    auth.uid(),
    'message',
    sender_name || ' sent you a message.',
    trim(message_body),
    'messages',
    jsonb_build_object('peer_id', auth.uid(), 'message_id', created_mutual_message.id)
  );

  return query select created_mutual_message.id, created_mutual_message.created_at;
end;
$$;

grant execute on function public.send_coaching_message(uuid, text) to authenticated;

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

  if target_user_id = auth.uid() then
    raise exception 'You cannot add yourself as a mutual.';
  end if;

  select coalesce(full_name, email, 'Movementz user')
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
    returning mutual_connections.id into connection_id;
  else
    update public.mutual_connections
    set requester_id = auth.uid(),
        recipient_id = target_user_id,
        status = 'pending',
        responded_at = null,
        created_at = now()
    where mutual_connections.id = connection_id
      and mutual_connections.status = 'rejected';
  end if;

  perform public.create_app_notification(
    target_user_id,
    auth.uid(),
    'mutual_request',
    actor_name || ' sent you a mutual request.',
    'Accept to share feed activity and unlock mutual messaging.',
    'feed',
    jsonb_build_object('connection_id', connection_id, 'view', 'mutuals')
  );

  return connection_id;
end;
$$;

grant execute on function public.request_mutual(uuid) to authenticated;

create or replace function public.respond_mutual(connection_id uuid, response_status text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid;
  actor_name text;
begin
  if lower(response_status) not in ('active', 'rejected') then
    raise exception 'Response must be active or rejected.';
  end if;

  select mc.requester_id
  into requester
  from public.mutual_connections mc
  where mc.id = connection_id
    and mc.recipient_id = auth.uid()
    and mc.status = 'pending';

  update public.mutual_connections
  set status = lower(response_status),
      responded_at = now()
  where mutual_connections.id = connection_id
    and mutual_connections.recipient_id = auth.uid()
    and mutual_connections.status = 'pending';

  if not found then
    raise exception 'Mutual request not found.';
  end if;

  if lower(response_status) = 'active' then
    select coalesce(full_name, email, 'Movementz user')
    into actor_name
    from public.profiles p
    where p.id = auth.uid();

    perform public.create_app_notification(
      requester,
      auth.uid(),
      'mutual_accept',
      actor_name || ' accepted your mutual request.',
      'You can now message each other and see approved feed activity.',
      'feed',
      jsonb_build_object('connection_id', connection_id, 'view', 'mutuals')
    );
  end if;

  return connection_id;
end;
$$;

grant execute on function public.respond_mutual(uuid, text) to authenticated;

create or replace function public.toggle_feed_like(feed_item_type text, feed_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item_owner uuid;
  actor_name text;
begin
  if not public.can_view_mutual_feed_item(feed_item_type, feed_item_id) then
    raise exception 'Feed item is not available.';
  end if;

  delete from public.feed_likes
  where actor_id = auth.uid()
    and item_type = feed_item_type
    and item_id = feed_item_id;

  if found then
    return false;
  end if;

  insert into public.feed_likes(actor_id, item_type, item_id)
  values (auth.uid(), feed_item_type, feed_item_id);

  select coalesce(full_name, email, 'Movementz user')
  into actor_name
  from public.profiles p
  where p.id = auth.uid();

  if feed_item_type = 'workout' then
    select sl.owner_id into item_owner from public.session_logs sl where sl.id = feed_item_id;
  elsif feed_item_type = 'mood' then
    select dml.user_id into item_owner from public.daily_mindset_logs dml where dml.id = feed_item_id;
  elsif feed_item_type = 'pr' then
    select sl.owner_id
    into item_owner
    from public.session_log_sets sls
    join public.session_log_exercises sle on sle.id = sls.session_exercise_id
    join public.session_logs sl on sl.id = sle.session_id
    where sls.id = feed_item_id;
  end if;

  perform public.create_app_notification(
    item_owner,
    auth.uid(),
    'feed_like',
    actor_name || ' liked your activity.',
    null,
    'feed',
    jsonb_build_object('item_type', feed_item_type, 'item_id', feed_item_id)
  );

  return true;
end;
$$;

grant execute on function public.toggle_feed_like(text, uuid) to authenticated;

create or replace function public.add_feed_comment(feed_item_type text, feed_item_id uuid, comment_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_comment_id uuid;
  item_owner uuid;
  actor_name text;
begin
  if not public.can_view_mutual_feed_item(feed_item_type, feed_item_id) then
    raise exception 'Feed item is not available.';
  end if;

  insert into public.feed_comments(actor_id, item_type, item_id, body)
  values (auth.uid(), feed_item_type, feed_item_id, trim(comment_body))
  returning feed_comments.id into new_comment_id;

  select coalesce(full_name, email, 'Movementz user')
  into actor_name
  from public.profiles p
  where p.id = auth.uid();

  if feed_item_type = 'workout' then
    select sl.owner_id into item_owner from public.session_logs sl where sl.id = feed_item_id;
  elsif feed_item_type = 'mood' then
    select dml.user_id into item_owner from public.daily_mindset_logs dml where dml.id = feed_item_id;
  elsif feed_item_type = 'pr' then
    select sl.owner_id
    into item_owner
    from public.session_log_sets sls
    join public.session_log_exercises sle on sle.id = sls.session_exercise_id
    join public.session_logs sl on sl.id = sle.session_id
    where sls.id = feed_item_id;
  end if;

  perform public.create_app_notification(
    item_owner,
    auth.uid(),
    'feed_comment',
    actor_name || ' commented on your activity.',
    trim(comment_body),
    'feed',
    jsonb_build_object('item_type', feed_item_type, 'item_id', feed_item_id, 'comment_id', new_comment_id)
  );

  return new_comment_id;
end;
$$;

grant execute on function public.add_feed_comment(text, uuid, text) to authenticated;

create or replace function public.notify_linked_coaches(
  source_client_id uuid,
  source_type text,
  source_title text,
  source_body text,
  source_tab text default 'clients',
  source_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_count integer := 0;
  coach_record record;
begin
  for coach_record in
    select cc.coach_id
    from public.coach_clients cc
    where cc.client_id = source_client_id
      and cc.status = 'active'
  loop
    perform public.create_app_notification(
      coach_record.coach_id,
      source_client_id,
      source_type,
      source_title,
      source_body,
      source_tab,
      coalesce(source_payload, '{}'::jsonb)
    );
    notice_count := notice_count + 1;
  end loop;

  return notice_count;
end;
$$;

grant execute on function public.notify_linked_coaches(uuid, text, text, text, text, jsonb) to authenticated;

create or replace function public.notify_admins(
  source_actor_id uuid,
  source_type text,
  source_title text,
  source_body text,
  source_tab text default 'requests',
  source_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  notice_count integer := 0;
  admin_record record;
begin
  for admin_record in
    select p.id
    from public.profiles p
    where p.role = 'admin'
  loop
    perform public.create_app_notification(
      admin_record.id,
      source_actor_id,
      source_type,
      source_title,
      source_body,
      source_tab,
      coalesce(source_payload, '{}'::jsonb)
    );
    notice_count := notice_count + 1;
  end loop;

  return notice_count;
end;
$$;

grant execute on function public.notify_admins(uuid, text, text, text, text, jsonb) to authenticated;

create or replace function public.notify_coach_workout_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' then
    perform public.notify_linked_coaches(
      new.owner_id,
      'workout_logged',
      'Workout logged',
      coalesce(new.name, 'Workout') || ' was completed.',
      'clients',
      jsonb_build_object('session_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists session_logs_notify_coach on public.session_logs;
create trigger session_logs_notify_coach
after insert on public.session_logs
for each row execute function public.notify_coach_workout_logged();

create or replace function public.notify_coach_tracker_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_linked_coaches(
    new.user_id,
    'tracker_updated',
    'Tracker updated',
    'A client submitted a tracker check-in.',
    'clients',
    jsonb_build_object('tracker_id', new.tracker_id, 'week_number', new.week_number)
  );
  return new;
end;
$$;

drop trigger if exists goal_tracker_checkins_notify_coach on public.goal_tracker_checkins;
create trigger goal_tracker_checkins_notify_coach
after insert or update on public.goal_tracker_checkins
for each row execute function public.notify_coach_tracker_updated();

create or replace function public.notify_coach_food_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_linked_coaches(
    new.user_id,
    'food_logged',
    'Food log updated',
    coalesce(new.food_name, 'Food') || ' was logged.',
    'clients',
    jsonb_build_object('food_log_id', new.id, 'log_date', new.log_date)
  );
  return new;
end;
$$;

drop trigger if exists food_log_entries_notify_coach on public.food_log_entries;
create trigger food_log_entries_notify_coach
after insert on public.food_log_entries
for each row execute function public.notify_coach_food_logged();

create or replace function public.notify_admin_exercise_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_admins(
    new.requester_id,
    'exercise_request',
    'Exercise request',
    coalesce(new.exercise_name, 'New exercise') || ' needs review.',
    'requests',
    jsonb_build_object('request_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists exercise_review_requests_notify_admin on public.exercise_review_requests;
create trigger exercise_review_requests_notify_admin
after insert on public.exercise_review_requests
for each row execute function public.notify_admin_exercise_request();
