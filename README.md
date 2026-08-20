# Taste Match

Swipe left/right on museum artwork to build visual taste through repeated
exposure. A swipe deck fed by cached Open Access images from four museums
(Met, Smithsonian, Art Institute of Chicago, Cleveland Museum of Art), a
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
   project, run both migrations, get a Smithsonian API key, fill in `.env.local`.
3. `npm run seed` -- pulls a starting batch of paintings/sculpture/prints from
   all four museums into your Supabase `images` table.
4. `npm run dev` -- open http://localhost:3000.

## How it's laid out

```
src/app/                 swipe deck ("/"), liked wall ("/liked"), taste profile ("/taste")
src/app/api/deck         GET  -- a scored, weighted-random batch of unswiped images
src/app/api/swipes       POST -- log a like/pass, denormalizing tags/category/etc.
src/app/api/liked        GET  -- this session's liked images, newest first
src/app/api/profile      GET  -- this session's top favored/avoided tags
src/components/          SwipeDeck (drag gesture + card stack), Card, LikedWall, TasteProfile
src/lib/                 types.ts (schema), supabase.ts (server client), session.ts
src/lib/recommend.ts     V2's scoring/selection layer -- see below
scripts/seed.ts          fetches + normalizes + upserts from all four museum APIs
supabase/migrations/     the actual SQL schema
```

The browser never talks to Supabase directly -- only to these `/api` routes,
which hold the service-role key server-side. That's what makes the public
Smithsonian rate limit (1000 req/hour) workable: it's spent once by the seed
script, not once per visitor.

## Data sources

All four are CC0 / public domain, so nothing here costs money or needs
attribution. `scripts/seed.ts` has one fetcher per source; `--source=` picks
one, the default is all four.

| Source | Key needed | Notes |
| --- | --- | --- |
| Met Museum | no | Front door rate-limits by request volume, not a published number -- the seed script backs off and retries automatically (verified live: bursts of object-detail fetches draw a 403 that clears after a delay). |
| Smithsonian | yes, free (api.data.gov) | 1000 req/hour on a real key. Image URLs need `&max=` appended, not `?max=` -- their `content` field already has its own query string. |
| Art Institute of Chicago | no | No published rate limit hit during seeding. Search is Elasticsearch-backed; filter one field per query (a two-field `term` filter 400s). |
| Cleveland Museum of Art | no | Has direct `type=`/`cc0=`/`has_image=` query params, no query-DSL juggling needed. |

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

## Roadmap

- **V3**: CLIP-embedding similarity to replace tag-overlap for "adjacent"
  discovery, and for cases where two pieces look related but share no tags
  at all.
