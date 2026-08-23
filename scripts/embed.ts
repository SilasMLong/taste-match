// V3 backfill: computes a CLIP image embedding for every row in `images`.
//
// Runs the model locally via transformers.js (ONNX, CPU) rather than calling a
// hosted inference API -- same constraint as everything else here, no paid
// services. First run downloads ~150 MB of model weights to the transformers.js
// cache; after that it's offline.
//
// Resumable by construction: the work queue is "rows where embedding is null
// and embedding_error is null" (see the partial index in
// supabase/migrations/0004_embeddings.sql), so interrupting this and re-running
// picks up exactly where it stopped. That matters -- a full pass downloads
// ~37,500 images from museums that rate-limit.
//
//   npm run embed                        -- everything still pending
//   npm run embed -- --limit=200         -- just the first 200 (for a smoke test)
//   npm run embed -- --source=cleveland  -- one source at a time
//   npm run embed -- --retry-failed      -- clear embedding_error and try again
//
// NOTE: this file must not import `sharp` directly. transformers.js bundles its
// own copy of libvips; loading a second one in the same process triggers an
// objc duplicate-class warning that explicitly threatens "mysterious crashes".
// RawImage.fromBlob() uses the bundled copy, so decoding goes through that.

import { createClient } from "@supabase/supabase-js";
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/clip-vit-base-patch32";
// Identifies us honestly, and is what gets past the Anubis proof-of-work
// protection on the architecture host -- that returns a challenge page to
// browser User-Agents and the real image to everything else.
const USER_AGENT = "TasteMatch/1.0 (+https://github.com/SilasMLong/taste-match)";

// Downloads run concurrently; inference is serialized behind them. Kept low
// deliberately: the Met throttles on cumulative request volume rather than
// rate, so hammering it just moves the 403 earlier.
const DOWNLOAD_CONCURRENCY = 6;
const PAGE_SIZE = 500;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

type PendingRow = { id: string; image_url: string; source_museum: string };

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(row: PendingRow): Promise<Blob> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(row.image_url, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      // 403/429 from the Met and AIC are throttling, not permanent failure --
      // back off and retry rather than burning the row with an error.
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        await sleep(2000 * attempt * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      // A 200 carrying HTML is a bot-protection interstitial, not an image.
      if (!type.startsWith("image/")) {
        throw new Error(`content-type ${type || "unknown"}, not an image`);
      }
      return await res.blob();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(lastError || "download failed");
}

// L2-normalizes before storage. Two reasons: cosine distance is then a plain
// dot product, and -- more importantly -- visual_candidates() builds its query
// vector with avg(), which on unnormalized vectors would let a few
// high-magnitude embeddings dominate the centroid.
function normalize(vec: number[]): number[] {
  const norm = Math.hypot(...vec);
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

async function main() {
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const source = arg("source");

  if (arg("retry-failed")) {
    const { error } = await supabase
      .from("images")
      .update({ embedding_error: null })
      .not("embedding_error", "is", null);
    console.log(error ? `retry-failed: ${error.message}` : "cleared embedding_error on failed rows");
  }

  const { count: pending } = await supabase
    .from("images")
    .select("*", { count: "exact", head: true })
    .is("embedding", null)
    .is("embedding_error", null);
  console.log(`${pending ?? 0} images pending${source ? ` (filtering to ${source})` : ""}`);

  console.log(`loading ${MODEL_ID}...`);
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    dtype: "fp32",
  });
  console.log("model ready\n");

  let done = 0;
  let failed = 0;
  const startedAt = Date.now();

  while (done + failed < limit) {
    let query = supabase
      .from("images")
      .select("id, image_url, source_museum")
      .is("embedding", null)
      .is("embedding_error", null)
      .limit(PAGE_SIZE);
    if (source) query = query.eq("source_museum", source);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) break;

    for (let i = 0; i < rows.length && done + failed < limit; i += DOWNLOAD_CONCURRENCY) {
      const chunk = rows.slice(i, i + DOWNLOAD_CONCURRENCY) as PendingRow[];

      const fetched = await Promise.all(
        chunk.map(async (row) => {
          try {
            return { row, blob: await download(row), error: null as string | null };
          } catch (err) {
            return {
              row,
              blob: null,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      // Inference is serialized: one model instance, and concurrent calls into
      // it contend for the same ONNX session rather than going faster.
      const updates: { id: string; embedding: string }[] = [];
      for (const item of fetched) {
        if (!item.blob) {
          failed++;
          await supabase
            .from("images")
            .update({ embedding_error: item.error?.slice(0, 300) })
            .eq("id", item.row.id);
          continue;
        }
        try {
          const image = await RawImage.fromBlob(item.blob);
          const inputs = await processor(image);
          const out = await model(inputs);
          const vec = normalize((out.image_embeds.tolist() as number[][])[0]);
          // pgvector accepts its text literal form, which is what a JSON array
          // of numbers already looks like.
          updates.push({ id: item.row.id, embedding: JSON.stringify(vec) });
        } catch (err) {
          failed++;
          await supabase
            .from("images")
            .update({
              embedding_error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
            })
            .eq("id", item.row.id);
        }
      }

      await Promise.all(
        updates.map((u) =>
          supabase
            .from("images")
            .update({ embedding: u.embedding, embedded_at: new Date().toISOString() })
            .eq("id", u.id)
        )
      );
      done += updates.length;

      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 1);
      process.stdout.write(
        `\rembedded ${done}  failed ${failed}  ${rate.toFixed(1)}/s  ` +
          `eta ${pending ? (((pending - done) / Math.max(rate, 0.01)) / 60).toFixed(0) : "?"}min   `
      );
    }
  }

  console.log(
    `\n\ndone: ${done} embedded, ${failed} failed, ` +
      `${((Date.now() - startedAt) / 60000).toFixed(1)} min`
  );
  if (failed > 0) {
    console.log("re-run with --retry-failed to retry the failures.");
  }
}

main().catch((err) => {
  console.error("\nembed failed:", err);
  process.exit(1);
});
