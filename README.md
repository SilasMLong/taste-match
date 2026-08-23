# Taste Match

Swipe left/right on museum artwork to build visual taste through repeated
exposure. A swipe deck fed by cached Open Access images from five sources
(Met, Smithsonian, Art Institute of Chicago, Cleveland Museum of Art,
Europeana), a
"liked wall" of everything the current (anonymous) session has liked, and (as
of V2) a deck that reorders itself around what you've actually liked, plus a
"Your taste so far" page that shows the profile it's building. Still no
accounts -- see "Roadmap" below for what's still ahead.

## Stack

Next.js 16 (App Router, TypeScript) + Tailwind v4 + Supabase (Postgres) +
framer-motion for the swipe gesture. No paid services; Supabase and both
museum APIs are free.

## Setup

1. `npm install`
2. Follow [`supabase/README.md`](supabase/README.md): create a free Supabase
   project, run the migrations in order, get a Smithsonian API key, fill in `.env.local`.
3. `npm run seed` -- pulls a starting batch of images from all five sources
   into your Supabase `images` table.
4. `npm run dev` -- open http://localhost:3000.

## How it's laid out

```
src/app/                 swipe deck ("/"), liked wall ("/liked"), taste profile ("/taste")
src/app/api/deck         GET  -- a scored batch of unswiped images (visual + random pools)
src/app/api/swipes       POST -- log a like/pass, denormalizing tags/category/etc.
src/app/api/liked        GET  -- this session's liked images, newest first
src/app/api/profile      GET  -- this session's top favored/avoided tags
src/app/api/image/[id]   GET  -- server-side image proxy; see image hosting gotchas
src/components/          SwipeDeck (drag gesture + card stack), Card, LikedWall, TasteProfile
src/lib/                 types.ts (schema), supabase.ts (server client), session.ts
src/lib/recommend.ts     V2's scoring/selection layer -- see below
src/lib/imageProxy.ts    which image hosts must route through the proxy, and why
scripts/seed.ts          fetches + normalizes + upserts from all five source APIs
scripts/embed.ts         V3's CLIP embedding backfill (resumable)
supabase/migrations/     the actual SQL schema
```

The browser never talks to Supabase directly -- only to these `/api` routes,
which hold the service-role key server-side. That's what makes the public
Smithsonian rate limit (1000 req/hour) workable: it's spent once by the seed
script, not once per visitor.

## Data sources

All five are CC0 / public domain (or the equivalent), so nothing here costs
money or needs attribution. `scripts/seed.ts` has one fetcher per source;
`--source=` picks one, the default is all five.

| Source | Key needed | Notes |
| --- | --- | --- |
| Met Museum | no | Front door rate-limits by request volume, not a published number -- the seed script backs off and retries automatically (verified live: bursts of object-detail fetches draw a 403 that clears after a delay). |
| Smithsonian | yes, free (api.data.gov) | 1000 req/hour on a real key. Image URLs need `&max=` appended, not `?max=` -- their `content` field already has its own query string. |
| Art Institute of Chicago | no | No published rate limit hit during seeding. Search is Elasticsearch-backed; filter one field per query (a two-field `term` filter 400s). |
| Cleveland Museum of Art | no | Has direct `type=`/`cc0=`/`has_image=` query params, no query-DSL juggling needed. |
| Europeana | yes, free | The only source for architecture and fashion so far. Hard-caps pagination at ~1000 results per query; use its documented cursor pagination to go past that. Supplies no `tags` and no `medium` at all -- see the scoring caveat below. |

## Image hosting gotchas (read before debugging a blank card)

Museum image hosts are not plain static file servers. Three of them apply
access controls that fail in ways that look like broken data:

- **Art Institute of Chicago 403s on a third-party `Referer`.** Browsers send
  one by default on `<img>` loads, which silently broke all 1,856 AIC images.
  Fixed by `referrerPolicy="no-referrer"` on the `<img>` tags in `Card.tsx`
  and `LikedWall.tsx` -- don't remove it.
