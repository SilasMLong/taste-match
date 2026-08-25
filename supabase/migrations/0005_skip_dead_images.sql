-- Run this in the Supabase SQL editor after 0004 (Dashboard -> SQL Editor ->
-- New query -> paste -> run).
--
-- Keeps images with known-dead URLs out of the deck.
--
-- 403 rows -- all Smithsonian -- have records the museum's API still returns
-- but image files their delivery service no longer has. Fetching one gives a
-- flat HTTP 404. They were being dealt into the deck like any other card, and
-- since there is nothing to look at, whichever way you swipe teaches the
-- recommender something false about your taste. Worse, a swipe is permanent:
-- the deck excludes anything already swiped, so the only way past a dead card
-- was to poison the profile with it.
--
-- The embed backfill already identified them. scripts/embed.ts distinguishes
-- transient failures (throttling, timeouts -- left pending for a later run)
-- from permanent ones, and only permanent ones set embedding_error. So that
-- column doubles as "this URL is known bad", which is what this filter reads.
--
-- Caveat worth knowing: embedding_error would also be set for a file sharp
-- cannot decode, which in principle a browser might still render. In practice
-- every row carrying an error right now is an HTTP 404, and the formats sharp
-- rejects are largely ones browsers reject too, so the overlap is close enough
-- that one condition covers both. If that stops being true, split the column.
--
-- visual_candidates() needs no change: it already requires `embedding is not
-- null`, and a row that failed permanently never got one.

create or replace function deck_candidates(
  p_user_id text,
  p_categories text[] default null,
  p_limit int default 300
)
returns setof images
language sql
volatile
security invoker
as $$
  with picked as (
    select i.id
    from images i
    where (p_categories is null or i.category = any (p_categories))
      -- Known-dead image URL: nothing to show, so never deal it.
      and i.embedding_error is null
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

revoke all on function deck_candidates(text, text[], int) from public;
revoke all on function deck_candidates(text, text[], int) from anon;
revoke all on function deck_candidates(text, text[], int) from authenticated;
grant execute on function deck_candidates(text, text[], int) to service_role;
