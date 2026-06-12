-- Movementz Phase 35: paid coach subscription provisioning.
-- Run after phase-32-paid-user-access.sql.

create or replace function public.provision_paid_coach(
  target_user_id uuid,
  customer_id text,
  subscription_id text,
  price_id text,
  subscription_status text,
  paid_until timestamptz default null
)
returns table (
  id uuid,
  role text,
  access_tier text,
  subscription_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_auth_user auth.users;
  profile_name text;
  is_active boolean;
begin
  if target_user_id is null then
    raise exception 'User id is required.';
  end if;

  select * into current_auth_user
  from auth.users
  where auth.users.id = target_user_id;

  if current_auth_user.id is null then
    raise exception 'User not found.';
  end if;

  is_active := lower(coalesce(subscription_status, '')) in ('active', 'trialing');
  profile_name := coalesce(
    current_auth_user.raw_user_meta_data->>'full_name',
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
    paid_access_until,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    subscription_status
  )
  values (
    target_user_id,
    current_auth_user.email,
    profile_name,
    case when is_active then 'coach' else 'normal_user' end,
    case when is_active then 'coach' else 'free' end,
    paid_until,
    customer_id,
    subscription_id,
    price_id,
    subscription_status
  )
  on conflict (id)
  do update set
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = case
      when public.profiles.role = 'admin' then public.profiles.role
      when is_active then 'coach'
      when public.profiles.role = 'coach' and public.profiles.stripe_subscription_id = subscription_id then 'normal_user'
      else public.profiles.role
    end,
    access_tier = case
      when public.profiles.role = 'admin' then public.profiles.access_tier
      when is_active then 'coach'
      when public.profiles.stripe_subscription_id = subscription_id then 'free'
      else public.profiles.access_tier
    end,
    paid_access_until = paid_until,
    stripe_customer_id = customer_id,
    stripe_subscription_id = subscription_id,
    stripe_price_id = price_id,
    subscription_status = subscription_status,
    updated_at = now();

  if is_active then
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
      'verified'
    )
    on conflict (user_id)
    do update set
      qualification = coalesce(nullif(public.coach_profiles.qualification, ''), excluded.qualification),
      experience_areas = case
        when cardinality(public.coach_profiles.experience_areas) > 0 then public.coach_profiles.experience_areas
        else excluded.experience_areas
      end,
      about_me = coalesce(nullif(public.coach_profiles.about_me, ''), excluded.about_me),
      verification_status = 'verified',
      updated_at = now();
  end if;

  return query
  select p.id, p.role, p.access_tier, p.subscription_status
  from public.profiles p
  where p.id = target_user_id;
end;
$$;

revoke all on function public.provision_paid_coach(uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.provision_paid_coach(uuid, text, text, text, text, timestamptz) to service_role;
