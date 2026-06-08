-- Movementz Phase 24: client food logging, daily targets and coach nutrition summaries.
-- Run after phase-23-mutual-feed.sql.

create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  brand text,
  serving_quantity numeric not null default 100,
  serving_unit text not null default 'g' check (serving_unit in ('g', 'ml', 'serving')),
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.food_day_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_date date not null,
  target_calories integer not null check (target_calories >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_date)
);

create table if not exists public.food_month_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null,
  target_calories integer not null check (target_calories >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_start)
);

create table if not exists public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_item_id uuid references public.food_items(id) on delete set null,
  food_name text not null,
  quantity numeric not null default 1,
  unit text not null default 'g' check (unit in ('g', 'kg', 'ml', 'l', 'serving')),
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.food_items enable row level security;
alter table public.food_day_targets enable row level security;
alter table public.food_month_targets enable row level security;
alter table public.food_log_entries enable row level security;

drop policy if exists "food_items_select_global_or_own" on public.food_items;
create policy "food_items_select_global_or_own"
on public.food_items
for select
to authenticated
using (owner_id is null or owner_id = auth.uid());

drop policy if exists "food_items_insert_own" on public.food_items;
create policy "food_items_insert_own"
on public.food_items
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "food_items_update_own" on public.food_items;
create policy "food_items_update_own"
on public.food_items
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "food_day_targets_select_own_or_linked_coach" on public.food_day_targets;
create policy "food_day_targets_select_own_or_linked_coach"
on public.food_day_targets
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = food_day_targets.user_id
      and cc.status = 'active'
  )
);

drop policy if exists "food_day_targets_manage_own" on public.food_day_targets;
create policy "food_day_targets_manage_own"
on public.food_day_targets
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "food_month_targets_select_own_or_linked_coach" on public.food_month_targets;
create policy "food_month_targets_select_own_or_linked_coach"
on public.food_month_targets
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = food_month_targets.user_id
      and cc.status = 'active'
  )
);

drop policy if exists "food_month_targets_manage_own" on public.food_month_targets;
create policy "food_month_targets_manage_own"
on public.food_month_targets
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "food_log_entries_select_own_or_linked_coach" on public.food_log_entries;
create policy "food_log_entries_select_own_or_linked_coach"
on public.food_log_entries
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = food_log_entries.user_id
      and cc.status = 'active'
  )
);

drop policy if exists "food_log_entries_manage_own" on public.food_log_entries;
create policy "food_log_entries_manage_own"
on public.food_log_entries
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists food_items_search_idx
  on public.food_items using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, '')));

create index if not exists food_items_owner_created_idx
  on public.food_items(owner_id, created_at desc);

create index if not exists food_log_entries_user_date_idx
  on public.food_log_entries(user_id, log_date desc, meal_type);

create index if not exists food_day_targets_user_date_idx
  on public.food_day_targets(user_id, target_date desc);

create index if not exists food_month_targets_user_month_idx
  on public.food_month_targets(user_id, month_start desc);

create or replace function public.set_food_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists food_day_targets_updated_at on public.food_day_targets;
create trigger food_day_targets_updated_at
before update on public.food_day_targets
for each row execute function public.set_food_updated_at();

drop trigger if exists food_month_targets_updated_at on public.food_month_targets;
create trigger food_month_targets_updated_at
before update on public.food_month_targets
for each row execute function public.set_food_updated_at();

drop trigger if exists food_log_entries_updated_at on public.food_log_entries;
create trigger food_log_entries_updated_at
before update on public.food_log_entries
for each row execute function public.set_food_updated_at();

