import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { ImageRecord } from "@/lib/types";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

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

  const images = (data ?? [])
    .map((row) => row.images as unknown as ImageRecord)
    .filter(Boolean);
  return NextResponse.json({ images });
}
