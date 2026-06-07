alter table public.session_log_exercises
  add column if not exists target_type text;

alter table public.session_log_exercises
  add column if not exists target_value numeric;

alter table public.session_log_exercises
  add column if not exists split_duration_seconds integer;

alter table public.session_log_exercises
  add column if not exists completed_at_seconds integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_log_exercises_target_type_check'
  ) then
    alter table public.session_log_exercises
      add constraint session_log_exercises_target_type_check
      check (target_type is null or target_type in ('reps', 'meters', 'calories'));
  end if;
end $$;

create index if not exists session_log_exercises_split_idx
  on public.session_log_exercises(session_id, position, split_duration_seconds);
