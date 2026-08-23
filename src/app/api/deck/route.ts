import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows, supabaseAdmin } from "@/lib/supabase";
import { buildDeck, computeProfile } from "@/lib/recommend";
import { categoriesForGroup } from "@/lib/categoryGroups";
import type { ImageRecord, SwipeRecord } from "@/lib/types";

const DEFAULT_LIMIT = 20;
// How many unswiped candidates deck_candidates() samples before this route
// scores and sub-samples them. Kept well above any single deck size so
// selection draws from real variety -- which it now actually does: the SQL
// side takes a random sample of the whole corpus, where this route used to
// take `limit(300)` with no ORDER BY and get the same 300 rows every time.
// See supabase/migrations/0003_deck_candidates.sql.
const CANDIDATE_POOL_SIZE = 300;

type ProfileSwipe = Pick<
  SwipeRecord,
  "liked" | "category" | "culture" | "medium" | "tags"
>;

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT,
    50
  );

  const supabase = supabaseAdmin();

  // Paged, because a heavy session legitimately exceeds PostgREST's 1,000-row
  // response cap and an unpaged read would truncate the profile silently.
  const { rows: swipes, error: swipesError } = await fetchAllRows<ProfileSwipe>(
    () =>
      supabase
        .from("swipes")
        .select("liked, category, culture, medium, tags")
        .eq("user_id", userId)
        .order("id")
  );
  if (swipesError) {
    return NextResponse.json({ error: swipesError }, { status: 500 });
  }

  const profile = computeProfile(swipes);

  const categoryGroup = request.nextUrl.searchParams.get("category_group");
  const groupCategories = categoryGroup ? categoriesForGroup(categoryGroup) : null;

  // Candidate selection (random sampling + excluding what this user already
  // swiped) happens in SQL. The exclusion in particular has to: serializing
  // swiped ids into a PostgREST `not.in.(...)` filter put them in the query
  // string, which 400s past roughly 650 swipes.
  const { data: candidates, error: candidatesError } = await supabase.rpc(
    "deck_candidates",
    {
      p_user_id: userId,
      p_categories: groupCategories,
      p_limit: CANDIDATE_POOL_SIZE,
    }
  );
  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }

  const deck = buildDeck((candidates ?? []) as ImageRecord[], profile, limit);
  return NextResponse.json({ images: deck });
}
