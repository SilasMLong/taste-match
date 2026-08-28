import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabaseAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { clearAnonymousId, getAnonymousId } from "@/lib/viewer";

// Where Google and the magic-link emails come back to.
//
// Both flows land here with a `code` to exchange for a session. Once that
// succeeds this is also the one moment where both identities are known at the
// same time -- the anonymous cookie is still on the request, and the account id
// has just become available -- so it is where the swipe history is carried over.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Supabase reports failures here rather than by status code.
  const authError = searchParams.get("error_description") ?? searchParams.get("error");
  // Only ever a path, never an absolute URL: honouring an arbitrary `next`
  // would make this an open redirect that an attacker could point anywhere.
  const requested = searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  if (authError) {
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(authError)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(error?.message ?? "sign_in_failed")}`
    );
  }

  // Carry over anything swiped before signing in. Best-effort on purpose: a
  // failure here should not block a sign-in that has already succeeded, and the
  // history is still recoverable while the cookie exists.
  const anonId = await getAnonymousId();
  if (anonId) {
    const { data: moved, error: claimError } = await supabaseAdmin().rpc(
      "claim_anonymous_swipes",
      { p_anon_id: anonId, p_user_id: data.user.id }
    );
    if (claimError) {
      console.error("claim_anonymous_swipes failed:", claimError.message);
    } else {
      console.log(`claimed ${moved ?? 0} anonymous swipes for ${data.user.id}`);
      // Only dropped once the history is safely on the account. Clearing it
      // first would strand those rows under an id nothing can reach again.
      await clearAnonymousId();
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
