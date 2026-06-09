-- Movementz Phase 30: prevent unpaid/self-service coach or admin role upgrades.
-- Run after phase-29-calendar-admin-summaries.sql.

create or replace function public.prevent_self_role_upgrade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
    and lower(coalesce(new.role, '')) in ('coach', 'admin')
    and not public.is_admin()
  then
    raise exception 'Coach/admin access must be granted by Movementz admin or payment provisioning.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_role_upgrade on public.profiles;
create trigger profiles_prevent_self_role_upgrade
before update of role on public.profiles
for each row execute function public.prevent_self_role_upgrade();
