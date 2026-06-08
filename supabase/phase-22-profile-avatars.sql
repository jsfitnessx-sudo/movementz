-- Movementz Phase 22: small public profile avatars
-- Run after phase-1-auth-profiles.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  262144,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 262144,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "Profile avatars are publicly readable" on storage.objects;
create policy "Profile avatars are publicly readable"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile-avatars');

drop policy if exists "Profile owners can upload avatars" on storage.objects;
create policy "Profile owners can upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

drop policy if exists "Profile owners can update avatars" on storage.objects;
create policy "Profile owners can update avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  )
  with check (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

drop policy if exists "Profile owners can delete avatars" on storage.objects;
create policy "Profile owners can delete avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );
