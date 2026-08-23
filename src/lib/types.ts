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
  // V3 columns (0004_embeddings.sql). Server-side only -- see ClientImage.
  // pgvector hands these back as a text literal ("[0.1,-0.2,...]"), not an
  // array, which is why the type isn't number[].
  embedding?: string | null;
  embedded_at?: string | null;
  embedding_error?: string | null;
}

// What actually crosses the wire to the browser.
//
// `deck_candidates()` and `visual_candidates()` both return `setof images`, so
// every candidate row now carries its 512-dimension embedding. Serialized as
// JSON that is ~10.6 KB per image -- about 208 KB of pure waste on a 20-card
// deck response, for a value the client has no use for. Strip it at the API
// boundary rather than reshaping the SQL functions, so the recommender keeps
// working with whole `images` rows.
export type ClientImage = Omit<
  ImageRecord,
  "embedding" | "embedded_at" | "embedding_error"
>;

export function toClientImage(image: ImageRecord): ClientImage {
  const rest = { ...image };
  delete rest.embedding;
  delete rest.embedded_at;
  delete rest.embedding_error;
  return rest;
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
