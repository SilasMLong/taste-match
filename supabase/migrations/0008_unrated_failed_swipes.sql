-- Run this in the Supabase SQL editor after 0007 (Dashboard -> SQL Editor ->
-- New query -> paste -> run).
--
-- Stops a swipe on an image that never rendered from teaching the recommender
-- anything.
--
-- You cannot dislike a piece you did not see. When an image failed to load the
-- card was still swipeable, and whichever way it went became a real signal in
-- the taste profile -- so a broken host or a dead URL quietly taught the
-- recommender a preference the person never expressed.
--
-- The row is still written, deliberately. `deck_candidates()` excludes anything
-- already swiped, so *not* recording it would send the same unloadable card
-- back around the deck to fail again. This separates the two jobs the swipes
-- table was doing at once: "do not show me this again" (every row) and "this is
-- what I like" (only rows where there was something to judge).

alter table swipes
  add column if not exists image_failed boolean not null default false;

-- Only the profile-building reads filter on this, and they already filter by
-- user_id, so the existing swipes_user_liked_idx covers them. No new index.

-- visual_candidates() anchors on the user's recent likes, so it has to ignore
-- the ones that were never actually seen -- otherwise a failed image's
-- embedding pulls the taste centroid toward art the person never looked at.
-- Otherwise unchanged from 0004.
create or replace function visual_candidates(
  p_user_id text,
  p_categories text[] default null,
  p_limit int default 150
)
returns setof images
language sql
stable
security invoker
as $$
  with liked as (
    select i.embedding as e
    from swipes s
    join images i on i.id = s.image_id
    where s.user_id = p_user_id
      and s.liked
      and not s.image_failed
      and i.embedding is not null
    order by s.swiped_at desc
    limit 60
  ),
  centroid as (
    select avg(e) as v from liked
  )
  select i.*
  from images i, centroid c
  where c.v is not null
    and i.embedding is not null
    and (p_categories is null or i.category = any (p_categories))
    and not exists (
      select 1
      from swipes s
      where s.user_id = p_user_id
        and s.image_id = i.id
    )
  order by i.embedding <=> c.v
  limit greatest(coalesce(p_limit, 150), 0);
$$;

revoke all on function visual_candidates(text, text[], int) from public;
revoke all on function visual_candidates(text, text[], int) from anon;
revoke all on function visual_candidates(text, text[], int) from authenticated;
grant execute on function visual_candidates(text, text[], int) to service_role;
