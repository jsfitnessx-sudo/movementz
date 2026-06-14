-- Movementz Phase 45: MUVMENTZ Growth Studio.
-- Run this before using the admin Growth Studio content calendar and lead tracker.

create table if not exists public.growth_brand_voice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_name text not null default 'MUVMENTZ',
  offer_summary text,
  target_audiences text,
  tone_notes text,
  words_to_use text,
  words_to_avoid text,
  default_cta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.growth_content_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  audience text not null default 'PTs',
  tone text not null default 'Raw/human',
  platform text not null default 'Instagram',
  scheduled_date date,
  status text not null default 'Draft',
  hook text,
  caption text,
  reel_idea text,
  script text,
  hashtags text[] not null default '{}',
  cta text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_content_status_check check (status in ('Draft', 'Ready', 'Posted')),
  constraint growth_content_platform_check check (platform in ('Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube Shorts'))
);

create table if not exists public.growth_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  business_name text,
  lead_type text not null default 'PT',
  email text,
  social_url text,
  website_url text,
  notes text,
  status text not null default 'New',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_lead_status_check check (status in ('New', 'Contacted', 'Replied', 'Follow-up', 'Won', 'Lost')),
  constraint growth_lead_type_check check (lead_type in ('PT', 'Gym', 'Online coach', 'Small studio', 'Beta user'))
);

create index if not exists growth_content_user_date_idx
  on public.growth_content_posts(user_id, scheduled_date, created_at);

create index if not exists growth_leads_user_status_idx
  on public.growth_leads(user_id, status, updated_at);

alter table public.growth_brand_voice enable row level security;
alter table public.growth_content_posts enable row level security;
alter table public.growth_leads enable row level security;

drop policy if exists "growth_brand_select_own" on public.growth_brand_voice;
create policy "growth_brand_select_own"
on public.growth_brand_voice
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "growth_brand_insert_own" on public.growth_brand_voice;
create policy "growth_brand_insert_own"
on public.growth_brand_voice
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "growth_brand_update_own" on public.growth_brand_voice;
create policy "growth_brand_update_own"
on public.growth_brand_voice
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "growth_content_select_own" on public.growth_content_posts;
create policy "growth_content_select_own"
on public.growth_content_posts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "growth_content_insert_own" on public.growth_content_posts;
create policy "growth_content_insert_own"
on public.growth_content_posts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "growth_content_update_own" on public.growth_content_posts;
create policy "growth_content_update_own"
on public.growth_content_posts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "growth_leads_select_own" on public.growth_leads;
create policy "growth_leads_select_own"
on public.growth_leads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "growth_leads_insert_own" on public.growth_leads;
create policy "growth_leads_insert_own"
on public.growth_leads
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "growth_leads_update_own" on public.growth_leads;
create policy "growth_leads_update_own"
on public.growth_leads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

notify pgrst, 'reload schema';
