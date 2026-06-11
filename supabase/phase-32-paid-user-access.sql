-- Movementz Phase 32: paid user access, admin grants and paid-only mutuals.
-- Run after phase-23-mutual-feed.sql and phase-29-calendar-admin-summaries.sql.

alter table public.profiles
  add column if not exists access_tier text not null default 'free'
    check (access_tier in ('free', 'paid', 'coach', 'admin')),
  add column if not exists paid_access_until timestamptz,
  add column if not exists admin_granted_paid_access boolean not null default false,
  add column if not exists feature_overrides jsonb not null default '{}'::jsonb,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists subscription_status text;

create index if not exists profiles_access_tier_idx
  on public.profiles(access_tier);

create index if not exists profiles_stripe_customer_idx
  on public.profiles(stripe_customer_id)
  where stripe_customer_id is not null;

create or replace function public.user_has_paid_access(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and (
        lower(coalesce(p.role, 'normal_user')) in ('admin', 'coach', 'client')
        or p.admin_granted_paid_access is true
        or p.access_tier in ('admin', 'coach')
        or (
          p.access_tier = 'paid'
          and (p.paid_access_until is null or p.paid_access_until > now())
        )
      )
  );
$$;

grant execute on function public.user_has_paid_access(uuid) to authenticated;

create or replace function public.admin_set_paid_access(
  target_user_id uuid,
  grant_access boolean,
  access_until timestamptz default null
)
returns table (
  id uuid,
  access_tier text,
  paid_access_until timestamptz,
  admin_granted_paid_access boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change paid access.';
  end if;

  update public.profiles p
  set admin_granted_paid_access = grant_access,
      access_tier = case
        when grant_access and p.role not in ('admin', 'coach', 'client') then 'paid'
        when not grant_access and p.subscription_status is null and p.role not in ('admin', 'coach', 'client') then 'free'
        else p.access_tier
      end,
      paid_access_until = case when grant_access then access_until else p.paid_access_until end,
      updated_at = now()
  where p.id = target_user_id;

  if not found then
    raise exception 'User profile not found.';
  end if;

  return query
  select p.id, p.access_tier, p.paid_access_until, p.admin_granted_paid_access
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

grant execute on function public.admin_set_paid_access(uuid, boolean, timestamptz) to authenticated;

create or replace function public.get_admin_user_summaries()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  location text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  access_tier text,
  paid_access_until timestamptz,
  admin_granted_paid_access boolean,
  feature_overrides jsonb,
  subscription_status text
)
language sql
security definer
set search_path = public
as $$
  select
    au.id,
    coalesce(p.full_name, au.raw_user_meta_data->>'full_name', au.email, 'User') as full_name,
    coalesce(p.email, au.email) as email,
    coalesce(p.role, 'normal_user') as role,
    p.location,
    au.created_at,
    au.last_sign_in_at,
    coalesce(p.access_tier, 'free') as access_tier,
    p.paid_access_until,
    coalesce(p.admin_granted_paid_access, false) as admin_granted_paid_access,
    coalesce(p.feature_overrides, '{}'::jsonb) as feature_overrides,
    p.subscription_status
  from auth.users au
  left join public.profiles p on p.id = au.id
  where public.is_admin()
  order by au.created_at desc
  limit 500;
$$;

grant execute on function public.get_admin_user_summaries() to authenticated;

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
    and public.user_has_paid_access(auth.uid())
    and public.user_has_paid_access(p.id)
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

  if not public.user_has_paid_access(auth.uid()) then
    raise exception 'Upgrade to request mutual access.';
  end if;

  if not public.user_has_paid_access(target_user_id) then
    raise exception 'That user needs paid access before mutual features can be used.';
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
declare
  requester uuid;
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

  if requester is null then
    raise exception 'Mutual request not found.';
  end if;

  if lower(response_status) = 'active'
    and (not public.user_has_paid_access(auth.uid()) or not public.user_has_paid_access(requester)) then
    raise exception 'Both users need paid access before mutual features can be used.';
  end if;

  update public.mutual_connections
  set status = lower(response_status),
      responded_at = now()
  where id = connection_id
    and recipient_id = auth.uid()
    and status = 'pending';

  return connection_id;
end;
$$;

grant execute on function public.respond_mutual(uuid, text) to authenticated;
