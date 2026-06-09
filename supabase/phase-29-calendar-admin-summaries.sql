-- Movementz Phase 29: coach calendar plus admin-safe user and coach summaries.
-- Run after phase-28-daily-affirmation-push.sql.

create table if not exists public.coach_calendar_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  item_type text not null default 'appointment'
    check (item_type in ('appointment', 'task', 'reminder')),
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_calendar_items enable row level security;

drop policy if exists "coach_calendar_items_select_own" on public.coach_calendar_items;
create policy "coach_calendar_items_select_own"
on public.coach_calendar_items
for select
to authenticated
using (coach_id = auth.uid() or public.is_admin());

drop policy if exists "coach_calendar_items_insert_own" on public.coach_calendar_items;
create policy "coach_calendar_items_insert_own"
on public.coach_calendar_items
for insert
to authenticated
with check (coach_id = auth.uid());

drop policy if exists "coach_calendar_items_update_own" on public.coach_calendar_items;
create policy "coach_calendar_items_update_own"
on public.coach_calendar_items
for update
to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists "coach_calendar_items_delete_own" on public.coach_calendar_items;
create policy "coach_calendar_items_delete_own"
on public.coach_calendar_items
for delete
to authenticated
using (coach_id = auth.uid());

create index if not exists coach_calendar_items_coach_starts_idx
  on public.coach_calendar_items(coach_id, starts_at);

create or replace function public.set_coach_calendar_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_calendar_items_updated_at on public.coach_calendar_items;
create trigger coach_calendar_items_updated_at
before update on public.coach_calendar_items
for each row execute function public.set_coach_calendar_items_updated_at();

create or replace function public.get_admin_user_summaries()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  location text,
  created_at timestamptz,
  last_sign_in_at timestamptz
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
    au.last_sign_in_at
  from auth.users au
  left join public.profiles p on p.id = au.id
  where public.is_admin()
  order by au.created_at desc
  limit 500;
$$;

grant execute on function public.get_admin_user_summaries() to authenticated;

create or replace function public.get_admin_coach_summaries()
returns table (
  id uuid,
  full_name text,
  email text,
  qualification text,
  specialty text[],
  years_experience integer,
  client_count integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(p.full_name, p.email, 'Coach') as full_name,
    p.email,
    cp.qualification,
    coalesce(cp.experience_areas, '{}'::text[]) as specialty,
    cp.years_experience,
    count(cc.client_id) filter (where cc.status = 'active')::integer as client_count,
    p.created_at
  from public.profiles p
  left join public.coach_profiles cp on cp.user_id = p.id
  left join public.coach_clients cc on cc.coach_id = p.id
  where public.is_admin()
    and lower(coalesce(p.role, '')) in ('coach', 'admin')
  group by p.id, p.full_name, p.email, cp.qualification, cp.experience_areas, cp.years_experience, p.created_at
  order by client_count desc, p.created_at desc;
$$;

grant execute on function public.get_admin_coach_summaries() to authenticated;
