-- Run this in the Supabase SQL editor after 0003 (Dashboard -> SQL Editor ->
-- New query -> paste -> run).
--
-- V3: visual similarity. V2 ranks candidates by tag overlap, which cannot see
-- that two pieces look alike when they share no metadata -- and cannot rank
-- Europeana's 2,000 architecture/fashion rows at all, since that source
-- supplies no tags and no medium whatsoever. CLIP embeddings give every image
-- a comparable vector regardless of how thin its metadata is.
--
-- The division of labour: embeddings choose WHICH candidates the deck
-- considers, V2's existing scoring still decides how they're ordered and
-- sampled. That keeps the explore slice, the weight floor, and the taste page
-- working exactly as they do now.

create extension if not exists vector;

-- 512 dimensions = CLIP ViT-B/32's image encoder, the model scripts/embed.ts
-- runs locally via transformers.js. At 4 bytes per dimension this is ~2 KB a
-- row, so ~77 MB across 37,593 images -- the single largest thing in this
-- database, and worth watching against the free tier's 500 MB (see
-- table_sizes() below).
alter table images add column if not exists embedding vector(512);
-- Set when an image is successfully embedded; null means "not done yet".
alter table images add column if not exists embedded_at timestamptz;
-- Set when embedding failed permanently (dead image URL, undecodable file).
-- Kept separate from `embedding is null` so a re-run resumes cleanly without
-- retrying known-bad rows forever. `npm run embed -- --retry-failed` clears it.
alter table images add column if not exists embedding_error text;

-- The embed script's work queue: "rows still needing an embedding". Partial,
-- so it stays tiny and shrinks to nothing as the backfill completes.
create index if not exists images_embedding_pending_idx
  on images (id)
  where embedding is null and embedding_error is null;

-- NOTE: deliberately no ANN index (HNSW/IVFFlat) on `embedding`.
-- At 37,593 rows an exact sequential scan over 512-dim vectors is a few tens
-- of milliseconds, and it is exactly correct -- an approximate index would
-- trade recall for a speedup this corpus doesn't need yet, while adding
-- index storage to an already tight 500 MB budget. Revisit past ~1M rows.

-- Unswiped images ranked by visual similarity to what this user has liked.
--
-- The query vector is the centroid (mean) of the user's most recent liked
-- embeddings. A centroid flattens genuinely multi-modal taste -- someone who
-- likes both Japanese woodblock prints and Brutalist concrete gets the
-- average of the two, which resembles neither -- so it is capped at the most
-- recent LIKED_ANCHORS likes rather than all history, keeping it responsive
-- to where the session has actually gone. The random pool the deck unions
-- this with is what stops a centroid from narrowing the deck to one look.
--
-- Returns zero rows when the user has no liked images with embeddings yet
-- (cold start, or mid-backfill). /api/deck treats that as "fall back to the
-- random pool", so this degrades to exactly V2 behaviour rather than failing.
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
  -- <=> is cosine distance: smaller is more similar.
  order by i.embedding <=> c.v
  limit greatest(coalesce(p_limit, 150), 0);
$$;

-- Free-tier budget monitoring. The embedding column is big enough relative to
-- a 500 MB cap that "how much room is left" stops being a rhetorical question,
-- and PostgREST gives no other way to ask it.
create or replace function table_sizes()
returns table (relation text, total_bytes bigint, pretty text)
language sql
stable
security invoker
as $$
  select c.relname::text,
         pg_total_relation_size(c.oid),
         pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by pg_total_relation_size(c.oid) desc;
$$;

revoke all on function visual_candidates(text, text[], int) from public;
revoke all on function visual_candidates(text, text[], int) from anon;
revoke all on function visual_candidates(text, text[], int) from authenticated;
grant execute on function visual_candidates(text, text[], int) to service_role;

revoke all on function table_sizes() from public;
revoke all on function table_sizes() from anon;
revoke all on function table_sizes() from authenticated;
grant execute on function table_sizes() to service_role;
