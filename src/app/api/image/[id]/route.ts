import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { isProxiedHost } from "@/lib/imageProxy";

// Serves museum images that the browser can't or shouldn't fetch directly.
// See src/lib/imageProxy.ts for which hosts route through here and why.

// Identifies us honestly rather than impersonating a browser. That's also
// what makes this work: architekturmuseum.ub.tu-berlin.de's Anubis bot
// protection returns a proof-of-work HTML challenge to browser User-Agents
// and the real JPEG to everything else -- verified against this exact string.
const USER_AGENT = "TasteMatch/1.0 (+https://github.com/SilasMLong/taste-match)";

// Wide enough to stay sharp on a retina card at the deck's rendered size,
// small enough that a 2-3 MB original stops being a 2-3 MB download.
const MAX_WIDTH = 1400;
const WEBP_QUALITY = 82;

const UPSTREAM_TIMEOUT_MS = 20_000;
// Some Europeana originals are 3.6 MB; this is headroom over that, not a
// target. Guards against buffering something pathological into memory.
const MAX_UPSTREAM_BYTES = 40 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid image id" }, { status: 400 });
  }

  const { data: image, error } = await supabaseAdmin()
    .from("images")
    .select("image_url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!image) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // The id -> URL indirection is what keeps this from being an open proxy:
  // callers can only reach URLs already in our own images table. Refusing
  // hosts that aren't on the proxy list keeps it narrower still, so this
  // can't be used to launder traffic to the museums we load directly.
  if (!isProxiedHost(image.image_url)) {
    return NextResponse.json(
      { error: "image is not served through the proxy" },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(image.image_url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `upstream returned ${upstream.status}` },
      { status: 502 }
    );
  }

  // A 200 carrying text/html is the signature of a bot-protection
  // interstitial, not an image -- Anubis serves its challenge page that way.
  // Without this check the failure would reach the browser as a corrupt
  // image rather than as something diagnosable.
  const upstreamType = upstream.headers.get("content-type") ?? "";
  if (!upstreamType.startsWith("image/")) {
    return NextResponse.json(
      { error: `upstream returned ${upstreamType || "unknown type"}, not an image` },
      { status: 502 }
    );
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPSTREAM_BYTES) {
    return NextResponse.json({ error: "upstream image too large" }, { status: 502 });
  }

  const original = Buffer.from(await upstream.arrayBuffer());
  if (original.byteLength > MAX_UPSTREAM_BYTES) {
    return NextResponse.json({ error: "upstream image too large" }, { status: 502 });
  }

  let body: Buffer;
  let contentType: string;
  try {
    body = await sharp(original)
      .rotate() // honour EXIF orientation, which is lost once we re-encode
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    contentType = "image/webp";
  } catch {
    // Anything sharp can't decode still gets served, just unoptimized -- a
    // heavy image beats a broken one.
    body = original;
    contentType = upstreamType;
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      // The museum image behind a given id never changes, so this is safe to
      // cache hard. It's also what keeps the proxy's bandwidth cost bounded.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(body.byteLength),
    },
  });
}
