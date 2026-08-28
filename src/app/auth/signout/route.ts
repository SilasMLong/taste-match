import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabaseAuth";

// POST rather than GET: a link that signs you out can be triggered by anything
// that prefetches or renders it, including another site embedding an image.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  // A fresh anonymous identity is minted on the next request that needs one,
  // so swiping keeps working immediately -- signing out returns you to being a
  // visitor, not to a broken page.
  return NextResponse.redirect(`${request.nextUrl.origin}/`, { status: 303 });
}
