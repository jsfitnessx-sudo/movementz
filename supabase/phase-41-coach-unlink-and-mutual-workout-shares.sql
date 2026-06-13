-- Movementz Phase 41: coach unlinking and mutual workout shares
-- Run after phase-32-paid-user-access.sql and phase-40-coach-client-full-access-invites.sql.

create table if not exists public.mutual_workout_shares (
  id uuid primary key default gen_random_uuid(),
  workout_template_id uuid not null references public.workout_templates(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (sender_id <> recipient_id),
  unique (workout_template_id, sender_id, recipient_id)
);

alter table public.mutual_workout_shares enable row level security;

drop policy if exists "Mutual workout shares visible to both people" on public.mutual_workout_shares;
create policy "Mutual workout shares visible to both people"
on public.mutual_workout_shares for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Users create their mutual workout shares" on public.mutual_workout_shares;
create policy "Users create their mutual workout shares"
on public.mutual_workout_shares for insert
to authenticated
with check (auth.uid() = sender_id);

drop policy if exists "Users revoke their mutual workout shares" on public.mutual_workout_shares;
create policy "Users revoke their mutual workout shares"
on public.mutual_workout_shares for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

create index if not exists mutual_workout_shares_recipient_idx
on public.mutual_workout_shares (recipient_id, status, shared_at desc);

create index if not exists mutual_workout_shares_sender_idx
on public.mutual_workout_shares (sender_id, status, shared_at desc);

create or replace function public.unlink_coach_client(p_client_id uuid)
returns table(client_id uuid, link_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_links integer := 0;
  signed_in_role text;
  client_role text;
  client_subscription_status text;
  client_paid_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select lower(coalesce(p.role, 'normal_user'))
  into signed_in_role
  from public.profiles p
  where p.id = auth.uid();

  if signed_in_role not in ('coach', 'admin') then
    raise exception 'Only coaches can unlink clients.';
  end if;

  update public.coach_clients cc
  set status = 'archived',
      updated_at = now()
  where cc.coach_id = auth.uid()
    and cc.client_id = p_client_id
    and cc.status in ('active', 'paused', 'invited');

  if not found then
    raise exception 'Active client link not found.';
  end if;

  update public.coach_workout_assignments cwa
  set status = 'archived'
  where cwa.coach_id = auth.uid()
    and cwa.client_id = p_client_id
    and cwa.status in ('active', 'paused');

  select count(*)
  into active_links
  from public.coach_clients cc
  where cc.client_id = p_client_id
    and cc.status = 'active';

  select
    lower(coalesce(p.role, 'normal_user')),
    lower(coalesce(p.subscription_status, '')),
    p.paid_access_until
  into client_role, client_subscription_status, client_paid_until
  from public.profiles p
  where p.id = p_client_id;

  if active_links = 0
    and client_role not in ('admin', 'coach')
    and not (
      client_subscription_status in ('active', 'trialing')
      and (client_paid_until is null or client_paid_until > now())
    )
  then
    update public.profiles p
    set role = 'normal_user',
        access_tier = 'free',
        admin_granted_paid_access = false,
        paid_access_until = null,
        updated_at = now()
    where p.id = p_client_id;
  elsif active_links = 0 then
    update public.profiles p
    set admin_granted_paid_access = false,
        updated_at = now()
    where p.id = p_client_id;
  end if;

  return query select p_client_id, 'archived'::text;
end;
$$;

grant execute on function public.unlink_coach_client(uuid) to authenticated;

create or replace function public.get_my_mutual_workout_recipients()
returns table(user_id uuid, full_name text, email text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    coalesce(p.full_name, p.email, 'Movementz athlete') as full_name,
    p.email,
    p.avatar_url
  from public.mutual_connections mc
  join public.profiles p
    on p.id = case
      when mc.requester_id = auth.uid() then mc.recipient_id
      else mc.requester_id
    end
  where auth.uid() is not null
    and mc.status = 'active'
    and (mc.requester_id = auth.uid() or mc.recipient_id = auth.uid())
    and public.user_has_paid_access(auth.uid())
    and public.user_has_paid_access(p.id)
  order by coalesce(p.full_name, p.email, 'Movementz athlete');
$$;

grant execute on function public.get_my_mutual_workout_recipients() to authenticated;

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

  select wt.owner_id, coalesce(wt.source_type, 'personal')
  into template_owner, template_source
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

  return share_id;
end;
$$;

grant execute on function public.share_workout_with_mutual(uuid, uuid) to authenticated;

create or replace function public.get_my_mutual_shared_workouts()
returns table(
  share_id uuid,
  shared_at timestamptz,
  shared_by_id uuid,
  shared_by_name text,
  workout jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    mws.id as share_id,
    mws.shared_at,
    mws.sender_id as shared_by_id,
    coalesce(sender.full_name, sender.email, 'Movementz athlete') as shared_by_name,
    jsonb_build_object(
      'id', wt.id,
      'name', wt.name,
      'notes', wt.notes,
      'workout_type', wt.workout_type,
      'hiit_timer_type', wt.hiit_timer_type,
      'hiit_rounds', wt.hiit_rounds,
      'hiit_work_seconds', wt.hiit_work_seconds,
      'hiit_rest_seconds', wt.hiit_rest_seconds,
      'hiit_station_rest_seconds', wt.hiit_station_rest_seconds,
      'hiit_countdown_seconds', wt.hiit_countdown_seconds,
      'hiit_goal_seconds', wt.hiit_goal_seconds,
      'hiit_focus_area', wt.hiit_focus_area,
      'source_type', 'mutual_shared',
      'workout_template_exercises', coalesce(exercises.items, '[]'::jsonb)
    ) as workout
  from public.mutual_workout_shares mws
  join public.workout_templates wt on wt.id = mws.workout_template_id
  join public.profiles sender on sender.id = mws.sender_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', wte.id,
        'position', wte.position,
        'exercise_name', wte.exercise_name,
        'muscle_group', wte.muscle_group,
        'sets', wte.sets,
        'rep_min', wte.rep_min,
        'rep_max', wte.rep_max,
        'start_kg', wte.start_kg,
        'rest_seconds', wte.rest_seconds,
        'tip', wte.tip,
        'target_type', wte.target_type,
        'target_value', wte.target_value
      )
      order by wte.position
    ) as items
    from public.workout_template_exercises wte
    where wte.template_id = wt.id
  ) exercises on true
  where auth.uid() is not null
    and mws.recipient_id = auth.uid()
    and mws.status = 'active'
    and wt.status = 'active'
  order by mws.shared_at desc
  limit 50;
$$;

grant execute on function public.get_my_mutual_shared_workouts() to authenticated;

create or replace function public.revoke_mutual_workout_share(p_share_id uuid)
returns table(share_id uuid, share_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  update public.mutual_workout_shares mws
  set status = 'revoked',
      revoked_at = now()
  where mws.id = p_share_id
    and mws.sender_id = auth.uid()
    and mws.status = 'active';

  if not found then
    raise exception 'Active mutual workout share not found.';
  end if;

  return query select p_share_id, 'revoked'::text;
end;
$$;

grant execute on function public.revoke_mutual_workout_share(uuid) to authenticated;

notify pgrst, 'reload schema';
