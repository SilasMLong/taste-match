import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withoutHiddenSources } from "@/lib/hiddenSources";
import { getViewer } from "@/lib/viewer";
import { toClientImage } from "@/lib/types";
import type { ImageRecord } from "@/lib/types";

export async function GET() {
  const { userId } = await getViewer();

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("swipes")
    .select("swiped_at, images(*)")
    .eq("user_id", userId)
    .eq("liked", true)
    .order("swiped_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const images = withoutHiddenSources(
    (data ?? [])
      .map((row) => row.images as unknown as ImageRecord)
      .filter(Boolean)
  )
    // Same reason as /api/deck: the join pulls whole `images` rows, embedding
    // column included, and that's ~10.6 KB of useless JSON per card.
    .map(toClientImage);
  return NextResponse.json({ images });
}
