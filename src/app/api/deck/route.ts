import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows, supabaseAdmin } from "@/lib/supabase";
import { buildDeck, computeProfile } from "@/lib/recommend";
import { categoriesForGroup } from "@/lib/categoryGroups";
import { toClientImage } from "@/lib/types";
import type { ImageRecord, SwipeRecord } from "@/lib/types";

const DEFAULT_LIMIT = 20;
// How many unswiped candidates deck_candidates() samples before this route
// scores and sub-samples them. Kept well above any single deck size so
// selection draws from real variety -- which it now actually does: the SQL
// side takes a random sample of the whole corpus, where this route used to
// take `limit(300)` with no ORDER BY and get the same 300 rows every time.
// See supabase/migrations/0003_deck_candidates.sql.
const CANDIDATE_POOL_SIZE = 300;

// V3 splits candidate generation in two and unions the results.
//
// The visual slice is nearest-neighbour by CLIP embedding against the centroid
// of what this session liked -- it finds pieces that *look* related even when
// they share no metadata, which is the whole reason V3 exists. It's also the
// only signal that works at all on Europeana's 2,000 architecture and fashion
// rows, which carry no tags and no medium.
//
// The random slice stays because a pure nearest-neighbour deck collapses: every
// like pulls the centroid tighter, and within a few dozen swipes the deck is
// showing one narrow look. Keeping a real random pool in the mix is what
// preserves V1's "exposure builds taste" premise, and it's what the explore
// slice in recommend.ts draws from.
//
// Both slices then go through V2's tag scoring untouched -- embeddings choose
// WHICH candidates are considered, V2 still decides how they're ranked.
const VISUAL_POOL_SIZE = 150;

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
  const [randomPool, visualPool] = await Promise.all([
    supabase.rpc("deck_candidates", {
      p_user_id: userId,
      p_categories: groupCategories,
      p_limit: CANDIDATE_POOL_SIZE,
    }),
    supabase.rpc("visual_candidates", {
      p_user_id: userId,
      p_categories: groupCategories,
      p_limit: VISUAL_POOL_SIZE,
    }),
  ]);

  if (randomPool.error) {
    return NextResponse.json({ error: randomPool.error.message }, { status: 500 });
  }
  // The visual slice is an enhancement, not a dependency: it returns nothing
  // for a session with no likes yet, and nothing at all until embeddings have
  // been backfilled. A failure here shouldn't take the deck down with it, so it
  // degrades to the V2 behaviour rather than 500ing.
  if (visualPool.error) {
    console.warn("visual_candidates unavailable, falling back to random pool:", visualPool.error.message);
  }

  const byId = new Map<string, ImageRecord>();
  for (const img of (visualPool.data ?? []) as ImageRecord[]) byId.set(img.id, img);
  for (const img of (randomPool.data ?? []) as ImageRecord[]) byId.set(img.id, img);

  const deck = buildDeck([...byId.values()], profile, limit);
  return NextResponse.json({ images: deck.map(toClientImage) });
}
