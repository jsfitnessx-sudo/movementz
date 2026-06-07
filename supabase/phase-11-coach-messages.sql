-- Movementz Phase 11: simple coach/client messaging
-- Run after phase-7-coach-client-links.sql.

create table if not exists public.coaching_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists coaching_messages_thread_created_idx
  on public.coaching_messages(coach_id, client_id, created_at desc);

create index if not exists coaching_messages_recipient_unread_idx
  on public.coaching_messages(coach_id, client_id, sender_id, read_at)
  where read_at is null;

alter table public.coaching_messages enable row level security;

drop policy if exists "Linked coaches and clients can read messages" on public.coaching_messages;
create policy "Linked coaches and clients can read messages"
  on public.coaching_messages
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    or client_id = auth.uid()
  );

drop policy if exists "Linked coaches and clients can send messages" on public.coaching_messages;
create policy "Linked coaches and clients can send messages"
  on public.coaching_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      coach_id = auth.uid()
      or client_id = auth.uid()
    )
    and exists (
      select 1
      from public.coach_clients cc
      where cc.coach_id = coaching_messages.coach_id
        and cc.client_id = coaching_messages.client_id
        and cc.status = 'active'
    )
  );

drop function if exists public.get_my_message_threads();
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
  with links as (
    select
      cc.coach_id,
      cc.client_id,
      case when cc.coach_id = auth.uid() then cc.client_id else cc.coach_id end as peer_id,
      case when cc.coach_id = auth.uid() then 'client' else 'coach' end as relationship_role
    from public.coach_clients cc
    where cc.status = 'active'
      and (cc.coach_id = auth.uid() or cc.client_id = auth.uid())
  )
  select
    links.peer_id,
    coalesce(peer.full_name, peer.email, 'Movementz user') as peer_name,
    peer.email as peer_email,
    peer.avatar_url as peer_avatar_url,
    links.relationship_role,
    latest.body as latest_body,
    latest.created_at as latest_at,
    coalesce(unread.count, 0) as unread_count
  from links
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
  order by latest.created_at desc nulls last, peer_name asc;
$$;

grant execute on function public.get_my_message_threads() to authenticated;

drop function if exists public.get_coaching_messages(uuid);
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

  if thread.id is null then
    raise exception 'No active coaching thread found.';
  end if;

  update public.coaching_messages cm
  set read_at = now()
  where cm.coach_id = thread.coach_id
    and cm.client_id = thread.client_id
    and cm.sender_id <> auth.uid()
    and cm.read_at is null;

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
end;
$$;

grant execute on function public.get_coaching_messages(uuid) to authenticated;

drop function if exists public.send_coaching_message(uuid, text);
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
  created_message public.coaching_messages;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if char_length(trim(coalesce(message_body, ''))) = 0 then
    raise exception 'Write a message first.';
  end if;

  select *
  into thread
  from public.coach_clients cc
  where cc.status = 'active'
    and (
      (cc.coach_id = auth.uid() and cc.client_id = target_peer_id)
      or (cc.client_id = auth.uid() and cc.coach_id = target_peer_id)
    )
  limit 1;

  if thread.id is null then
    raise exception 'No active coaching thread found.';
  end if;

  insert into public.coaching_messages (coach_id, client_id, sender_id, body)
  values (thread.coach_id, thread.client_id, auth.uid(), trim(message_body))
  returning * into created_message;

  return query select created_message.id, created_message.created_at;
end;
$$;

grant execute on function public.send_coaching_message(uuid, text) to authenticated;
