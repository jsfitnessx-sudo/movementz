-- Movementz Phase 44: AI workout builder usage tracking.
-- Run this before enabling the AI Workout Builder in production.

create table if not exists public.ai_workout_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_month text not null,
  prompt text,
  model text,
  generated_at timestamptz not null default now()
);

create index if not exists ai_workout_generations_user_period_idx
  on public.ai_workout_generations(user_id, period_month);

alter table public.ai_workout_generations enable row level security;

drop policy if exists "ai_generations_select_own" on public.ai_workout_generations;
create policy "ai_generations_select_own"
on public.ai_workout_generations
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "ai_generations_insert_own" on public.ai_workout_generations;
create policy "ai_generations_insert_own"
on public.ai_workout_generations
for insert
to authenticated
with check (user_id = auth.uid());

notify pgrst, 'reload schema';
