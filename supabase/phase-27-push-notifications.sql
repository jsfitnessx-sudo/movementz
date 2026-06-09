-- Movementz Phase 27: web push notification subscriptions.
-- Run after phase-25-notifications-mutual-messages.sql.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, last_seen_at desc);

create or replace function public.save_push_subscription(
  push_endpoint text,
  push_p256dh text,
  push_auth text,
  push_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(push_endpoint), '') is null
    or nullif(trim(push_p256dh), '') is null
    or nullif(trim(push_auth), '') is null then
    raise exception 'Push subscription is incomplete.';
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (
    auth.uid(),
    trim(push_endpoint),
    trim(push_p256dh),
    trim(push_auth),
    nullif(left(trim(coalesce(push_user_agent, '')), 500), ''),
    now()
  )
  on conflict (endpoint)
  do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    last_seen_at = now()
  returning push_subscriptions.id into saved_id;

  return saved_id;
end;
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
