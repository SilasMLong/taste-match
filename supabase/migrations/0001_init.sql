-- Tastemaker V1 schema. Run this in the Supabase project's SQL editor (Dashboard ->
-- SQL Editor -> New query) after creating the project. See supabase/README.md for
-- the full one-time setup.
--
-- This is a public, account-less site: there is no Supabase Auth user at all.
-- "user_id" on swipes is a client-generated anonymous session id (see
-- src/lib/session.ts), not a foreign key into auth.users. Because there is no
-- login, we cannot rely on auth.uid()-scoped row-level-security the way a
-- single-user app would. Instead RLS is enabled with NO policies on either
-- table, which denies all access to the anon/public key by default -- the
-- browser never talks to Supabase directly, only to our own /api routes,
-- which use the service-role key (bypasses RLS) and never ship to the client.
--
-- Schema shape is deliberately wider than V1 needs, per the product spec: V2's
-- tag-weighted recommendations and V3's embedding similarity both read
-- `swipes.tags/category/culture/medium` and `images.tags/category`, so those
-- columns exist and are populated now even though nothing scores them yet.

create extension if not exists "pgcrypto";

create table images (
  id uuid primary key default gen_random_uuid(),
  -- The museum's own object/record id, so re-running the seed script can
  -- upsert instead of creating duplicates.
  external_id text not null,
  title text not null,
  artist text,
  date_period text,
  culture text,
  medium text,
  -- "painting" | "sculpture" | "print" | "other" in V1 (fine art only).
  -- Free text, not an enum, so V2's design/furniture/interiors expansion
  -- doesn't require a migration.
  category text not null,
  source_museum text not null check (source_museum in ('smithsonian', 'met')),
  image_url text not null,
  -- Whatever else the museum API returned that didn't map to a named column
  -- (subjects, styles, materials, etc.) -- this is the field V2's tag-weighted
  -- scoring reads.
  tags jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create unique index images_source_external_key on images(source_museum, external_id);
create index images_category_idx on images(category);

create table swipes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  image_id uuid not null references images(id),
  liked boolean not null,
  -- Maps to the product spec's "timestamp" field; named swiped_at in SQL to
  -- avoid colliding with the `timestamp` type name.
  swiped_at timestamptz not null default now(),
  -- Denormalized copy of the image's tags/category/culture/medium AT SWIPE
  -- TIME. Deliberate duplication: V2's recommendation algorithm reads a
  -- user's swipe history directly and must not need to re-join against
  -- `images` (whose metadata could in principle change under it later).
  tags jsonb not null default '[]',
  category text not null,
  culture text,
  medium text
);
-- One verdict per user per image: swiping the same card again (e.g. a retry
-- after a network error) updates the existing row instead of duplicating it.
create unique index swipes_user_image_key on swipes(user_id, image_id);
create index swipes_user_liked_idx on swipes(user_id, liked, swiped_at desc);

alter table images enable row level security;
alter table swipes enable row level security;
