-- Run this in the Supabase SQL editor after 0008 (Dashboard -> SQL Editor ->
-- New query -> paste -> run).
--
-- Moves an anonymous session's swipe history onto an account at first sign-in.
--
-- Signing in is optional here, and most people will have swiped for a while
-- before deciding to keep their taste. Without this, creating an account would
-- reset everything they had built -- exactly the moment the product should feel
-- most rewarding.
--
-- Collisions are possible: the same person could have judged an image
-- anonymously and again while signed in on another device. `swipes` has a
-- unique index on (user_id, image_id), so one verdict has to win. The
-- signed-in one does, on the grounds that it is the more deliberate act; the
-- anonymous row is discarded rather than overwriting it.
--
-- Runs as a single statement pair inside the function's implicit transaction,
-- so a failure part-way cannot leave history split across two identities.

create or replace function claim_anonymous_swipes(
  p_anon_id text,
  p_user_id text
)
returns integer
language plpgsql
volatile
security invoker
as $$
declare
  moved integer;
begin
  if p_anon_id is null or p_user_id is null or p_anon_id = p_user_id then
    return 0;
  end if;

  -- The important guard. Without it this function would happily move any
  -- user's history onto any other id, turning "claim my anonymous swipes" into
  -- "claim someone's account". Anonymous ids are the only legitimate source,
  -- and src/lib/viewer.ts guarantees they all carry this prefix.
  if p_anon_id not like 'anon\_%' then
    return 0;
  end if;

  update swipes s
     set user_id = p_user_id
   where s.user_id = p_anon_id
     and not exists (
       select 1
       from swipes existing
       where existing.user_id = p_user_id
         and existing.image_id = s.image_id
     );
  get diagnostics moved = row_count;

  -- Whatever remains collided with a verdict the account already held.
  delete from swipes where user_id = p_anon_id;

  return moved;
end;
$$;

revoke all on function claim_anonymous_swipes(text, text) from public;
revoke all on function claim_anonymous_swipes(text, text) from anon;
revoke all on function claim_anonymous_swipes(text, text) from authenticated;
grant execute on function claim_anonymous_swipes(text, text) to service_role;