insert into public.food_items(name, brand, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g, is_verified)
values
  ('Chicken breast cooked', null, 100, 'g', 165, 31, 0, 3.6, true),
  ('Lean beef mince 5%', null, 100, 'g', 155, 21, 0, 5, true),
  ('Salmon fillet', null, 100, 'g', 208, 20, 0, 13, true),
  ('Egg whole', null, 1, 'serving', 72, 6.3, 0.4, 4.8, true),
  ('Greek yoghurt low fat', null, 100, 'g', 73, 10, 3.9, 1.9, true),
  ('Whey protein', null, 30, 'g', 120, 24, 3, 2, true),
  ('White rice cooked', null, 100, 'g', 130, 2.7, 28, 0.3, true),
  ('Brown rice cooked', null, 100, 'g', 123, 2.7, 26, 1, true),
  ('Oats dry', null, 100, 'g', 389, 16.9, 66, 6.9, true),
  ('Sweet potato', null, 100, 'g', 86, 1.6, 20, 0.1, true),
  ('Banana', null, 1, 'serving', 105, 1.3, 27, 0.4, true),
  ('Apple', null, 1, 'serving', 95, 0.5, 25, 0.3, true),
  ('Avocado', null, 100, 'g', 160, 2, 8.5, 14.7, true),
  ('Olive oil', null, 15, 'ml', 119, 0, 0, 13.5, true),
  ('Peanut butter', null, 30, 'g', 188, 7, 6, 16, true),
  ('Milk semi skimmed', null, 100, 'ml', 50, 3.5, 4.8, 1.8, true),
  ('Almond milk unsweetened', null, 100, 'ml', 15, 0.6, 0.3, 1.2, true),
  ('Broccoli', null, 100, 'g', 35, 2.4, 7.2, 0.4, true),
  ('Spinach', null, 100, 'g', 23, 2.9, 3.6, 0.4, true),
  ('Wholemeal bread slice', null, 1, 'serving', 95, 4, 17, 1.5, true)
on conflict do nothing;

insert into public.food_items(name, brand, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g, is_verified)
select seed.name, seed.brand, seed.serving_quantity, seed.serving_unit, seed.calories, seed.protein_g, seed.carbs_g, seed.fat_g, true
from (
  values
    ('Egg whites', null, 100, 'g', 52, 10.9, 0.7, 0.2),
    ('Chicken thigh cooked', null, 100, 'g', 209, 26, 0, 10.9),
    ('Turkey mince lean', null, 100, 'g', 149, 22, 0, 7),
    ('Pork tenderloin', null, 100, 'g', 143, 26, 0, 3.5),
    ('Cod fillet', null, 100, 'g', 82, 18, 0, 0.7),
    ('Prawns cooked', null, 100, 'g', 99, 24, 0.2, 0.3),
    ('Tuna canned in springwater', null, 100, 'g', 116, 26, 0, 1),
    ('Tofu firm', null, 100, 'g', 144, 15.8, 3.9, 8.7),
    ('Lentils cooked', null, 100, 'g', 116, 9, 20, 0.4),
    ('Chickpeas cooked', null, 100, 'g', 164, 8.9, 27, 2.6),
    ('Black beans cooked', null, 100, 'g', 132, 8.9, 24, 0.5),
    ('Kidney beans cooked', null, 100, 'g', 127, 8.7, 22.8, 0.5),
    ('Quinoa cooked', null, 100, 'g', 120, 4.4, 21.3, 1.9),
    ('Pasta cooked', null, 100, 'g', 158, 5.8, 30.9, 0.9),
    ('Couscous cooked', null, 100, 'g', 112, 3.8, 23.2, 0.2),
    ('Potato baked', null, 100, 'g', 93, 2.5, 21.2, 0.1),
    ('Carrot', null, 100, 'g', 41, 0.9, 9.6, 0.2),
    ('Tomato', null, 100, 'g', 18, 0.9, 3.9, 0.2),
    ('Cucumber', null, 100, 'g', 15, 0.7, 3.6, 0.1),
    ('Lettuce', null, 100, 'g', 15, 1.4, 2.9, 0.2),
    ('Mushrooms', null, 100, 'g', 22, 3.1, 3.3, 0.3),
    ('Onion', null, 100, 'g', 40, 1.1, 9.3, 0.1),
    ('Capsicum', null, 100, 'g', 31, 1, 6, 0.3),
    ('Peas', null, 100, 'g', 84, 5.4, 15.6, 0.2),
    ('Corn kernels', null, 100, 'g', 96, 3.4, 21, 1.5),
    ('Blueberries', null, 100, 'g', 57, 0.7, 14.5, 0.3),
    ('Strawberries', null, 100, 'g', 32, 0.7, 7.7, 0.3),
    ('Orange', null, 1, 'serving', 62, 1.2, 15.4, 0.2),
    ('Almonds', null, 30, 'g', 174, 6.4, 6.5, 15),
    ('Walnuts', null, 30, 'g', 196, 4.6, 4.1, 19.6),
    ('Cheddar cheese', null, 30, 'g', 121, 7.5, 0.4, 10),
    ('Cottage cheese low fat', null, 100, 'g', 82, 11.5, 3.4, 2.3),
    ('Skyr yoghurt', null, 100, 'g', 63, 11, 3.6, 0.2),
    ('Butter', null, 10, 'g', 72, 0.1, 0, 8.1),
    ('Mayonnaise', null, 15, 'g', 103, 0.1, 0.1, 11.3),
    ('Hummus', null, 50, 'g', 83, 3.9, 7.1, 4.8),
    ('Protein bar', null, 1, 'serving', 210, 20, 23, 7),
    ('Granola', null, 50, 'g', 235, 5, 32, 9),
    ('Breakfast cereal', null, 40, 'g', 150, 3, 32, 1),
    ('Bagel', null, 1, 'serving', 245, 9.5, 48, 1.5),
    ('Tortilla wrap', null, 1, 'serving', 180, 5, 30, 4),
    ('Bacon cooked', null, 50, 'g', 270, 18.5, 0.7, 21),
    ('Dark chocolate', null, 30, 'g', 180, 2.3, 13.8, 12.9),
    ('Honey', null, 15, 'g', 46, 0, 12.4, 0)
) as seed(name, brand, serving_quantity, serving_unit, calories, protein_g, carbs_g, fat_g)
where not exists (
  select 1
  from public.food_items item
  where item.owner_id is null
    and lower(item.name) = lower(seed.name)
);

