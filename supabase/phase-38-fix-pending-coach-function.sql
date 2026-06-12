-- Movementz Phase 38: fix pending coach function ambiguous id error.
-- Run this if coach checkout says:
-- "Could not prepare coach profile: column reference "id" is ambiguous"

drop function if exists public.prepare_pending_coach(uuid, text);

create or replace function public.prepare_pending_coach(
  target_user_id uuid,
  customer_id text default null
)
returns table (
  profile_id uuid,
  profile_role text,
  profile_access_tier text,
  profile_subscription_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_auth_user auth.users%rowtype;
  profile_name text;
begin
  if target_user_id is null then
    raise exception 'User id is required.';
  end if;

  select auth_users.* into current_auth_user
  from auth.users auth_users
  where auth_users.id = target_user_id;

  if current_auth_user.id is null then
    raise exception 'User not found.';
  end if;

  profile_name := coalesce(
    nullif(current_auth_user.raw_user_meta_data->>'full_name', ''),
    current_auth_user.email,
    'Coach'
  );

  perform set_config('movementz.role_provisioning', 'true', true);

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    access_tier,
    stripe_customer_id,
    subscription_status
  )
  values (
    target_user_id,
    current_auth_user.email,
    profile_name,
    'coach',
    'free',
    customer_id,
    'pending_coach'
  )
  on conflict (id)
  do update set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = case
      when public.profiles.role = 'admin' then public.profiles.role
      else 'coach'
    end,
    access_tier = case
      when public.profiles.role = 'admin' then public.profiles.access_tier
      when public.profiles.access_tier = 'coach' then public.profiles.access_tier
      else 'free'
    end,
    stripe_customer_id = coalesce(customer_id, public.profiles.stripe_customer_id),
    subscription_status = case
      when public.profiles.access_tier = 'coach' then public.profiles.subscription_status
      else 'pending_coach'
    end,
    updated_at = now();

  insert into public.coach_profiles (
    user_id,
    qualification,
    experience_areas,
    about_me,
    verification_status
  )
  values (
    target_user_id,
    nullif(current_auth_user.raw_user_meta_data->>'qualification', ''),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(current_auth_user.raw_user_meta_data->'experience_areas', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(current_auth_user.raw_user_meta_data->>'about_me', ''),
    'pending'
  )
  on conflict (user_id)
  do update set
    qualification = coalesce(nullif(public.coach_profiles.qualification, ''), excluded.qualification),
    experience_areas = case
      when cardinality(public.coach_profiles.experience_areas) > 0 then public.coach_profiles.experience_areas
      else excluded.experience_areas
    end,
    about_me = coalesce(nullif(public.coach_profiles.about_me, ''), excluded.about_me),
    verification_status = case
      when public.coach_profiles.verification_status = 'verified' then public.coach_profiles.verification_status
      else 'pending'
    end,
    updated_at = now();

  return query
  select
    prepared_profile.id,
    prepared_profile.role,
    prepared_profile.access_tier,
    prepared_profile.subscription_status
  from public.profiles prepared_profile
  where prepared_profile.id = target_user_id;
end;
$$;

revoke all on function public.prepare_pending_coach(uuid, text) from public;
grant execute on function public.prepare_pending_coach(uuid, text) to service_role;
