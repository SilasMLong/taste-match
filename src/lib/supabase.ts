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
