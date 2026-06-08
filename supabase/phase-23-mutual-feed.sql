-- Movementz Phase 23: mutual feed, requests, likes, comments and leaderboard.
-- Run after phase-22-profile-avatars.sql.

create table if not exists public.mutual_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);

create unique index if not exists mutual_connections_pair_idx
  on public.mutual_connections (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  );

create table if not exists public.feed_likes (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('workout', 'mood', 'pr')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_id, item_type, item_id)
);

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('workout', 'mood', 'pr')),
  item_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.mutual_connections enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_comments enable row level security;

drop policy if exists "mutual_connections_select_own" on public.mutual_connections;
create policy "mutual_connections_select_own"
on public.mutual_connections
for select
to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "mutual_connections_insert_own" on public.mutual_connections;
create policy "mutual_connections_insert_own"
on public.mutual_connections
for insert
to authenticated
with check (requester_id = auth.uid());

drop policy if exists "mutual_connections_update_own" on public.mutual_connections;
create policy "mutual_connections_update_own"
on public.mutual_connections
for update
to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid())
with check (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "feed_likes_select_own" on public.feed_likes;
create policy "feed_likes_select_own"
on public.feed_likes
for select
to authenticated
using (actor_id = auth.uid());

drop policy if exists "feed_likes_insert_own" on public.feed_likes;
create policy "feed_likes_insert_own"
on public.feed_likes
for insert
to authenticated
with check (actor_id = auth.uid());

drop policy if exists "feed_likes_delete_own" on public.feed_likes;
create policy "feed_likes_delete_own"
on public.feed_likes
for delete
to authenticated
using (actor_id = auth.uid());

drop policy if exists "feed_comments_select_own" on public.feed_comments;
create policy "feed_comments_select_own"
on public.feed_comments
for select
to authenticated
using (actor_id = auth.uid());

drop policy if exists "feed_comments_insert_own" on public.feed_comments;
create policy "feed_comments_insert_own"
on public.feed_comments
for insert
to authenticated
with check (actor_id = auth.uid());

create index if not exists mutual_connections_requester_idx
  on public.mutual_connections(requester_id, status, created_at desc);

create index if not exists mutual_connections_recipient_idx
  on public.mutual_connections(recipient_id, status, created_at desc);

create index if not exists feed_likes_item_idx
  on public.feed_likes(item_type, item_id);

create index if not exists feed_comments_item_idx
  on public.feed_comments(item_type, item_id, created_at);

create or replace function public.search_mutual_candidates(search_text text)
returns table (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  mutual_status text,
  direction text
)
language sql
security definer
set search_path = public
as $$
  with query as (
    select '%' || lower(trim(coalesce(search_text, ''))) || '%' as term
  )
  select
    p.id as user_id,
    coalesce(p.full_name, p.email, 'Movementz athlete') as full_name,
    p.email,
    p.avatar_url,
    mc.status as mutual_status,
    case
      when mc.requester_id = auth.uid() then 'sent'
      when mc.recipient_id = auth.uid() then 'received'
      else null
    end as direction
  from public.profiles p
  cross join query q
  left join public.mutual_connections mc
    on (
      (mc.requester_id = auth.uid() and mc.recipient_id = p.id)
      or (mc.recipient_id = auth.uid() and mc.requester_id = p.id)
    )
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(coalesce(search_text, ''))) >= 2
    and (
      lower(coalesce(p.email, '')) like q.term
      or lower(coalesce(p.full_name, '')) like q.term
      or lower(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) like q.term
    )
  order by coalesce(p.full_name, p.email)
  limit 10;
$$;

grant execute on function public.search_mutual_candidates(text) to authenticated;

