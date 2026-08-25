// Sources to omit from the deck and the liked wall, read from the
// HIDDEN_SOURCES env var as a comma-separated list of `source_museum` values.
// Empty by default, so this changes nothing unless someone opts in.
//
// This exists as an environment setting rather than a code constant on purpose.
// The case it was built for is local: Cloudflare blocked the IP that ran the
// embedding backfill from artic.edu entirely -- a real browser on that machine
// gets "Sorry, you have been blocked", so all 1,856 AIC images render as broken
// cards there. That is a property of one machine's IP reputation, not of the
// data, and visitors on any other network load those images normally. Baking
// `artic` into the source would degrade the site for everyone to fix one
// person's network; putting it in .env.local (which is gitignored) keeps the
// workaround exactly where the problem is.
//
// Set in .env.local:  HIDDEN_SOURCES=artic
//
// Server-only: this reads process.env and must not be imported from a client
// component.
export function hiddenSources(): Set<string> {
  return new Set(
    (process.env.HIDDEN_SOURCES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function withoutHiddenSources<T extends { source_museum: string }>(
  images: T[]
): T[] {
  const hidden = hiddenSources();
  if (hidden.size === 0) return images;
  return images.filter((img) => !hidden.has(img.source_museum));
}
