import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { ImageRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { user_id, image_id, liked } = body ?? {};

  if (typeof user_id !== "string" || !user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }
  if (typeof image_id !== "string" || !image_id) {
    return NextResponse.json({ error: "image_id is required" }, { status: 400 });
  }
  if (typeof liked !== "boolean") {
    return NextResponse.json({ error: "liked must be a boolean" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: image, error: imageError } = await supabase
    .from("images")
    .select("category, culture, medium, tags")
    .eq("id", image_id)
    .single<Pick<ImageRecord, "category" | "culture" | "medium" | "tags">>();
  if (imageError || !image) {
    return NextResponse.json({ error: "image not found" }, { status: 404 });
  }

  // Denormalized snapshot at swipe time -- see the migration comment on
  // swipes.tags/category/culture/medium for why this isn't a join.
  const { data: swipe, error: swipeError } = await supabase
    .from("swipes")
    .upsert(
      {
        user_id,
        image_id,
        liked,
        category: image.category,
        culture: image.culture,
        medium: image.medium,
        tags: image.tags,
      },
      { onConflict: "user_id,image_id" }
    )
    .select()
    .single();
  if (swipeError) {
    return NextResponse.json({ error: swipeError.message }, { status: 500 });
  }

  return NextResponse.json({ swipe });
}
