import { createBrowserClient } from "@supabase/ssr";

// The browser half of authentication, kept in its own module on purpose.
//
// Its server counterpart (src/lib/supabaseAuth.ts) imports `next/headers` to
// reach the cookie store. Exporting both from one file meant any client
// component importing the browser client dragged `next/headers` along with it,
// which fails the build outright -- that API exists only on the server.
//
// The anon key is published in the browser bundle by design. That is safe here
// because row-level security is enabled with no policies on both tables, so the
// key grants no data access at all; it can only reach the auth endpoints.

export function createClientSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set."
    );
  }
  return createBrowserClient(url, key);
}
