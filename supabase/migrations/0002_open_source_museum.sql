-- Run this in the Supabase SQL editor after 0001_init.sql (Dashboard -> SQL
-- Editor -> New query -> paste -> run).
--
-- `images.source_museum` was a two-value CHECK constraint ('smithsonian',
-- 'met'), which meant every new museum source needed a migration just to
-- widen the list -- exactly the kind of churn `category` was deliberately
-- left as free text to avoid (see the comment on that column in
-- 0001_init.sql). Adding the Art Institute of Chicago and Cleveland Museum
-- of Art sources is the moment that tradeoff actually bites, so this drops
-- the constraint and lets source_museum follow the same free-text pattern.
-- The known values are still tracked as a TypeScript union in
-- src/lib/types.ts for autocomplete/type-safety in code, same as Category.

alter table images drop constraint images_source_museum_check;
