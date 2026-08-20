import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildDeck, computeProfile } from "@/lib/recommend";
import { categoriesForGroup } from "@/lib/categoryGroups";
import type { ImageRecord, SwipeRecord } from "@/lib/types";

const DEFAULT_LIMIT = 20;
// How many unswiped candidates to pull before scoring/sampling. Kept well
// above any single deck size so selection draws from real variety, not just
// whatever a plain `limit()` happened to return first.
const CANDIDATE_POOL_SIZE = 300;

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

  const { data: swipes, error: swipesError } = await supabase
    .from("swipes")
    .select("image_id, liked, category, culture, medium, tags")
    .eq("user_id", userId);
  if (swipesError) {
    return NextResponse.json({ error: swipesError.message }, { status: 500 });
  }

  const swipedIds = swipes.map((row) => row.image_id as string);
  const profile = computeProfile(
    swipes as Pick<SwipeRecord, "liked" | "category" | "culture" | "medium" | "tags">[]
  );

  let query = supabase.from("images").select("*").limit(CANDIDATE_POOL_SIZE);
  if (swipedIds.length > 0) {
    query = query.not("id", "in", `(${swipedIds.join(",")})`);
  }

  const categoryGroup = request.nextUrl.searchParams.get("category_group");
  const groupCategories = categoryGroup ? categoriesForGroup(categoryGroup) : null;
  if (groupCategories) {
    query = query.in("category", groupCategories);
  }

  const { data: candidates, error: candidatesError } = await query;
  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }

  const deck = buildDeck(candidates as ImageRecord[], profile, limit);
  return NextResponse.json({ images: deck });
}
