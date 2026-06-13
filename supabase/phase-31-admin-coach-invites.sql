-- Movementz Phase 31: admin-only free coach invites for beta testing.
-- Run after phase-30-role-upgrade-guard.sql.

drop function if exists public.create_admin_coach_invite(text);
drop function if exists public.preview_admin_coach_invite(text);
drop function if exists public.accept_admin_coach_invite(text);

create or replace function public.prevent_self_role_upgrade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('movementz.role_provisioning', true) = 'true' then
    return new;
  end if;

  if new.role is distinct from old.role
    and lower(coalesce(new.role, '')) in ('coach', 'admin')
    and not public.is_admin()
  then
    raise exception 'Coach/admin access must be granted by Movementz admin or payment provisioning.';
  end if;

  return new;
end;
$$;

create or replace function public.create_admin_coach_invite(invite_email text default null)
returns table (
  invite_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invite public.invites;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create free coach invites.';
  end if;

  insert into public.invites (inviter_id, invite_type, email, expires_at)
  values (
    auth.uid(),
    'coach',
    nullif(lower(trim(invite_email)), ''),
    now() + interval '14 days'
  )
  returning * into created_invite;

  return query select created_invite.invite_code;
end;
$$;

grant execute on function public.create_admin_coach_invite(text) to authenticated;

create or replace function public.preview_admin_coach_invite(invite_code_input text)
returns table (
  invite_code text,
  invite_email text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.invite_code,
    i.email as invite_email,
    i.expires_at
  from public.invites i
  where i.invite_code = upper(trim(invite_code_input))
    and i.invite_type = 'coach'
    and i.used_at is null
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

grant execute on function public.preview_admin_coach_invite(text) to anon, authenticated;

create or replace function public.accept_admin_coach_invite(invite_code_input text)
returns table (
  coach_id uuid,
  coach_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.invites;
  current_auth_user auth.users;
  profile_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept a coach invite.';
  end if;

  select *
  into invite_row
  from public.invites
  where invite_code = upper(trim(invite_code_input))
    and invite_type = 'coach'
    and used_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if invite_row.id is null then
    raise exception 'Coach invite is invalid, expired, or already used.';
  end if;

  select *
  into current_auth_user
  from auth.users
  where id = auth.uid();

  if invite_row.email is not null and lower(current_auth_user.email) <> lower(invite_row.email) then
    raise exception 'This coach invite is for a different email address.';
  end if;

  profile_name := coalesce(
    current_auth_user.raw_user_meta_data->>'full_name',
    current_auth_user.email,
    'Coach'
  );

  perform set_config('movementz.role_provisioning', 'true', true);

  insert into public.profiles (id, email, full_name, role)
  values (auth.uid(), current_auth_user.email, profile_name, 'coach')
  on conflict (id)
  do update set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = 'coach',
    updated_at = now();

  insert into public.coach_profiles (
    user_id,
    qualification,
    experience_areas,
    about_me,
    verification_status
  )
  values (
    auth.uid(),
    nullif(current_auth_user.raw_user_meta_data->>'qualification', ''),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(current_auth_user.raw_user_meta_data->'experience_areas', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(current_auth_user.raw_user_meta_data->>'about_me', ''),
    'verified'
  )
  on conflict (user_id)
  do update set
    qualification = coalesce(public.coach_profiles.qualification, excluded.qualification),
    experience_areas = case
      when cardinality(public.coach_profiles.experience_areas) > 0 then public.coach_profiles.experience_areas
      else excluded.experience_areas
    end,
    about_me = coalesce(public.coach_profiles.about_me, excluded.about_me),
    verification_status = 'verified',
    updated_at = now();

  update public.invites
  set used_by = auth.uid(),
      used_at = now()
  where id = invite_row.id;

  return query select auth.uid(), profile_name;
end;
$$;

grant execute on function public.accept_admin_coach_invite(text) to authenticated;

notify pgrst, 'reload schema';
