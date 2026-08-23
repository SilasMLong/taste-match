-- Run this in the Supabase SQL editor after 0002 (Dashboard -> SQL Editor ->
-- New query -> paste -> run).
--
-- Fixes two defects in how /api/deck picked candidates, both of which came
-- from doing the selection client-side over PostgREST instead of in SQL:
--
-- 1. The route ran `select * from images limit 300` with no ORDER BY, so
--    Postgres returned the same 300 rows (physical scan order) on every
--    request. Two identical calls overlapped 300/300 -- meaning the whole
--    V2 recommender was scoring 0.8% of a 37,593-row corpus, skewed hard
--    toward whatever was seeded first (the Met's 304 rows supplied 140 of
--    every pool; Cleveland's 16,518 rows supplied 6). Ordering by random()
--    here makes the pool an actual sample of the corpus.
--
-- 2. Already-swiped images were excluded by serializing every swiped id
--    into a `not.in.(...)` filter, which travels in the PostgREST query
--    string. That URL blew past the request-line limit at roughly 650
--    swipes (600 ok, 700 -> 400 Bad Request), permanently bricking the deck
--    for exactly the users who engaged most -- and unrecoverably, since the
--    session id lives in localStorage. As a NOT EXISTS against
--    swipes_user_image_key, it costs nothing and has no ceiling.
--
-- VOLATILE (the default, stated explicitly) because random() is: marking
-- this STABLE would let the planner treat one call's rows as reusable
-- within a statement. PostgREST only accepts volatile functions over POST,
-- which is what supabase-js .rpc() already issues.
create or replace function deck_candidates(
  p_user_id text,
  p_categories text[] default null,
  p_limit int default 300
)
returns setof images
language sql
volatile
-- SECURITY INVOKER (the default, stated explicitly): this must NOT be a
-- definer-rights function. RLS is enabled with no policies on both tables
-- precisely so the anon key gets zero access (see 0001_init.sql); a definer
-- function owned by the table owner would punch a hole straight through
-- that. Invoker rights mean the service-role key our /api routes use still
-- works (it bypasses RLS), while anon would see nothing even if it could
-- reach the function -- and the grants below mean it can't.
security invoker
as $$
  -- Sort ids only, then join back for the full rows: ORDER BY random() over
  -- `select i.*` would drag every row's jsonb tags through the sort.
  with picked as (
    select i.id
    from images i
    where (p_categories is null or i.category = any (p_categories))
      and not exists (
        select 1
        from swipes s
        where s.user_id = p_user_id
          and s.image_id = i.id
      )
    order by random()
    limit greatest(coalesce(p_limit, 300), 0)
  )
  select i.*
  from images i
  join picked p on p.id = i.id;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- PostgREST exposes anything in `public` -- so without this, the anon key
-- could call it. Invoker rights + RLS would still return zero rows, but
-- there's no reason to leave it reachable at all.
revoke all on function deck_candidates(text, text[], int) from public;
revoke all on function deck_candidates(text, text[], int) from anon;
revoke all on function deck_candidates(text, text[], int) from authenticated;
grant execute on function deck_candidates(text, text[], int) to service_role;