create or replace function public.request_mutual(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  connection_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot add yourself as a mutual.';
  end if;

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
begin
  if lower(response_status) not in ('active', 'rejected') then
    raise exception 'Response must be active or rejected.';
  end if;

  update public.mutual_connections
  set status = lower(response_status),
      responded_at = now()
  where id = connection_id
    and recipient_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Mutual request not found.';
  end if;

  return connection_id;
end;
$$;

grant execute on function public.respond_mutual(uuid, text) to authenticated;

create or replace function public.can_view_mutual_feed_item(feed_item_type text, feed_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with visible_people as (
    select auth.uid() as user_id
    union
    select case
      when mc.requester_id = auth.uid() then mc.recipient_id
      else mc.requester_id
    end
    from public.mutual_connections mc
    where mc.status = 'active'
      and (mc.requester_id = auth.uid() or mc.recipient_id = auth.uid())
  )
  select case
    when feed_item_type = 'workout' then exists (
      select 1
      from public.session_logs sl
      where sl.id = feed_item_id
        and sl.owner_id in (select user_id from visible_people)
        and sl.status = 'completed'
    )
    when feed_item_type = 'mood' then exists (
      select 1
      from public.daily_mindset_logs dml
      where dml.id = feed_item_id
        and dml.user_id in (select user_id from visible_people)
    )
    when feed_item_type = 'pr' then exists (
      select 1
      from public.session_log_sets sls
      join public.session_log_exercises sle on sle.id = sls.session_exercise_id
      join public.session_logs sl on sl.id = sle.session_id
      where sls.id = feed_item_id
        and sl.owner_id in (select user_id from visible_people)
        and sl.status = 'completed'
    )
    else false
  end;
$$;

grant execute on function public.can_view_mutual_feed_item(text, uuid) to authenticated;

create or replace function public.get_mutual_feed()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_rows jsonb := '[]'::jsonb;
  mutual_rows jsonb := '[]'::jsonb;
  feed_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
  into pending_rows
  from (
    select
      mc.id,
      mc.requester_id,
      coalesce(p.full_name, p.email, 'Movementz athlete') as requester_name,
      p.email as requester_email,
      p.avatar_url,
      mc.created_at
    from public.mutual_connections mc
    join public.profiles p on p.id = mc.requester_id
    where mc.recipient_id = auth.uid()
      and mc.status = 'pending'
    order by mc.created_at desc
  ) item;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.full_name), '[]'::jsonb)
  into mutual_rows
  from (
    select
      mc.id,
      case when mc.requester_id = auth.uid() then mc.recipient_id else mc.requester_id end as user_id,
      coalesce(p.full_name, p.email, 'Movementz athlete') as full_name,
      p.email,
      p.avatar_url,
      mc.created_at,
      mc.responded_at
    from public.mutual_connections mc
    join public.profiles p
      on p.id = case when mc.requester_id = auth.uid() then mc.recipient_id else mc.requester_id end
    where mc.status = 'active'
      and (mc.requester_id = auth.uid() or mc.recipient_id = auth.uid())
  ) item;

  with visible_people as (
    select auth.uid() as user_id
    union
    select (item->>'user_id')::uuid
    from jsonb_array_elements(mutual_rows) item
  ),
  feed as (
    select
      'workout'::text as item_type,
      sl.id as item_id,
      sl.owner_id as actor_id,
      coalesce(p.full_name, p.email, 'Movementz athlete') as actor_name,
      p.avatar_url,
      'completed ' || sl.name || '.' as title,
      case
        when coalesce(sl.total_volume_kg, 0) > 0 then trim(to_char(sl.total_volume_kg, 'FM999999990.0')) || 'kg total volume'
        else coalesce(sl.total_exercises, 0)::text || ' exercises'
      end as detail,
      sl.completed_at as created_at
    from public.session_logs sl
    join public.profiles p on p.id = sl.owner_id
    where sl.owner_id in (select user_id from visible_people)
      and sl.status = 'completed'
      and sl.completed_at >= now() - interval '90 days'

    union all

    select
      'mood'::text as item_type,
      dml.id as item_id,
      dml.user_id as actor_id,
      coalesce(p.full_name, p.email, 'Movementz athlete') as actor_name,
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
      coalesce(dml.updated_at, dml.created_at) as created_at
    from public.daily_mindset_logs dml
    join public.profiles p on p.id = dml.user_id
    where dml.user_id in (select user_id from visible_people)
      and dml.log_date >= current_date - interval '90 days'

    union all

    select
      'pr'::text as item_type,
      sls.id as item_id,
      sl.owner_id as actor_id,
      coalesce(p.full_name, p.email, 'Movementz athlete') as actor_name,
      p.avatar_url,
      'hit a new PR on ' || sle.exercise_name || '.' as title,
      trim(to_char(sls.kg, 'FM999999990.0')) || 'kg x ' || sls.reps::text || ' reps' as detail,
      sl.completed_at as created_at
    from public.session_log_sets sls
    join public.session_log_exercises sle on sle.id = sls.session_exercise_id
    join public.session_logs sl on sl.id = sle.session_id
    join public.profiles p on p.id = sl.owner_id
    where sl.owner_id in (select user_id from visible_people)
      and sl.status = 'completed'
      and sl.completed_at >= now() - interval '90 days'
      and sls.completed = true
      and sls.kg is not null
      and sls.reps is not null
      and not exists (
        select 1
        from public.session_log_sets prior_sets
        join public.session_log_exercises prior_exercises on prior_exercises.id = prior_sets.session_exercise_id
        join public.session_logs prior_logs on prior_logs.id = prior_exercises.session_id
        where prior_logs.owner_id = sl.owner_id
          and prior_logs.status = 'completed'
          and prior_logs.completed_at < sl.completed_at
          and lower(prior_exercises.exercise_name) = lower(sle.exercise_name)
          and prior_sets.completed = true
          and prior_sets.kg is not null
          and prior_sets.reps is not null
          and (prior_sets.kg * (1 + prior_sets.reps::numeric / 30)) >= (sls.kg * (1 + sls.reps::numeric / 30))
      )
  ),
  ranked_feed as (
    select *
    from feed
    order by created_at desc
    limit 40
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_type', rf.item_type,
      'item_id', rf.item_id,
      'actor_id', rf.actor_id,
      'actor_name', rf.actor_name,
      'avatar_url', rf.avatar_url,
      'title', rf.title,
      'detail', rf.detail,
      'created_at', rf.created_at,
      'liked_by_me', exists (
        select 1 from public.feed_likes fl
        where fl.actor_id = auth.uid()
          and fl.item_type = rf.item_type
          and fl.item_id = rf.item_id
      ),
      'like_count', (
        select count(*)::integer from public.feed_likes fl
        where fl.item_type = rf.item_type
          and fl.item_id = rf.item_id
      ),
      'comment_count', (
        select count(*)::integer from public.feed_comments fc
        where fc.item_type = rf.item_type
          and fc.item_id = rf.item_id
      ),
      'comments', coalesce((
        select jsonb_agg(to_jsonb(comment_item) order by comment_item.created_at asc)
        from (
          select
            fc.id,
            fc.body,
            fc.created_at,
            coalesce(cp.full_name, cp.email, 'Movementz athlete') as actor_name,
            cp.avatar_url
          from public.feed_comments fc
          join public.profiles cp on cp.id = fc.actor_id
          where fc.item_type = rf.item_type
            and fc.item_id = rf.item_id
          order by fc.created_at desc
          limit 3
        ) comment_item
      ), '[]'::jsonb)
    )
    order by rf.created_at desc
  ), '[]'::jsonb)
  into feed_rows
  from ranked_feed rf;

  return jsonb_build_object(
    'pending_requests', pending_rows,
    'mutuals', mutual_rows,
    'mutual_count', jsonb_array_length(mutual_rows),
    'feed', feed_rows
  );
