// Mirrors supabase/migrations/*.sql exactly. Field names are snake_case
// throughout (including over the /api JSON boundary) so there's one shape
// from Postgres row to browser, no separate camelCase DTO layer.

// Free text in the DB (see 0002_open_source_museum.sql) so adding another
// source is a seed-script change, not a migration -- this union is just for
// autocomplete/type-safety in code, same relationship Category has to its column.
export type SourceMuseum = "smithsonian" | "met" | "artic" | "cleveland" | "europeana";

// Free text in the DB (not a Postgres enum), so adding a new category is a
// seed-script change, not a migration -- see src/lib/categoryGroups.ts for
// how these map onto the five top-level browsing groups. Only
// painting/sculpture/print/other are seeded as of this writing; the rest
// are placeholders for sources not wired up yet.
export type Category =
  | "painting"
  | "sculpture"
  | "print"
  | "other"
  | "architecture"
  | "furniture"
  | "product"
  | "fashion";

export interface ImageRecord {
  id: string;
  external_id: string;
  title: string;
  artist: string | null;
  date_period: string | null;
  culture: string | null;
  medium: string | null;
  category: Category | string;
  source_museum: SourceMuseum;
  image_url: string;
  tags: string[];
  created_at: string;
}

export interface SwipeRecord {
  id: string;
  user_id: string;
  image_id: string;
  liked: boolean;
  swiped_at: string;
  // Denormalized snapshot of the image's tags/category/culture/medium at
  // swipe time -- see the migration comment for why this is duplicated
  // rather than joined.
  tags: string[];
  category: string;
  culture: string | null;
  medium: string | null;
}

export type NewImageRecord = Omit<ImageRecord, "id" | "created_at">;