- **AIC also sits behind Cloudflare.** Rapid automated requests earn a
  `403` with a `Just a moment...` interstitial. This is IP-scoped and
  temporary; it is not a data problem, and it clears on its own.
- **`architekturmuseum.ub.tu-berlin.de` runs Anubis proof-of-work bot
  protection**, and it hosts all 1,000 of the architecture images. It serves
  the real JPEG to non-browser clients but returns an HTML challenge page
  (`<title>Making sure you're not a bot!</title>`) to any request with a
  browser User-Agent -- including the exact headers an `<img>` tag sends
  (`Sec-Fetch-Dest: image`, `Accept: image/*`). An `<img>` cannot execute the
  challenge's JavaScript, so these images can never load directly in a
  browser. They are served through the image proxy route instead.

**Do not conclude an image host is fine because `curl` fetched it.** The
older advice here was to cross-check a "broken image" finding against curl
from the dev machine, on the theory that sandboxed browsers get blocked where
the real app works. That is backwards for UA-sniffing hosts: curl's default
User-Agent sails past Anubis while every real browser is blocked, so curl
returns a false negative and the sandboxed browser is the one telling the
truth. Test with an explicit browser User-Agent before trusting the result:

```bash
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" \
  "<image_url>"
```

A `content_type` of `text/html` on a URL that should be an image is the tell,
even when the status is `200`.

## Data model, and why it's shaped this way

Two tables: `images` (the cached museum catalog) and `swipes` (this session's
verdicts). Full column list is in `supabase/migrations/0001_init.sql`; the
short version:

- Every `images` row carries `category` (painting/sculpture/print/other, free
  text, not an enum) so V2's design/furniture/interiors expansion is a data
  change, not a migration.
- Every `swipes` row stores a **denormalized snapshot** of that image's
  `tags`/`category`/`culture`/`medium` at swipe time, not just a foreign key.
  V2's tag-weighted recommender reads swipe history directly; it shouldn't
  need to re-join against `images` (whose metadata could change under it).
- `user_id` on swipes is a client-generated anonymous id (`src/lib/session.ts`,
  stored in localStorage) rather than a real account. When accounts arrive,
  this is the column a migration maps onto a real `user_id`.

V2 is exactly the "new query over existing columns" the schema was shaped
for -- no migration was needed to build it.

## V2: how the scoring works

`src/lib/recommend.ts` is the whole thing; `/api/deck` and `/api/profile` are
thin callers around it. No new tables, no persisted weights, no ML -- it
recomputes from `swipes` on every request, which is cheap at this scale and
means there's never a stale cache to invalidate.

1. **Profile.** Every swipe's `category`/`culture`/`medium`/`tags` each get
   +1 (liked) or -1 (passed), all in one flat namespace -- so a session's
   profile looks like `{ Japan: 5, painting: 2, sculpture: -2 }`. Values
   longer than 40 characters are skipped; Smithsonian's `medium` field is
   occasionally a full descriptive sentence rather than a short tag, and a
   string that specific will essentially never match another image, so it's
   noise, not signal (found this by inspecting real seeded data, not
   guessing).
2. **Score.** Each unswiped candidate's score is the sum of the profile's
   weights for its own category/culture/medium/tags.
3. **Weighted random, not top-N.** Selection uses weighted sampling without
   replacement (Efraimidis-Spirakis: each candidate gets a random key raised
   to `1/weight`, highest keys win), with every candidate keeping a weight
   of at least 1 regardless of score. High scorers are much more likely to
   be drawn, but nothing is ever fully excluded -- V1's "exposure builds
   taste" premise breaks if the deck can wall itself off from a tag.
4. **Explore slice (~17.5% of each deck).** Drawn only from candidates that
   lack the single most dominant tag in the profile, so it leans toward
   "shares some of what you like, but not the headline thing" rather than
   pure random. True similarity-based adjacency (Japanese woodblock prints
   -> Chinese ink painting, by visual resemblance rather than shared tags)
   needs embeddings -- that's V3.

