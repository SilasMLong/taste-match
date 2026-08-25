// In-process cache of encoded images for /api/image/[id].
//
// Without it the proxy re-downloaded a 2-3 MB original from the museum and
// re-encoded it with sharp on every single request. Measured against a real
// swiping session, that put proxied cards at 1.1-3.8 seconds each, and the
// server log showed the same image ids being paid for twice. A card that takes
// four seconds to appear is indistinguishable from a broken one, which is
// exactly how it was read.
//
// The `immutable` response header only helps a browser that has already loaded
// the image once, and in a deck every new card is a first load.
//
// Bounded by total bytes rather than entry count, since encoded sizes vary by
// an order of magnitude. Map iteration order is insertion order, so re-inserting
// on read gives LRU eviction for free.

export type CachedImage = { body: Buffer; contentType: string };

const MAX_BYTES = 64 * 1024 * 1024;

const entries = new Map<string, CachedImage>();
let totalBytes = 0;

export function getCachedImage(key: string): CachedImage | undefined {
  const hit = entries.get(key);
  if (!hit) return undefined;
  // Re-insert to mark as most recently used.
  entries.delete(key);
  entries.set(key, hit);
  return hit;
}

export function setCachedImage(key: string, value: CachedImage): void {
  const existing = entries.get(key);
  if (existing) {
    totalBytes -= existing.body.byteLength;
    entries.delete(key);
  }
  // Something pathologically large should not evict the entire cache to fit.
  if (value.body.byteLength > MAX_BYTES) return;

  entries.set(key, value);
  totalBytes += value.body.byteLength;

  while (totalBytes > MAX_BYTES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    const evicted = entries.get(oldest.value);
    entries.delete(oldest.value);
    if (evicted) totalBytes -= evicted.body.byteLength;
  }
}

export function imageCacheStats(): { count: number; bytes: number } {
  return { count: entries.size, bytes: totalBytes };
}
