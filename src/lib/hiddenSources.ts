// Sources omitted from the deck and the liked wall.
//
// DEFAULT_HIDDEN applies everywhere, including production. HIDDEN_SOURCES (a
// comma-separated env var) adds to it for one environment.
//
// `artic` is hidden by default because its images cannot be shown reliably to
// anyone right now, for two compounding reasons:
//
//  1. Cloudflare blocked the machine that ran the embedding backfill from
//     artic.edu outright -- a real browser there gets "Sorry, you have been
//     blocked" for the whole domain, and it had not lifted after two days.
//     Visitors on other networks load them fine, but the owner cannot see
//     their own site, and the block is a reputation decision we do not control.
//  2. All 1,856 of them are unembedded as a direct result, so they can be dealt
//     from the random pool but can never appear in visual similarity. They are
//     the entire gap between 94% embedding coverage and 100%.
//
// This started as an env-only workaround on the theory that an unreachable host
// is one network's problem rather than the data's. That was right until the
// block outlasted the patience for it: the images are now both unviewable by
// the owner and invisible to the recommender, which is not a state worth
// serving to strangers.
//
// To bring them back: mirror them with `npm run mirror --host=www.artic.edu`
// from a network AIC will talk to, embed them with
// `npm run embed -- --source=artic`, then delete "artic" from this set.
const DEFAULT_HIDDEN = ["artic"];

export function hiddenSources(): Set<string> {
  const fromEnv = (process.env.HIDDEN_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_HIDDEN, ...fromEnv]);
}

export function withoutHiddenSources<T extends { source_museum: string }>(
  images: T[]
): T[] {
  const hidden = hiddenSources();
  if (hidden.size === 0) return images;
  return images.filter((img) => !hidden.has(img.source_museum));
}
