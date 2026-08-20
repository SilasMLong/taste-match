// V2's scoring/selection layer. Reads the swipe history V1 already collects
// (swipes.tags/category/culture/medium are denormalized specifically so this
// never has to join back to `images`) and turns it into deck ordering. No
// new tables, no ML -- see the README roadmap section for what's deferred
// to V3 (CLIP-based similarity) versus handled here (tag overlap).

import type { Category, ImageRecord } from "./types";

// One flat namespace across category/culture/medium/tags, matching the
// product spec's own example profile ("Japanese: +14, Impressionist: +9,
// sculpture: -6") -- category and culture and a free-text tag all just
// contribute to the same signal.
export type TagProfile = Record<string, number>;

interface TaggedRecord {
  category: Category | string;
  culture: string | null;
  medium: string | null;
  tags: string[];
}

interface SwipeSignal extends TaggedRecord {
  liked: boolean;
}

const EXPLORE_RATIO = 0.175; // middle of the spec'd 15-20% range
// Every candidate keeps at least this much selection weight regardless of
// score, so a disliked or never-seen tag is deprioritized, not banned --
// V1's "exposure builds taste" premise breaks if the deck can fully close
// itself off from anything.
const WEIGHT_BASELINE = 1;
// Smithsonian's `medium` field is sometimes a full descriptive sentence
// ("Wood, polychromy, lead, gilded silver, painted parchment, silk
// embroidery...") rather than a short categorical value like Met's. A value
// that long will essentially never exactly match another image, so it's
// pure noise in both the score and the taste page -- verified against real
// seeded data, not hypothetical.
const MAX_VALUE_LENGTH = 40;

function valuesOf(record: TaggedRecord): string[] {
  return Array.from(
    new Set(
      [record.category, record.culture, record.medium, ...record.tags].filter(
        (v): v is string => v != null && v.length > 0 && v.length <= MAX_VALUE_LENGTH
      )
    )
  );
}

export function computeProfile(swipes: SwipeSignal[]): TagProfile {
  const profile: TagProfile = {};
  for (const swipe of swipes) {
    const delta = swipe.liked ? 1 : -1;
    for (const value of valuesOf(swipe)) {
      profile[value] = (profile[value] ?? 0) + delta;
    }
  }
  return profile;
}

export function scoreImage(image: TaggedRecord, profile: TagProfile): number {
  return valuesOf(image).reduce((sum, v) => sum + (profile[v] ?? 0), 0);
}

// Top N entries by weight; sign picks favored (positive) vs avoided
// (negative) tags, used both for explore-pool exclusion and the taste page.
export function topEntries(
  profile: TagProfile,
  n: number,
  sign: 1 | -1
): [string, number][] {
  return Object.entries(profile)
    .filter(([, weight]) => (sign > 0 ? weight > 0 : weight < 0))
    .sort((a, b) => (sign > 0 ? b[1] - a[1] : a[1] - b[1]))
    .slice(0, n);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Weighted random sampling without replacement (Efraimidis-Spirakis A-Res):
// each item gets a key = u^(1/weight) for u ~ Uniform(0,1), and the top-K
// keys win. Higher weight pushes the key toward 1 more often, but every
// item with weight > 0 has *some* chance -- this is what makes selection
// "weighted random across high scorers," not a deterministic top-N rank,
// so the deck doesn't calcify into showing the same handful of images.
function weightedSampleWithoutReplacement<T>(
  items: T[],
  weightOf: (item: T) => number,
  k: number
): T[] {
  if (k <= 0 || items.length === 0) return [];
  const keyed = items.map((item) => ({
    item,
    key: Math.pow(Math.random(), 1 / Math.max(weightOf(item), 1e-6)),
  }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, Math.min(k, keyed.length)).map((k) => k.item);
}

// Builds one deck batch: a weighted-random main slice plus a reserved
// explore slice drawn only from candidates that lack the single most
// dominant tag in the profile. Excluding just the top tag (not the whole
// profile) is deliberate: an image can still share secondary tags with the
// user's taste, so the explore slice leans toward "adjacent" rather than
// fully unrelated -- true similarity-based adjacency (e.g. Japanese
// woodblock prints -> Chinese ink painting) needs embeddings, which is V3's
// job; this is the tag-only approximation V2 is scoped to.
export function buildDeck(
  candidates: ImageRecord[],
  profile: TagProfile,
  limit: number
): ImageRecord[] {
  const weightOf = (img: ImageRecord) => Math.max(scoreImage(img, profile), 0) + WEIGHT_BASELINE;

  const [dominant] = topEntries(profile, 1, 1);
  if (!dominant) {
    // Cold start: no signal yet, every candidate has equal weight, so this
    // is equivalent to V1's plain shuffle.
    return weightedSampleWithoutReplacement(candidates, weightOf, limit);
  }
  const [dominantValue] = dominant;

  const exploreCount = Math.round(limit * EXPLORE_RATIO);
  const explorePool = candidates.filter((img) => !valuesOf(img).includes(dominantValue));
  const exploreSelected = weightedSampleWithoutReplacement(explorePool, weightOf, exploreCount);

  const exploreIds = new Set(exploreSelected.map((img) => img.id));
  const mainPool = candidates.filter((img) => !exploreIds.has(img.id));
  const mainSelected = weightedSampleWithoutReplacement(
    mainPool,
    weightOf,
    limit - exploreSelected.length
  );

  return shuffle([...exploreSelected, ...mainSelected]);
}