create or replace function public.get_food_month_summary(month_start_input date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start_date date := date_trunc('month', coalesce(month_start_input, current_date))::date;
  month_end_date date := (date_trunc('month', coalesce(month_start_input, current_date)) + interval '1 month')::date;
  tracker_target integer := null;
  default_target integer := null;
  rows_json jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gt.target_calories
  into tracker_target
  from public.goal_trackers gt
  where gt.user_id = auth.uid()
    and gt.status = 'active'
  order by gt.start_date desc
  limit 1;

  select fmt.target_calories
  into default_target
  from public.food_month_targets fmt
  where fmt.user_id = auth.uid()
    and fmt.month_start = month_start_date;

  default_target := coalesce(default_target, tracker_target, 0);

  with days as (
    select generate_series(month_start_date, month_end_date - 1, interval '1 day')::date as log_date
  ),
  totals as (
    select
      fle.log_date,
      round(sum(fle.calories))::integer as calories,
      round(sum(fle.protein_g))::integer as protein_g,
      round(sum(fle.carbs_g))::integer as carbs_g,
      round(sum(fle.fat_g))::integer as fat_g
    from public.food_log_entries fle
    where fle.user_id = auth.uid()
      and fle.log_date >= month_start_date
      and fle.log_date < month_end_date
    group by fle.log_date
  )
  select coalesce(jsonb_agg(to_jsonb(item) order by item.log_date), '[]'::jsonb)
  into rows_json
  from (
    select
      d.log_date,
      coalesce(t.calories, 0) as calories,
      coalesce(t.protein_g, 0) as protein_g,
      coalesce(t.carbs_g, 0) as carbs_g,
      coalesce(t.fat_g, 0) as fat_g,
      coalesce(fdt.target_calories, default_target, 0) as target_calories,
      coalesce(fdt.target_calories, default_target, 0) - coalesce(t.calories, 0) as remaining_calories
    from days d
    left join totals t on t.log_date = d.log_date
    left join public.food_day_targets fdt
      on fdt.user_id = auth.uid()
      and fdt.target_date = d.log_date
  ) item;

  return jsonb_build_object(
    'month_start', month_start_date,
    'default_target', default_target,
    'days', rows_json
  );
end;
$$;

grant execute on function public.get_food_month_summary(date) to authenticated;

create or replace function public.get_coach_client_food_summary(target_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_linked boolean := false;
  today_target integer := 0;
  today_calories integer := 0;
  week_average integer := 0;
  monthly_compliance integer := 0;
  recent_rows jsonb := '[]'::jsonb;
begin
  select exists (
    select 1
    from public.coach_clients cc
    where cc.coach_id = auth.uid()
      and cc.client_id = target_client_id
      and cc.status = 'active'
  )
  into is_linked;

  if not is_linked and not public.is_admin() then
    raise exception 'Only the linked coach can view this food summary.';
  end if;

  select coalesce(sum(fle.calories), 0)::integer
  into today_calories
  from public.food_log_entries fle
  where fle.user_id = target_client_id
    and fle.log_date = current_date;

  select coalesce(fdt.target_calories, fmt.target_calories, gt.target_calories, 0)
  into today_target
  from (select target_client_id as user_id) u
  left join public.food_day_targets fdt
    on fdt.user_id = u.user_id
    and fdt.target_date = current_date
  left join public.food_month_targets fmt
    on fmt.user_id = u.user_id
    and fmt.month_start = date_trunc('month', current_date)::date
  left join lateral (
    select target_calories
    from public.goal_trackers
    where user_id = u.user_id
      and status = 'active'
    order by start_date desc
    limit 1
  ) gt on true;

  with day_totals as (
    select
      fle.log_date,
      sum(fle.calories)::integer as calories
    from public.food_log_entries fle
    where fle.user_id = target_client_id
      and fle.log_date >= current_date - interval '6 days'
    group by fle.log_date
  )
  select coalesce(round(avg(calories))::integer, 0)
  into week_average
  from day_totals;

  with month_days as (
    select
      fle.log_date,
      sum(fle.calories)::integer as calories
    from public.food_log_entries fle
    where fle.user_id = target_client_id
      and fle.log_date >= date_trunc('month', current_date)::date
    group by fle.log_date
  )
  select coalesce(round(avg(case when today_target > 0 and calories <= today_target then 100 else 0 end))::integer, 0)
  into monthly_compliance
  from month_days;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.log_date desc), '[]'::jsonb)
  into recent_rows
  from (
    select
      fle.log_date,
      round(sum(fle.calories))::integer as calories,
      round(sum(fle.protein_g))::integer as protein_g,
      count(*)::integer as items
    from public.food_log_entries fle
    where fle.user_id = target_client_id
    group by fle.log_date
    order by fle.log_date desc
    limit 7
  ) item;

  return jsonb_build_object(
    'today_calories', coalesce(today_calories, 0),
    'today_target', coalesce(today_target, 0),
    'today_remaining', coalesce(today_target, 0) - coalesce(today_calories, 0),
    'week_average', coalesce(week_average, 0),
    'monthly_compliance', coalesce(monthly_compliance, 0),
    'recent_days', recent_rows
  );
