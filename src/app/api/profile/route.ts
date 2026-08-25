import { NextResponse } from "next/server";
import { fetchAllRows, supabaseAdmin } from "@/lib/supabase";
import { computeProfile, topEntries } from "@/lib/recommend";
import { getViewer } from "@/lib/viewer";
import type { SwipeRecord } from "@/lib/types";

const TOP_N = 8;

type ProfileSwipe = Pick<
  SwipeRecord,
  "liked" | "category" | "culture" | "medium" | "tags"
>;

export async function GET() {
  const { userId } = await getViewer();

  const supabase = supabaseAdmin();
  // Paged for the same reason /api/deck pages: PostgREST caps responses at
  // 1,000 rows and ignores a wider .range() silently, so a session past 1,000
  // swipes would otherwise have its taste computed from an arbitrary slice --
  // and this page is the one place the user actually sees that profile, so a
  // silent truncation here reads as "the site misunderstood me."
  const { rows: swipes, error } = await fetchAllRows<ProfileSwipe>(() =>
    supabase
      .from("swipes")
      .select("liked, category, culture, medium, tags")
      .eq("user_id", userId)
      .order("id")
  );
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const profile = computeProfile(swipes);

  return NextResponse.json({
    swipe_count: swipes.length,
    liked_count: swipes.filter((s) => s.liked).length,
    favored: topEntries(profile, TOP_N, 1),
    avoided: topEntries(profile, TOP_N, -1),
  });
}
