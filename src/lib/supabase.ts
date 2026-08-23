import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only. Uses the service-role key, which bypasses RLS -- this must
// never be imported from a "use client" component or exposed to the browser.
// The browser only ever calls our own /api routes (see src/app/api/*).
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Copy .env.local.example " +
        "to .env.local and fill them in -- see supabase/README.md."
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// PostgREST caps every response at 1,000 rows server-side, and .range() past
// that cap is silently ignored rather than erroring -- verified live against
// the 37,593-row images table: a plain .select(), .range(0, 4999) and
// .range(0, 19999) all return exactly 1,000 rows. Anything that can
// legitimately exceed 1,000 rows therefore has to page.
//
// This became load-bearing with 0003_deck_candidates.sql. Before it, the deck
// broke outright at ~650 swipes, so no session could reach 1,000; now that
// they can, an unpaged swipe-history read would compute a taste profile from
// an arbitrary 1,000-swipe slice and report no error at all.
const PAGE_SIZE = 1000;

// The builder is re-created per page rather than reused: supabase-js query
// builders are thenable and single-use, so a builder that has been awaited
// can't be re-ranged for the next page.
type RangeableQuery<T> = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

export async function fetchAllRows<T>(
  buildQuery: () => RangeableQuery<T>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { rows: [], error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...data);
    // A short page means the last page. Callers must apply a total order (an
    // .order() on a unique column) -- LIMIT/OFFSET over an unordered query
    // has no stability guarantee, so pages could otherwise repeat or skip rows.
    if (data.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}
