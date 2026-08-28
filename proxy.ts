import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request.
//
// Access tokens are short-lived. Without something refreshing them ahead of
// rendering, a signed-in person is silently signed out once their token
// expires. This is the one place that can both read the incoming cookies and
// write the rotated ones back.
//
// Note the filename: Next.js 16 renamed `middleware.ts` to `proxy.ts`. The
// functionality is identical, but the old name is deprecated and the exported
// function is `proxy`, not `middleware`.
//
// Deliberately minimal. Next's own documentation warns that proxy runs before
// all rendering and is not the place for authorization decisions -- those
// belong in the route handlers, where getViewer() resolves identity.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sign-in is optional, and the site works fully without it. If the keys are
  // absent there is no session to refresh, so pass the request straight through
  // rather than throwing on every page load.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Written to the request as well as the response so that anything
        // rendering downstream of this sees the refreshed session immediately,
        // rather than the stale one it arrived with.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() rather than getSession(): it verifies the token with Supabase
  // instead of trusting whatever the cookie claims. On the server that
  // distinction is the whole point.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and image files -- refreshing a session to serve a
  // favicon is wasted work on every request.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