end;
$$;

grant execute on function public.get_coach_client_food_summary(uuid) to authenticated;

-- Keep the admin factory reset complete once food logging is installed.
create or replace function public.admin_factory_reset_account(target_user_id uuid)
returns table(deleted_rows integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  total_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can factory reset accounts.';
  end if;

  if target_user_id is null then
    raise exception 'Choose an account to reset.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot factory reset the signed-in admin account.';
  end if;

  total_deleted := total_deleted + public.admin_delete_user_rows('coaching_messages', 'sender_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coaching_messages', 'coach_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coaching_messages', 'client_id', target_user_id);

  total_deleted := total_deleted + public.admin_delete_user_rows('coach_workout_assignments', 'coach_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coach_workout_assignments', 'client_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('training_plan_assignments', 'assigned_by', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('training_plan_assignments', 'client_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('training_plans', 'owner_id', target_user_id);

  total_deleted := total_deleted + public.admin_delete_user_rows('session_logs', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('workout_templates', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('goal_tracker_checkins', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('goal_trackers', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('progress_photos', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('daily_habit_logs', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('food_log_entries', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('food_day_targets', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('food_month_targets', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('food_items', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('daily_mindset_logs', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('mindset_future_reminders', 'user_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('user_exercise_options', 'owner_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('exercise_review_requests', 'requester_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('invites', 'inviter_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('invites', 'used_by', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coach_clients', 'coach_id', target_user_id);
  total_deleted := total_deleted + public.admin_delete_user_rows('coach_clients', 'client_id', target_user_id);

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'updated_at'
  ) then
    execute 'update public.profiles set updated_at = now() where id = $1'
    using target_user_id;
  end if;

  deleted_rows := total_deleted;
  return next;
end;
$$;

grant execute on function public.admin_factory_reset_account(uuid) to authenticated;
