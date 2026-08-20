import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { computeProfile, topEntries } from "@/lib/recommend";
import type { SwipeRecord } from "@/lib/types";

const TOP_N = 8;

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: swipes, error } = await supabase
    .from("swipes")
    .select("liked, category, culture, medium, tags")
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profile = computeProfile(
    swipes as Pick<SwipeRecord, "liked" | "category" | "culture" | "medium" | "tags">[]
  );

  return NextResponse.json({
    swipe_count: swipes.length,
    liked_count: swipes.filter((s) => s.liked).length,
    favored: topEntries(profile, TOP_N, 1),
    avoided: topEntries(profile, TOP_N, -1),
  });
}