Verified against the live seeded dataset (not just synthetic data): a test
session that liked 5 "Japan"-culture pieces and passed on 3 sculptures got a
deck where Japan-culture cards appeared at roughly double their 9.3%
dataset-wide base rate, and sculpture appeared at roughly half its 34.1%
base rate -- enriched and suppressed in the right direction, neither at 0%
nor 100%.

## V3: visual similarity

Tag overlap can only relate two pieces that share metadata. It cannot see that
a Japanese woodblock print and a Chinese ink painting look alike, and it cannot
rank Europeana's 2,000 architecture and fashion rows **at all** -- that source
supplies no `tags` and no `medium`, so V2's profile has nothing to score them
on beyond `culture`. V3 gives every image a CLIP embedding instead, which
doesn't care how thin the metadata is.

**Embeddings pick the candidates; V2 still ranks them.** `/api/deck` unions two
pools and hands the combined set to the same `recommend.ts` scoring as before:

- **Visual pool** (`visual_candidates()`, 150) -- unswiped images nearest, by
  cosine distance, to the centroid of this session's most recent likes.
- **Random pool** (`deck_candidates()`, 300) -- the uniform sample over the
  whole corpus.

The random pool isn't a fallback, it's a counterweight. A pure
nearest-neighbour deck collapses: every like pulls the centroid tighter until
the deck is showing one narrow look within a few dozen swipes. Keeping real
random candidates in the mix is what preserves the "exposure builds taste"
premise, and it's what the explore slice draws from.

Cold start and partial backfill both degrade to plain V2: `visual_candidates()`
returns nothing when the session has no embedded likes yet, and a failure there
is logged rather than propagated, so the deck never goes down over it.

### Generating the embeddings

```bash
npm run embed                        # everything still pending
npm run embed -- --limit=200         # a subset, for a smoke test
npm run embed -- --source=cleveland  # one source at a time
npm run embed -- --retry-failed      # clear embedding_error and retry
```

`scripts/embed.ts` runs CLIP ViT-B/32 locally through transformers.js (ONNX,
CPU) -- no hosted inference API, same no-paid-services constraint as the rest
of this project. The first run downloads ~150 MB of model weights and then
works offline.

It is resumable by construction: the work queue is "rows where `embedding` is
null and `embedding_error` is null", so interrupting it and re-running picks up
exactly where it stopped. That matters, because a full pass downloads ~37,500
images from museums that rate-limit -- expect hours, not minutes, and expect to
run it more than once.

Two things worth knowing if you touch this script:

- It must not `import sharp` directly. transformers.js bundles its own libvips;
  loading a second copy in one process produces an objc duplicate-class warning
  that explicitly warns of "mysterious crashes". Decode via `RawImage.fromBlob`,
  which uses the bundled copy.
- Embeddings are L2-normalized before storage, because `visual_candidates()`
  builds its query vector with `avg()` -- on unnormalized vectors a few
  high-magnitude embeddings would dominate the centroid.

### Storage

512 dimensions x 4 bytes is ~2 KB a row, so ~77 MB across the corpus -- the
largest single thing in this database against a 500 MB free tier. Call
`table_sizes()` to check headroom. There is deliberately **no** ANN index: at
37,593 rows an exact sequential scan is a few tens of milliseconds and has
perfect recall, where HNSW would trade recall for a speedup this corpus doesn't
need and spend storage that's already tight. Revisit past ~1M rows.

## Roadmap

- **Products and Furniture** still have no source. Europeana's product pool was
  too thin and scattered, and its one dedicated furniture provider (Mobilier
  National) has dead image links. V&A, Cooper Hewitt, and Rijksmuseum's direct
  API are researched but unbuilt.
- **No accounts.** Everything is still keyed on an anonymous localStorage
  session id.
