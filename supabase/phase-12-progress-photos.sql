-- Movementz Phase 12: private progress photos
-- Run after phase-7-coach-client-links.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pose text not null check (pose in ('front', 'side', 'back')),
  note text,
  image_path text not null,
  thumbnail_path text not null,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists progress_photos_user_taken_idx
  on public.progress_photos(user_id, taken_at desc);

create index if not exists progress_photos_user_pose_idx
  on public.progress_photos(user_id, pose, taken_at desc);

alter table public.progress_photos enable row level security;

drop policy if exists "Progress photos are visible to owner and linked coach" on public.progress_photos;
create policy "Progress photos are visible to owner and linked coach"
  on public.progress_photos
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.coach_clients cc
      where cc.coach_id = auth.uid()
        and cc.client_id = progress_photos.user_id
        and cc.status = 'active'
    )
  );

drop policy if exists "Users can insert their own progress photos" on public.progress_photos;
create policy "Users can insert their own progress photos"
  on public.progress_photos
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own progress photos" on public.progress_photos;
create policy "Users can delete their own progress photos"
  on public.progress_photos
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Progress photo owner can upload objects" on storage.objects;
create policy "Progress photo owner can upload objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

drop policy if exists "Progress photos visible to owner and linked coach" on storage.objects;
create policy "Progress photos visible to owner and linked coach"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      split_part(name, '/', 1)::uuid = auth.uid()
      or exists (
        select 1
        from public.coach_clients cc
        where cc.coach_id = auth.uid()
          and cc.client_id = split_part(storage.objects.name, '/', 1)::uuid
          and cc.status = 'active'
      )
    )
  );

drop policy if exists "Progress photo owner can delete objects" on storage.objects;
create policy "Progress photo owner can delete objects"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );
