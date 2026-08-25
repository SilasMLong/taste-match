import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

// Who the current request belongs to, decided by the server.
//
// This replaces the previous arrangement, where every /api route read a
// `user_id` out of the query string or request body and trusted it. While
// identities were unguessable random UUIDs that was obscurity rather than
// security; the moment accounts exist it is a straightforward IDOR, because
// anyone who learns an id can read or overwrite that person's taste. Identity
// must not be something the caller states.

const ANON_COOKIE = "tm_anon_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Anonymous ids carry a prefix so they can never collide with an account id.
//
// The cookie is httpOnly, but that only stops page JavaScript reading it -- any
// client can still send an arbitrary Cookie header. Namespacing means that even
// a forged cookie containing a real account's UUID resolves to `anon_<uuid>`,
// which addresses no account's rows. Signing the cookie would also close this,
// but it needs a secret in every environment; a prefix needs nothing and gives
// the same guarantee where it matters.
//
// Anon-to-anon impersonation would still require guessing a v4 UUID, which is
// 122 bits of entropy.
const ANON_PREFIX = "anon_";
const ANON_ID_RE = /^anon_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Viewer = {
  /** The value stored in `swipes.user_id`. */
  userId: string;
  isAnonymous: boolean;
};

/**
 * Resolves the viewer for the current request, minting an anonymous identity if
 * there isn't one yet.
 *
 * Only callable from a Route Handler or Server Function: it may need to set a
 * cookie, and Next does not allow that during Server Component rendering.
 */
export async function getViewer(): Promise<Viewer> {
  const store = await cookies();

  // Phase 3 inserts the Supabase session check here, ahead of the anonymous
  // fallback, so a signed-in request resolves to its account id instead.

  const existing = store.get(ANON_COOKIE)?.value;
  if (existing && ANON_ID_RE.test(existing)) {
    return { userId: existing, isAnonymous: true };
  }

  const created = `${ANON_PREFIX}${randomUUID()}`;
  store.set({
    name: ANON_COOKIE,
    value: created,
    httpOnly: true,
    sameSite: "lax",
    // Off in development so the cookie still works over plain-HTTP localhost.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return { userId: created, isAnonymous: true };
}
