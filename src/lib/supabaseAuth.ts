import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// The server half of authentication. Server-only: it reaches the cookie store
// through `next/headers`, so importing this from a client component fails the
// build. The browser client lives in src/lib/supabaseBrowser.ts.
//
// Supabase clients used for authentication only.
//
// Deliberately separate from src/lib/supabase.ts, which holds the service-role
// client that reads and writes images and swipes. These two must not be
// confused: the service-role key bypasses row-level security entirely and is
// server-only, while the anon key below is published in the browser bundle by
// design.
//
// The anon key being public is safe here precisely because RLS is enabled with
// no policies on both tables (see 0001_init.sql), so it grants no data access
// at all. It can do exactly one thing: talk to the auth endpoints.

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
        "Both are required for sign-in; see .env.local.example."
    );
  }
  return { url, key };
}

/** Whether sign-in is configured at all. Lets the UI hide itself rather than throw. */
export function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** For Server Components, Route Handlers and Server Functions. */
export async function createServerSupabase() {
  const { url, key } = publicConfig();
  const store = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. That is fine here: proxy.ts
          // refreshes the session on every request, so the refreshed tokens are
          // written there instead and nothing is lost by this failing.
        }
      },
    },
  });
}
