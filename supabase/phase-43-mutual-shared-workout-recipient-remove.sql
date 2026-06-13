-- Movementz Phase 43: allow recipients to remove mutual shared workouts.
-- This only revokes the share row. It does not delete the original workout template.
-- Run after phase-41-coach-unlink-and-mutual-workout-shares.sql.

drop policy if exists "Users revoke their mutual workout shares" on public.mutual_workout_shares;
create policy "Users revoke their mutual workout shares"
on public.mutual_workout_shares for update
to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id)
with check (auth.uid() = sender_id or auth.uid() = recipient_id);

create or replace function public.revoke_mutual_workout_share(p_share_id uuid)
returns table(share_id uuid, share_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  update public.mutual_workout_shares mws
  set status = 'revoked',
      revoked_at = now()
  where mws.id = p_share_id
    and (mws.sender_id = auth.uid() or mws.recipient_id = auth.uid())
    and mws.status = 'active';

  if not found then
    raise exception 'Active mutual workout share not found.';
  end if;

  return query select p_share_id, 'revoked'::text;
end;
$$;

grant execute on function public.revoke_mutual_workout_share(uuid) to authenticated;

notify pgrst, 'reload schema';
