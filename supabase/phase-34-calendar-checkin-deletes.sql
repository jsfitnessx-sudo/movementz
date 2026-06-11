-- Movementz Phase 34: delete single or future recurring coach check-ins.
-- Run after phase-33-recurring-coach-checkins.sql.

create table if not exists public.coach_calendar_item_exclusions (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references public.coach_calendar_items(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete cascade,
  occurrence_date date not null,
  reason text not null default 'coach_deleted',
  created_at timestamptz not null default now(),
  unique(calendar_item_id, occurrence_date)
);

create index if not exists coach_calendar_item_exclusions_item_date_idx
  on public.coach_calendar_item_exclusions(calendar_item_id, occurrence_date);

create index if not exists coach_calendar_item_exclusions_coach_date_idx
  on public.coach_calendar_item_exclusions(coach_id, occurrence_date);

alter table public.coach_calendar_item_exclusions enable row level security;

drop policy if exists "coach_calendar_item_exclusions_select_linked" on public.coach_calendar_item_exclusions;
create policy "coach_calendar_item_exclusions_select_linked"
on public.coach_calendar_item_exclusions
for select
to authenticated
using (coach_id = auth.uid() or client_id = auth.uid() or public.is_admin());

drop policy if exists "coach_calendar_item_exclusions_insert_coach" on public.coach_calendar_item_exclusions;
create policy "coach_calendar_item_exclusions_insert_coach"
on public.coach_calendar_item_exclusions
for insert
to authenticated
with check (
  coach_id = auth.uid()
  and exists (
    select 1
    from public.coach_calendar_items item
    where item.id = calendar_item_id
      and item.coach_id = auth.uid()
      and item.item_type = 'checkin'
  )
);

drop policy if exists "coach_calendar_item_exclusions_delete_coach" on public.coach_calendar_item_exclusions;
create policy "coach_calendar_item_exclusions_delete_coach"
on public.coach_calendar_item_exclusions
for delete
to authenticated
using (coach_id = auth.uid() or public.is_admin());

create or replace function public.get_my_due_checkins(target_date date default current_date)
returns table (
  id uuid,
  coach_id uuid,
  coach_name text,
  title text,
  notes text,
  starts_at timestamptz,
  occurrence_date date,
  recurrence_frequency text,
  recurrence_until date,
  response_id uuid,
  responses jsonb,
  response_notes text,
  submitted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    item.id,
    item.coach_id,
    coalesce(coach.full_name, coach.email, 'Coach') as coach_name,
    item.title,
    item.notes,
    item.starts_at,
    target_date as occurrence_date,
    item.recurrence_frequency,
    item.recurrence_until,
    response.id as response_id,
    response.responses,
    response.notes as response_notes,
    response.submitted_at
  from public.coach_calendar_items item
  left join public.profiles coach on coach.id = item.coach_id
  left join public.coach_checkin_responses response
    on response.calendar_item_id = item.id
   and response.client_id = auth.uid()
   and response.occurrence_date = target_date
  left join public.coach_calendar_item_exclusions exclusion
    on exclusion.calendar_item_id = item.id
   and exclusion.occurrence_date = target_date
  where item.item_type = 'checkin'
    and item.client_id = auth.uid()
    and item.status <> 'cancelled'
    and exclusion.id is null
    and item.starts_at::date <= target_date
    and (
      (item.recurrence_frequency = 'none' and item.starts_at::date = target_date)
      or (
        item.recurrence_frequency = 'weekly'
        and coalesce(item.recurrence_until, target_date) >= target_date
        and ((target_date - item.starts_at::date) % 7) = 0
      )
    )
  order by item.starts_at asc;
$$;

grant execute on function public.get_my_due_checkins(date) to authenticated;
