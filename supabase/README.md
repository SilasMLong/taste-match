# Supabase setup

Taste Match stores cached museum metadata and swipe history in Postgres via
Supabase's free tier. The browser never talks to Supabase directly -- only
our own `/api` routes do, using a service-role key that never ships to the
client. This is required setup (not optional, unlike an offline-first app):
there's no local fallback data store in V1.

## 1. Create a Supabase project

Go to https://supabase.com, create a project (free tier is plenty). Note the
project's **Project URL** and **service_role key** (NOT the anon/public key)
from Settings -> API.

## 2. Run the schema

Open the project's SQL Editor (left sidebar) -> New query, paste the full
contents of `supabase/migrations/0001_init.sql`, and run it. This creates the
`images` and `swipes` tables described in the top-level README's data model
section. Then do the same with `supabase/migrations/0002_open_source_museum.sql`
(one line -- drops a constraint that would otherwise reject the two newer
sources below), and then `supabase/migrations/0003_deck_candidates.sql`
(creates the `deck_candidates()` function `/api/deck` calls -- the deck
returns an empty stack without it), and finally
`supabase/migrations/0004_embeddings.sql` (adds the pgvector column and the
`visual_candidates()` function V3 uses; the deck still works without it, just
without visual similarity), and `supabase/migrations/0005_skip_dead_images.sql`
(stops images with known-dead URLs being dealt into the deck).

## 3. Get a Smithsonian Open Access API key

Go to https://api.data.gov/signup, request a free key. It arrives by email
almost immediately. The Met, Art Institute of Chicago, and Cleveland Museum
of Art APIs need no key.

## 4. Fill in `.env.local`

Copy `.env.local.example` to `.env.local` in the project root and fill in
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SMITHSONIAN_API_KEY`.

## 5. Seed the cache

```bash
npm install
npm run seed
```

This fetches a batch of fine-art records (paintings, sculpture, prints) from
all four museums (Met, Smithsonian, Art Institute of Chicago, Cleveland
Museum of Art) and upserts them into the `images` table. It talks to the
museum APIs directly, once, from your machine -- not from every visitor's
browser -- which is why the rate limits (1000 req/hour for Smithsonian) are
manageable for a public site. Re-run it any time to pull in more images; it
upserts on `(source_museum, external_id)` so it won't create duplicates. Use
`--source=met|smithsonian|artic|cleveland` to seed one museum at a time and
`--count=N` to change the per-category target (default 120).

## 6. Run the app

```bash
npm run dev
```