end;
$$;

grant execute on function public.get_mutual_feed() to authenticated;

create or replace function public.toggle_feed_like(feed_item_type text, feed_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if not public.can_view_mutual_feed_item(feed_item_type, feed_item_id) then
    raise exception 'Feed item is not available.';
  end if;

  insert into public.feed_comments(actor_id, item_type, item_id, body)
  values (auth.uid(), feed_item_type, feed_item_id, trim(comment_body))
  returning id into new_comment_id;

  return new_comment_id;
end;
$$;

grant execute on function public.add_feed_comment(text, uuid, text) to authenticated;

create or replace function public.get_mutual_leaderboard(metric text default 'days')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_metric text := lower(coalesce(metric, 'days'));
  leaderboard_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if current_metric not in ('days', 'prs', 'mood') then
    current_metric := 'days';
  end if;

  with visible_people as (
    select auth.uid() as user_id
    union
    select case
      when mc.requester_id = auth.uid() then mc.recipient_id
      else mc.requester_id
    end
    from public.mutual_connections mc
    where mc.status = 'active'
      and (mc.requester_id = auth.uid() or mc.recipient_id = auth.uid())
  ),
  scores as (
    select
      vp.user_id,
      coalesce(p.full_name, p.email, 'Movementz athlete') as full_name,
      p.avatar_url,
      case
        when current_metric = 'days' then (
          select count(distinct sl.completed_at::date)::integer
          from public.session_logs sl
          where sl.owner_id = vp.user_id
            and sl.status = 'completed'
            and sl.completed_at >= date_trunc('week', now())
        )
        when current_metric = 'mood' then (
          select count(distinct dml.log_date)::integer
          from public.daily_mindset_logs dml
          where dml.user_id = vp.user_id
            and dml.log_date >= date_trunc('week', now())::date
        )
        else (
          select count(*)::integer
          from public.session_log_sets sls
          join public.session_log_exercises sle on sle.id = sls.session_exercise_id
          join public.session_logs sl on sl.id = sle.session_id
          where sl.owner_id = vp.user_id
            and sl.status = 'completed'
            and sl.completed_at >= date_trunc('month', now())
            and sls.completed = true
            and sls.kg is not null
            and sls.reps is not null
            and not exists (
              select 1
              from public.session_log_sets prior_sets
              join public.session_log_exercises prior_exercises on prior_exercises.id = prior_sets.session_exercise_id
              join public.session_logs prior_logs on prior_logs.id = prior_exercises.session_id
              where prior_logs.owner_id = sl.owner_id
                and prior_logs.status = 'completed'
                and prior_logs.completed_at < sl.completed_at
                and lower(prior_exercises.exercise_name) = lower(sle.exercise_name)
                and prior_sets.completed = true
                and prior_sets.kg is not null
                and prior_sets.reps is not null
                and (prior_sets.kg * (1 + prior_sets.reps::numeric / 30)) >= (sls.kg * (1 + sls.reps::numeric / 30))
            )
        )
      end as score
    from visible_people vp
    join public.profiles p on p.id = vp.user_id
  )
  select coalesce(jsonb_agg(to_jsonb(item) order by item.score desc, item.full_name), '[]'::jsonb)
  into leaderboard_rows
  from (
    select row_number() over (order by score desc, full_name) as rank, *
    from scores
    order by score desc, full_name
    limit 20
  ) item;

  return jsonb_build_object(
    'metric', current_metric,
    'rows', leaderboard_rows
  );
end;
$$;

grant execute on function public.get_mutual_leaderboard(text) to authenticated;
