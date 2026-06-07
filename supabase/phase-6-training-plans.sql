create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  plan_type text not null default 'block'
    check (plan_type in ('block', 'no_plan')),
  block_weeks integer,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_plan_workouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  workout_template_id uuid references public.workout_templates(id) on delete set null,
  position integer not null default 1,
  name text not null,
  workout_type text not null default 'strength',
  source_type text not null default 'new'
    check (source_type in ('new', 'imported')),
  summary text,
  scheduled_days text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.training_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  unique (plan_id, client_id)
);

alter table public.training_plans enable row level security;
alter table public.training_plan_workouts enable row level security;
alter table public.training_plan_assignments enable row level security;

drop policy if exists "Users manage own training plans" on public.training_plans;
create policy "Users manage own training plans"
on public.training_plans
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users view assigned training plans" on public.training_plans;
create policy "Users view assigned training plans"
on public.training_plans
for select
to authenticated
using (
  exists (
    select 1
    from public.training_plan_assignments tpa
    where tpa.plan_id = training_plans.id
      and tpa.client_id = auth.uid()
      and tpa.status = 'active'
  )
);

drop policy if exists "Users manage own training plan workouts" on public.training_plan_workouts;
create policy "Users manage own training plan workouts"
on public.training_plan_workouts
for all
to authenticated
using (
  exists (
    select 1
    from public.training_plans tp
    where tp.id = training_plan_workouts.plan_id
      and tp.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.training_plans tp
    where tp.id = training_plan_workouts.plan_id
      and tp.owner_id = auth.uid()
  )
);

drop policy if exists "Users view assigned training plan workouts" on public.training_plan_workouts;
create policy "Users view assigned training plan workouts"
on public.training_plan_workouts
for select
to authenticated
using (
  exists (
    select 1
    from public.training_plans tp
    join public.training_plan_assignments tpa on tpa.plan_id = tp.id
    where tp.id = training_plan_workouts.plan_id
      and tpa.client_id = auth.uid()
      and tpa.status = 'active'
  )
);

drop policy if exists "Coaches manage own training plan assignments" on public.training_plan_assignments;
create policy "Coaches manage own training plan assignments"
on public.training_plan_assignments
for all
to authenticated
using (assigned_by = auth.uid())
with check (assigned_by = auth.uid());

drop policy if exists "Clients view own training plan assignments" on public.training_plan_assignments;
create policy "Clients view own training plan assignments"
on public.training_plan_assignments
for select
to authenticated
using (client_id = auth.uid());

drop policy if exists "profiles_select_linked_clients" on public.profiles;
create policy "profiles_select_linked_clients"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.status = 'active'
      and (
        (cc.coach_id = auth.uid() and cc.client_id = profiles.id)
        or (cc.client_id = auth.uid() and cc.coach_id = profiles.id)
      )
  )
);

create index if not exists training_plans_owner_idx
  on public.training_plans(owner_id, created_at desc);

create index if not exists training_plan_workouts_plan_idx
  on public.training_plan_workouts(plan_id, position);

create index if not exists training_plan_assignments_plan_idx
  on public.training_plan_assignments(plan_id);

create index if not exists training_plan_assignments_client_idx
  on public.training_plan_assignments(client_id, status);
