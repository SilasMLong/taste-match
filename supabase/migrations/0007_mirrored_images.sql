-- Run this in the Supabase SQL editor after 0005 (Dashboard -> SQL Editor ->
-- New query -> paste -> run).
--
-- Somewhere to record images we host ourselves instead of hotlinking.
--
-- architekturmuseum.ub.tu-berlin.de runs Anubis bot protection, and it refuses
-- datacenter networks outright. Verified by sending one identical User-Agent
-- from two places: a residential connection got a 2.3 MB JPEG, Vercel got the
-- challenge page. So no User-Agent change helps, and /api/image cannot rescue
-- these either -- the proxy fetch originates from the same blocked network as
-- everything else on the server. All 1,000 architecture images were broken in
-- production while working locally, purely because of where the request came
-- from.
--
-- The fix is to stop depending on that host at request time: download each
-- image once from a network Anubis allows, keep the same downscaled WebP the
-- proxy already produces, and serve it from Supabase Storage.
--
-- `mirror_url` holds the full public URL rather than a bucket path so the
-- browser needs no Supabase configuration to build it, and null means "not
-- mirrored, use image_url as before". `image_url` is deliberately left alone:
-- it stays the museum's own URL, which is the provenance record and the thing
-- to re-fetch from if a mirror ever needs rebuilding.

alter table images add column if not exists mirror_url text;

-- The mirror script's work queue: rows that should be mirrored but aren't yet.
-- Partial, so it stays small and empties as the mirror completes.
create index if not exists images_mirror_pending_idx
  on images (id)
  where mirror_url is null;
