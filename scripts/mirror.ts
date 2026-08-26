// Copies images we cannot hotlink from production into Supabase Storage.
//
// architekturmuseum.ub.tu-berlin.de (all 1,000 architecture images) runs Anubis
// bot protection that refuses datacenter networks. The same User-Agent gets a
// 2.3 MB JPEG from a residential connection and a challenge page from Vercel,
// so /api/image cannot help -- its fetch comes from the blocked network too.
//
// This must therefore be run from a machine Anubis allows, i.e. an ordinary
// home connection, not from a server. It downloads each image once, applies the
// same downscale the proxy would have, uploads it, and records the public URL
// in images.mirror_url. After that the browser loads it straight from Supabase's
// CDN: no proxy hop, no function invocation, no dependency on the museum host.
//
//   npm run mirror                     -- everything still unmirrored
//   npm run mirror -- --limit=20       -- a subset, for a smoke test
//   npm run mirror -- --host=<host>    -- override which host to mirror
//
// Resumable: the queue is "rows on the target host with mirror_url still null",
// so interrupting it and re-running picks up where it stopped.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadDotEnvLocal } from "./env";

loadDotEnvLocal();

const BUCKET = "mirror";
// Matches /api/image/[id] exactly, so mirrored images look identical to
// proxied ones and the swap is invisible.
const MAX_WIDTH = 1400;
const WEBP_QUALITY = 82;

const DEFAULT_HOST = "architekturmuseum.ub.tu-berlin.de";
const USER_AGENT = "TasteMatch/1.0 (+https://github.com/SilasMLong/taste-match)";
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 45_000;

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : "true";
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function ensureBucket() {
  const { data } = await supabase.storage.listBuckets();
  if (data?.some((b) => b.name === BUCKET)) {
    console.log(`bucket "${BUCKET}" already exists`);
    return;
  }
  // Public: these are CC0 museum images and the whole point is that a browser
  // can fetch them with no credentials. Writes still require the service-role
  // key, which never leaves the server.
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/webp"],
  });
  if (error) throw new Error(`could not create bucket: ${error.message}`);
  console.log(`created public bucket "${BUCKET}"`);
}

async function mirrorOne(row: { id: string; image_url: string }): Promise<string> {
  const res = await fetch(row.image_url, {
    headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const type = res.headers.get("content-type") ?? "";
  // The failure mode this whole script exists for: a 200 carrying HTML is the
  // Anubis challenge, which means this machine is blocked too and mirroring
  // from here would upload challenge pages as if they were art.
  if (!type.startsWith("image/")) {
    throw new Error(
      `upstream returned ${type || "unknown"}, not an image -- this network is blocked too`
    );
  }

  const original = Buffer.from(await res.arrayBuffer());
  const body = await sharp(original)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const path = `${row.id}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  const host = arg("host") ?? DEFAULT_HOST;
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;

  await ensureBucket();

  const { count: pending } = await supabase
    .from("images")
    .select("*", { count: "exact", head: true })
    .is("mirror_url", null)
    .like("image_url", `%${host}%`);
  console.log(`${pending ?? 0} images on ${host} still to mirror\n`);

  let done = 0;
  let failed = 0;
  let bytes = 0;
  const startedAt = Date.now();

  while (done + failed < limit) {
    const { data: rows, error } = await supabase
      .from("images")
      .select("id, image_url")
      .is("mirror_url", null)
      .like("image_url", `%${host}%`)
      .limit(200);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) break;

    for (let i = 0; i < rows.length && done + failed < limit; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (row) => {
          try {
            return { row, url: await mirrorOne(row), error: null as string | null };
          } catch (err) {
            return {
              row,
              url: null,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      for (const r of results) {
        if (!r.url) {
          failed++;
          if (failed <= 5) console.log(`\n  failed ${r.row.id}: ${r.error}`);
          continue;
        }
        const { error: updateError } = await supabase
          .from("images")
          .update({ mirror_url: r.url })
          .eq("id", r.row.id);
        if (updateError) {
          failed++;
          console.log(`\n  db update failed for ${r.row.id}: ${updateError.message}`);
          continue;
        }
        done++;
      }

      const elapsed = (Date.now() - startedAt) / 1000;
      process.stdout.write(
        `\rmirrored ${done}  failed ${failed}  ${(done / Math.max(elapsed, 1)).toFixed(1)}/s   `
      );
    }
  }

  // Report the storage footprint, since the free tier allows 1 GB.
  const { data: files } = await supabase.storage.from(BUCKET).list("", { limit: 2000 });
  bytes = (files ?? []).reduce(
    (sum, f) => sum + ((f.metadata?.size as number | undefined) ?? 0),
    0
  );
  console.log(
    `\n\ndone: ${done} mirrored, ${failed} failed, ` +
      `${((Date.now() - startedAt) / 60000).toFixed(1)} min`
  );
  console.log(
    `bucket holds ${files?.length ?? 0} files, ${(bytes / 1024 / 1024).toFixed(1)} MB of the 1 GB free tier`
  );
}

main().catch((err) => {
  console.error("\nmirror failed:", err);
  process.exit(1);
});
