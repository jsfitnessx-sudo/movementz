-- Movementz Phase 33: recurring coach check-ins.
-- Run after phase-32-paid-user-access.sql and phase-29-calendar-admin-summaries.sql.

alter table public.coach_calendar_items
  drop constraint if exists coach_calendar_items_item_type_check;

alter table public.coach_calendar_items
  add constraint coach_calendar_items_item_type_check
  check (item_type in ('appointment', 'task', 'reminder', 'checkin'));

alter table public.coach_calendar_items
  add column if not exists recurrence_frequency text not null default 'none',
  add column if not exists recurrence_until date,
  add column if not exists checkin_questions jsonb not null default '[]'::jsonb;

alter table public.coach_calendar_items
  drop constraint if exists coach_calendar_items_recurrence_frequency_check;

alter table public.coach_calendar_items
  add constraint coach_calendar_items_recurrence_frequency_check
  check (recurrence_frequency in ('none', 'weekly'));

create index if not exists coach_calendar_items_client_starts_idx
  on public.coach_calendar_items(client_id, starts_at);

create table if not exists public.coach_checkin_responses (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references public.coach_calendar_items(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  occurrence_date date not null,
  responses jsonb not null default '{}'::jsonb,
  notes text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(calendar_item_id, client_id, occurrence_date)
);

alter table public.coach_checkin_responses enable row level security;

drop policy if exists "coach_calendar_items_select_own" on public.coach_calendar_items;
create policy "coach_calendar_items_select_own"
on public.coach_calendar_items
for select
to authenticated
using (coach_id = auth.uid() or client_id = auth.uid() or public.is_admin());

drop policy if exists "coach_checkin_responses_select_linked" on public.coach_checkin_responses;
create policy "coach_checkin_responses_select_linked"
on public.coach_checkin_responses
for select
to authenticated
using (coach_id = auth.uid() or client_id = auth.uid() or public.is_admin());

drop policy if exists "coach_checkin_responses_insert_client" on public.coach_checkin_responses;
create policy "coach_checkin_responses_insert_client"
on public.coach_checkin_responses
for insert
to authenticated
with check (
  client_id = auth.uid()
  and exists (
    select 1
    from public.coach_calendar_items item
    where item.id = calendar_item_id
      and item.item_type = 'checkin'
      and item.client_id = auth.uid()
      and item.coach_id = coach_checkin_responses.coach_id
  )
);

drop policy if exists "coach_checkin_responses_update_client" on public.coach_checkin_responses;
create policy "coach_checkin_responses_update_client"
on public.coach_checkin_responses
for update
to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

create or replace function public.set_coach_checkin_responses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.submitted_at = now();
  return new;
end;
$$;

drop trigger if exists coach_checkin_responses_updated_at on public.coach_checkin_responses;
create trigger coach_checkin_responses_updated_at
before update on public.coach_checkin_responses
for each row execute function public.set_coach_checkin_responses_updated_at();

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
  where item.item_type = 'checkin'
    and item.client_id = auth.uid()
    and item.status <> 'cancelled'
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
