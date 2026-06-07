-- Movementz Phase 7: coach-client linking helpers
-- Run this after phase-1-auth-profiles.sql.

create or replace function public.search_users_for_client_invite(search_text text)
returns table (
  id uuid,
  full_name text,
  email text,
  role text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.role
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and coalesce(trim(search_text), '') <> ''
    and (
      p.email ilike '%' || trim(search_text) || '%'
      or p.full_name ilike '%' || trim(search_text) || '%'
    )
    and not exists (
      select 1
      from public.coach_clients cc
      where cc.coach_id = auth.uid()
        and cc.client_id = p.id
        and cc.status in ('invited', 'active', 'paused')
    )
  order by p.full_name nulls last, p.email nulls last
  limit 10;
$$;

grant execute on function public.search_users_for_client_invite(text) to authenticated;

create or replace function public.link_client_to_coach(target_client_id uuid)
returns table (
  link_id uuid,
  client_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  created_link public.coach_clients;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select role into current_role
  from public.profiles
  where id = auth.uid();

  if current_role not in ('coach', 'admin') then
    raise exception 'Only coaches can add clients.';
  end if;

  if target_client_id = auth.uid() then
    raise exception 'You cannot add yourself as a client.';
  end if;

  insert into public.coach_clients (coach_id, client_id, status)
  values (auth.uid(), target_client_id, 'active')
  on conflict (coach_id, client_id)
  do update set status = 'active'
  returning * into created_link;

  update public.profiles
  set role = 'client',
      updated_at = now()
  where id = target_client_id
    and role = 'normal_user';

  return query select created_link.id, created_link.client_id, created_link.status;
end;
$$;

grant execute on function public.link_client_to_coach(uuid) to authenticated;
