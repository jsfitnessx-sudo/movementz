-- Movementz Phase 40: one-time coach client invite links with full client access
-- Run this after phase-32-paid-user-access.sql and phase-7-coach-client-links.sql.

alter table public.invites
  add column if not exists invitee_full_name text;

create index if not exists invites_client_email_unused_idx
  on public.invites (lower(email), invite_type, used_at)
  where invite_type = 'client';

drop function if exists public.create_coach_client_invite(text, text);

create or replace function public.create_coach_client_invite(
  target_client_email text,
  target_client_full_name text
)
returns table (
  invite_code text,
  invite_email text,
  invitee_full_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  has_coach_profile boolean;
  clean_email text;
  clean_name text;
  created_invite public.invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  clean_email := lower(trim(coalesce(target_client_email, '')));
  clean_name := trim(coalesce(target_client_full_name, ''));

  if clean_name = '' then
    raise exception 'Client full name is required.';
  end if;

  if clean_email = '' or clean_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'A valid client email is required.';
  end if;

  select lower(trim(coalesce(role, ''))) into current_role
  from public.profiles
  where id = auth.uid();

  select exists (
    select 1
    from public.coach_profiles
    where user_id = auth.uid()
  )
  into has_coach_profile;

  if current_role not in ('coach', 'admin') and not has_coach_profile then
    raise exception 'Only coaches can create client invite links. Current database role: %.', coalesce(current_role, 'missing');
  end if;

  if has_coach_profile and current_role = 'normal_user' then
    update public.profiles
    set role = 'coach',
        updated_at = now()
    where id = auth.uid();
  end if;

  insert into public.invites (
    inviter_id,
    invite_type,
    email,
    invitee_full_name,
    expires_at
  )
  values (
    auth.uid(),
    'client',
    clean_email,
    clean_name,
    now() + interval '14 days'
  )
  returning * into created_invite;

  return query
  select
    created_invite.invite_code,
    created_invite.email,
    created_invite.invitee_full_name,
    created_invite.expires_at;
end;
$$;

grant execute on function public.create_coach_client_invite(text, text) to authenticated;

drop function if exists public.preview_client_signup_invite(text);

create or replace function public.preview_client_signup_invite(invite_code_input text)
returns table (
  invite_code text,
  invite_email text,
  invitee_full_name text,
  coach_id uuid,
  coach_name text,
  coach_email text
)
language sql
security definer
set search_path = public
as $$
  select
    i.invite_code,
    i.email as invite_email,
    i.invitee_full_name,
    p.id as coach_id,
    coalesce(p.full_name, p.email, 'Coach') as coach_name,
    p.email as coach_email
  from public.invites i
  join public.profiles p on p.id = i.inviter_id
  where i.invite_code = upper(trim(invite_code_input))
    and i.invite_type = 'client'
    and i.used_at is null
    and (i.expires_at is null or i.expires_at > now())
    and lower(p.role) in ('coach', 'admin')
  limit 1;
$$;

grant execute on function public.preview_client_signup_invite(text) to anon, authenticated;

drop function if exists public.preview_client_invite(text);

create or replace function public.preview_client_invite(invite_code_input text)
returns table (
  invite_code text,
  invite_email text,
  invitee_full_name text,
  coach_id uuid,
  coach_name text,
  coach_email text
)
language sql
security definer
set search_path = public
as $$
  select
    i.invite_code,
    i.email as invite_email,
    i.invitee_full_name,
    p.id as coach_id,
    coalesce(p.full_name, p.email, 'Coach') as coach_name,
    p.email as coach_email
  from public.invites i
  join public.profiles p on p.id = i.inviter_id
  join auth.users au on au.id = auth.uid()
  where auth.uid() is not null
    and i.invite_code = upper(trim(invite_code_input))
    and i.invite_type = 'client'
    and i.used_at is null
    and (i.expires_at is null or i.expires_at > now())
    and i.inviter_id <> auth.uid()
    and lower(p.role) in ('coach', 'admin')
    and (
      i.email is null
      or lower(i.email) = lower(coalesce(au.email, ''))
    )
  limit 1;
$$;

grant execute on function public.preview_client_invite(text) to authenticated;

create or replace function public.accept_client_invite(invite_code_input text)
returns table (
  coach_id uuid,
  coach_name text,
  link_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.invites;
  coach_profile public.profiles;
  created_link public.coach_clients;
  current_auth_user auth.users;
  existing_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an invite.';
  end if;

  select *
  into invite_row
  from public.invites
  where invite_code = upper(trim(invite_code_input))
    and invite_type = 'client'
    and used_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if invite_row.id is null then
    raise exception 'Invite link is invalid or already used.';
  end if;

  if invite_row.inviter_id = auth.uid() then
    raise exception 'You cannot accept your own invite link.';
  end if;

  select *
  into current_auth_user
  from auth.users
  where id = auth.uid();

  if invite_row.email is not null
    and lower(invite_row.email) <> lower(coalesce(current_auth_user.email, '')) then
    raise exception 'This invite was created for %, but you are signed in as %.', invite_row.email, coalesce(current_auth_user.email, 'unknown');
  end if;

  select *
  into coach_profile
  from public.profiles
  where id = invite_row.inviter_id
    and lower(role) in ('coach', 'admin');

  if coach_profile.id is null then
    raise exception 'This invite is not attached to an active coach.';
  end if;

  select *
  into existing_profile
  from public.profiles
  where id = auth.uid();

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    admin_granted_paid_access
  )
  values (
    auth.uid(),
    current_auth_user.email,
    coalesce(nullif(invite_row.invitee_full_name, ''), current_auth_user.raw_user_meta_data->>'full_name', current_auth_user.email),
    'client',
    true
  )
  on conflict (id)
  do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = case
      when public.profiles.role in ('admin', 'coach') then public.profiles.role
      else 'client'
    end,
    admin_granted_paid_access = true,
    updated_at = now();

  insert into public.coach_clients (coach_id, client_id, status)
  values (invite_row.inviter_id, auth.uid(), 'active')
  on conflict on constraint coach_clients_coach_id_client_id_key
  do update set status = 'active'
  returning * into created_link;

  update public.invites
  set used_by = auth.uid(),
      used_at = now()
  where id = invite_row.id;

  return query
  select
    coach_profile.id,
    coalesce(coach_profile.full_name, coach_profile.email, 'Coach'),
    created_link.id;
end;
$$;

grant execute on function public.accept_client_invite(text) to authenticated;

create or replace function public.decline_client_invite(invite_code_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_email_for_link text;
  current_user_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to decline an invite.';
  end if;

  select i.email, au.email
  into invite_email_for_link, current_user_email
  from public.invites i
  join auth.users au on au.id = auth.uid()
  where i.invite_code = upper(trim(invite_code_input))
    and i.invite_type = 'client'
    and i.used_at is null
    and i.inviter_id <> auth.uid()
  limit 1;

  update public.invites
  set used_by = auth.uid(),
      used_at = now()
  where invite_code = upper(trim(invite_code_input))
    and invite_type = 'client'
    and used_at is null
    and inviter_id <> auth.uid()
    and (
      invite_email_for_link is null
      or lower(invite_email_for_link) = lower(coalesce(current_user_email, ''))
    );
end;
$$;

grant execute on function public.decline_client_invite(text) to authenticated;

notify pgrst, 'reload schema';
