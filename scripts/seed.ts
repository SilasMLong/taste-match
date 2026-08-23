// Populates the `images` table from five open-access APIs: Met, Smithsonian,
// Art Institute of Chicago, Cleveland Museum of Art (fine art), and Europeana
// (architecture + fashion -- see EUROPEANA_PROVIDERS below for why it's
// scoped to just those two categories). Run once to get started, and again
// any time to pull in more -- it upserts on (source_museum, external_id) so
// re-running never creates duplicates. See supabase/README.md for the
// required env vars, and supabase/migrations/0002_open_source_museum.sql
// (run once, before the first artic/cleveland/europeana seed).
//
// Usage:
//   npm run seed                       # all sources, default count
//   npm run seed -- --source=met       # one source only
//   npm run seed -- --count=200        # override per-category target

import { createClient } from "@supabase/supabase-js";
import type { Category, NewImageRecord, SourceMuseum } from "../src/lib/types";
import { loadDotEnvLocal } from "./env";

loadDotEnvLocal();

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SMITHSONIAN_API_KEY = process.env.SMITHSONIAN_API_KEY || "DEMO_KEY";
const EUROPEANA_API_KEY = process.env.EUROPEANA_API_KEY || "";

const args = parseArgs(process.argv.slice(2));
const SOURCE = (args.source as SourceMuseum | "all") ?? "all";
const PER_CATEGORY_TARGET = Number(args.count) || 120;

const CATEGORY_TERMS: { category: Category; term: string; metMedium: string; properType: string }[] = [
  // metMedium is the Met API's `medium` filter value, which is matched
  // against the object's own medium/classification vocabulary and is picky
  // about exact casing and singular/plural (verified against the live API:
  // "painting" -> 0 results, "Paintings" -> thousands).
  // properType is the shared artwork-type value both the Art Institute of
  // Chicago's `artwork_type_title` and Cleveland's `type` use -- verified
  // live that both museums happen to use the same singular capitalized
  // strings for these three categories.
  { category: "painting", term: "painting", metMedium: "Paintings", properType: "Painting" },
  { category: "sculpture", term: "sculpture", metMedium: "Sculpture", properType: "Sculpture" },
  { category: "print", term: "print", metMedium: "Prints", properType: "Print" },
];

// Art-focused Smithsonian units. Excludes e.g. natural history or the
// libraries, which dominate a plain keyword search but aren't fine art.
const SMITHSONIAN_ART_UNITS = ["SAAM", "NPG", "HMSG", "FSG"];

// Europeana aggregates from thousands of institutions of wildly varying
// metadata quality -- a plain keyword search returns messy, barely-tagged
// records from ethnographic and regional-history collections. Scoping to
// specific reputable DATA_PROVIDER values (found via Europeana's facet
// endpoint) gets clean results, the same trick SMITHSONIAN_ART_UNITS plays
// for Smithsonian's search.
//
// This is deliberately fine-art-free and limited to just two categories:
// - Fine art: our four dedicated museum APIs already give deep, richly
//   tagged coverage (creator, medium, classification all populated).
//   Europeana's aggregated version of the *same* institutions (verified
//   live against Rijksmuseum) is noticeably thinner -- no creator, no
//   medium, generic titles -- so it isn't worth adding.
// - Products: too thin and scattered to find a good provider (~1,100
//   total results for "product design", no institution with real volume).
// - Furniture: the one clearly dedicated source, Mobilier National
//   Collections, has a fully broken image host (verified live: 10/10
//   sampled image URLs 404, their site was restructured since Europeana's
//   crawl) -- no working replacement found.
// - Museum of Finnish Architecture was also tried and dropped: its image
//   host 401s on every request (verified live), which looks like it needs
//   an authentication Europeana's metadata doesn't give us.
const EUROPEANA_PROVIDERS: { category: Category; providers: string[] }[] = [
  {
    category: "architecture",
    providers: [
      "Museum of Architecture at Berlin Institute of Technology",
      "Swedish Centre for Architecture and Design",
    ],
  },
  {
    category: "fashion",
    providers: ["Palais Galliera - Musée de la Mode de la Ville de Paris", "Fashion Museum of Antwerp"],
  },
];

// reusability=open (the query-level filter) covers CC0, Public Domain Mark,
// CC BY, and CC BY-SA -- but the latter two legally require attribution,
// which nothing in this app displays. Rather than risk showing
// attribution-required work with no attribution, only accept the two
// license URIs that need none, checked per-record against the actual
// `rights` field returned (not just trusted from the query filter).
function isFullyOpenRights(rights: string | undefined): boolean {
  if (!rights) return false;
  return rights.includes("publicdomain/zero") || rights.includes("publicdomain/mark");
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const records: NewImageRecord[] = [];

  if (SOURCE === "met" || SOURCE === "all") {
    for (const { category, term, metMedium } of CATEGORY_TERMS) {
      console.log(`[met] fetching "${term}" (target ${PER_CATEGORY_TARGET})...`);
      const batch = await fetchMetCategory(term, metMedium, category, PER_CATEGORY_TARGET);
      console.log(`[met] "${term}": ${batch.length} usable records`);
      records.push(...batch);
      // The Met API's front door throttles bursts of requests -- back off
      // between categories, not just between individual object fetches
      // (verified live: hammering categories back-to-back drew a 403).
      await sleep(3000);
    }
  }

  if (SOURCE === "smithsonian" || SOURCE === "all") {
    for (const { category, term } of CATEGORY_TERMS) {
      console.log(`[smithsonian] fetching "${term}" (target ${PER_CATEGORY_TARGET})...`);
      const batch = await fetchSmithsonianCategory(term, category, PER_CATEGORY_TARGET);
      console.log(`[smithsonian] "${term}": ${batch.length} usable records`);
      records.push(...batch);
    }
  }

  if (SOURCE === "artic" || SOURCE === "all") {
    for (const { category, properType } of CATEGORY_TERMS) {
      console.log(`[artic] fetching "${properType}" (target ${PER_CATEGORY_TARGET})...`);
      const batch = await fetchArticCategory(properType, category, PER_CATEGORY_TARGET);
      console.log(`[artic] "${properType}": ${batch.length} usable records`);
      records.push(...batch);
    }
  }

  if (SOURCE === "cleveland" || SOURCE === "all") {
    for (const { category, properType } of CATEGORY_TERMS) {
      console.log(`[cleveland] fetching "${properType}" (target ${PER_CATEGORY_TARGET})...`);
      const batch = await fetchClevelandCategory(properType, category, PER_CATEGORY_TARGET);
      console.log(`[cleveland] "${properType}": ${batch.length} usable records`);
      records.push(...batch);
    }
  }

  if (SOURCE === "europeana" || SOURCE === "all") {
    if (!EUROPEANA_API_KEY) {
      console.log("[europeana] EUROPEANA_API_KEY not set, skipping");
    } else {
      for (const { category, providers } of EUROPEANA_PROVIDERS) {
        console.log(`[europeana] fetching "${category}" (target ${PER_CATEGORY_TARGET})...`);
        const batch = await fetchEuropeanaCategory(category, providers, PER_CATEGORY_TARGET);
        console.log(`[europeana] "${category}": ${batch.length} usable records`);
        records.push(...batch);
      }
    }
  }

  // The same object can legitimately match more than one category search
  // (e.g. a piece indexed under both "painting" and "print"), which would
  // otherwise put two rows with the same (source_museum, external_id) in a
  // single upsert call -- Postgres rejects that ("cannot affect row a
  // second time"). Last search wins.
  const deduped = Array.from(
    new Map(records.map((r) => [`${r.source_museum}:${r.external_id}`, r])).values()
  );
  if (deduped.length < records.length) {
    console.log(`Deduped ${records.length - deduped.length} cross-category repeats.`);
  }

  console.log(`Upserting ${deduped.length} records into Supabase...`);
  const CHUNK = 200;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("images")
      .upsert(chunk, { onConflict: "source_museum,external_id" });
    if (error) {
      console.error("Upsert failed for chunk", i / CHUNK, error.message);
    } else {
      console.log(`  upserted ${Math.min(i + CHUNK, deduped.length)}/${deduped.length}`);
    }
  }

  console.log("Done.");
}

// ---------- Met Museum ----------

// The Met API's front door throttles by request volume over a rolling
// window, not per-request -- a plain single retry wasn't enough (verified
// live: it can stay 403ing for well over 10s after a burst of object
// fetches). Retry with real backoff, and keep both search and per-object
// fetches on this path.
async function fetchMetWithRetry(url: string, retries = 4): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (attempt === retries) return null;
    const delayMs = 5000 * 2 ** attempt; // 5s, 10s, 20s, 40s
    console.warn(`[met] ${res.status} on ${url} -- retrying in ${delayMs / 1000}s...`);
    await sleep(delayMs);
  }
  return null;
}

async function fetchMetCategory(
  term: string,
  metMedium: string,
  category: Category,
  targetCount: number
): Promise<NewImageRecord[]> {
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&medium=${encodeURIComponent(
    metMedium
  )}&q=${encodeURIComponent(term)}`;
  const searchRes = await fetchMetWithRetry(searchUrl);
  if (!searchRes) {
    console.warn(`[met] search for "${term}" kept failing, skipping this category`);
    return [];
  }
  const searchData = (await searchRes.json()) as { objectIDs?: number[] };
  const ids = (searchData.objectIDs ?? []).slice(0, targetCount * 2); // headroom for filtered-out objects

  const results: NewImageRecord[] = [];
  // Low concurrency + a stagger between requests: the burst at concurrency
  // 6 with no delay was what drew the 403s in the first place.
  await mapLimit(ids, 3, async (id) => {
    if (results.length >= targetCount) return;
    await sleep(150);
    const obj = await fetchMetObject(id, category);
    if (obj) results.push(obj);
  });
  return results.slice(0, targetCount);
}

interface MetObject {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage: string;
  title: string;
  artistDisplayName: string;
  objectDate: string;
  culture: string;
  medium: string;
  classification: string;
  objectName: string;
  tags?: { term: string }[];
}

async function fetchMetObject(
  id: number,
  fallbackCategory: Category
): Promise<NewImageRecord | null> {
  try {
    const res = await fetchMetWithRetry(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
      2
    );
    if (!res) return null;
    const obj = (await res.json()) as MetObject;
    if (!obj.isPublicDomain || !obj.primaryImage) return null;

    return {
      external_id: String(obj.objectID),
      title: obj.title || "Untitled",
      artist: obj.artistDisplayName || null,
      date_period: obj.objectDate || null,
      culture: obj.culture || null,
      medium: obj.medium || null,
      category: normalizeCategory(obj.classification, obj.objectName, fallbackCategory),
      source_museum: "met",
      image_url: obj.primaryImage,
      tags: (obj.tags ?? []).map((t) => t.term),
    };
  } catch {
    return null;
  }
}

// ---------- Smithsonian ----------

interface SmithsonianRow {
  id: string;
  content: {
    freetext?: {
      name?: { label: string; content: string }[];
      date?: { label: string; content: string }[];
      physicalDescription?: { label: string; content: string }[];
      topic?: { label: string; content: string }[];
    };
    indexedStructured?: {
      date?: string[];
      topic?: string[];
      object_type?: string[];
      culture?: string[];
    };
    descriptiveNonRepeating?: {
      title?: { content?: string };
      online_media?: { media?: { type: string; content: string }[] };
    };
  };
}

async function fetchSmithsonianCategory(
  term: string,
  category: Category,
  targetCount: number
): Promise<NewImageRecord[]> {
  const unitFilter = SMITHSONIAN_ART_UNITS.map((u) => `unit_code:${u}`).join(" OR ");
  const query = `${term} AND online_media_type:Images AND (${unitFilter})`;
  const rows = 100;
  const results: NewImageRecord[] = [];
  let start = 0;

  while (results.length < targetCount) {
    const url =
      `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(query)}` +
      `&start=${start}&rows=${rows}&api_key=${SMITHSONIAN_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[smithsonian] search failed for "${term}" at start=${start}: ${res.status}`);
      break;
    }
    const data = (await res.json()) as { response?: { rows?: SmithsonianRow[] } };
    const batch = data.response?.rows ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const record = smithsonianRowToRecord(row, category);
      if (record) results.push(record);
      if (results.length >= targetCount) break;
    }

    start += rows;
    await sleep(250); // be polite regardless of key tier
  }

  return results.slice(0, targetCount);
}

function smithsonianRowToRecord(
  row: SmithsonianRow,
  fallbackCategory: Category
): NewImageRecord | null {
  const media = row.content.descriptiveNonRepeating?.online_media?.media;
  const image = media?.find((m) => m.type === "Images");
  if (!image?.content) return null;

  const title = row.content.descriptiveNonRepeating?.title?.content;
  if (!title) return null;

  const artist = row.content.freetext?.name?.find((n) =>
    /artist|painter|sculptor|maker/i.test(n.label)
  )?.content;
  const medium = row.content.freetext?.physicalDescription?.find((p) =>
    /medium/i.test(p.label)
  )?.content;
  const datePeriod =
    row.content.indexedStructured?.date?.[0] ?? row.content.freetext?.date?.[0]?.content;
  const objectTypes = row.content.indexedStructured?.object_type ?? [];
  const topics = row.content.indexedStructured?.topic ?? [];

  return {
    external_id: row.id,
    title,
    artist: artist ?? null,
    date_period: datePeriod ?? null,
    culture: row.content.indexedStructured?.culture?.[0] ?? null,
    medium: medium ?? null,
    category: normalizeCategory(...objectTypes, fallbackCategory),
    source_museum: "smithsonian",
    // image.content already carries its own `?id=...` query string (e.g.
    // "https://ids.si.edu/ids/deliveryService?id=HMSG-66.1560-000001"), so
    // appending a bare "?max=800" produces an invalid double "?" that IDS
    // 404s on -- verified live. Append with "&" instead.
    image_url: `${image.content}${image.content.includes("?") ? "&" : "?"}max=800`,
    tags: Array.from(new Set(topics)),
  };
}

// ---------- Art Institute of Chicago ----------

interface ArticArtwork {
  id: number;
  title: string;
  artist_display: string;
  date_display: string;
  place_of_origin: string;
  medium_display: string;
  classification_titles?: string[];
  is_public_domain: boolean;
  image_id: string | null;
}

async function fetchArticCategory(
  properType: string,
  category: Category,
  targetCount: number
): Promise<NewImageRecord[]> {
  // AIC's search is Elasticsearch-backed; a `term` filter only supports one
  // field per query (verified live -- passing both artwork_type_title and
  // is_public_domain as term filters in one call 400s with a parsing
  // error), so is_public_domain and image presence are checked client-side
  // in articItemToRecord instead, same as the Met/Smithsonian filtering.
  const results: NewImageRecord[] = [];
  const pageSize = 100;
  let page = 1;

  while (results.length < targetCount) {
    const url =
      `https://api.artic.edu/api/v1/artworks/search?q=*` +
      `&query%5Bterm%5D%5Bartwork_type_title.keyword%5D=${encodeURIComponent(properType)}` +
      `&page=${page}&limit=${pageSize}` +
      `&fields=id,title,artist_display,date_display,place_of_origin,medium_display,classification_titles,is_public_domain,image_id`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[artic] search failed for "${properType}" page ${page}: ${res.status}`);
      break;
    }
    const data = (await res.json()) as {
      data?: ArticArtwork[];
      pagination?: { total_pages: number };
    };
    const batch = data.data ?? [];
    if (batch.length === 0) break;

    for (const item of batch) {
      const record = articItemToRecord(item, category);
      if (record) results.push(record);
      if (results.length >= targetCount) break;
    }

    if (data.pagination && page >= data.pagination.total_pages) break;
    page += 1;
    await sleep(150);
  }

  return results.slice(0, targetCount);
}

function articItemToRecord(item: ArticArtwork, fallbackCategory: Category): NewImageRecord | null {
  if (!item.is_public_domain || !item.image_id) return null;
  return {
    external_id: String(item.id),
    title: item.title || "Untitled",
    artist: item.artist_display || null,
    date_period: item.date_display || null,
    culture: item.place_of_origin || null,
    medium: item.medium_display || null,
    category: normalizeCategory(...(item.classification_titles ?? []), fallbackCategory),
    source_museum: "artic",
    image_url: `https://www.artic.edu/iiif/2/${item.image_id}/full/843,/0/default.jpg`,
    tags: item.classification_titles ?? [],
  };
}

// ---------- Cleveland Museum of Art ----------

interface ClevelandArtwork {
  id: number;
  title: string;
  creators?: { description: string }[];
  creation_date: string;
  culture?: string[];
  technique: string;
  type: string;
  department?: string;
  images?: { web?: { url: string } };
}

async function fetchClevelandCategory(
  properType: string,
  category: Category,
  targetCount: number
): Promise<NewImageRecord[]> {
  const results: NewImageRecord[] = [];
  const limit = 100;
  let skip = 0;

  while (results.length < targetCount) {
    const url =
      `https://openaccess-api.clevelandart.org/api/artworks/` +
      `?type=${encodeURIComponent(properType)}&cc0=1&has_image=1` +
      `&skip=${skip}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[cleveland] search failed for "${properType}" at skip=${skip}: ${res.status}`);
      break;
    }
    const data = (await res.json()) as { data?: ClevelandArtwork[] };
    const batch = data.data ?? [];
    if (batch.length === 0) break;

    for (const item of batch) {
      const record = clevelandItemToRecord(item, category);
      if (record) results.push(record);
      if (results.length >= targetCount) break;
    }

    skip += limit;
    await sleep(150);
  }

  return results.slice(0, targetCount);
}

function clevelandItemToRecord(
  item: ClevelandArtwork,
  fallbackCategory: Category
): NewImageRecord | null {
  const imageUrl = item.images?.web?.url;
  if (!imageUrl) return null;
  return {
    external_id: String(item.id),
    title: item.title || "Untitled",
    artist: item.creators?.[0]?.description || null,
    date_period: item.creation_date || null,
    culture: item.culture?.[0] || null,
    medium: item.technique || null,
    // item.department is deliberately excluded here: CMA's curatorial
    // departments are often named after a *pair* of media ("American
    // Painting and Sculpture"), and normalizeCategory checks "sculpture"
    // before "paint" -- department text alone flipped genuine paintings
    // (Copley's "Nathaniel Hurd", oil on canvas) to "sculpture" even though
    // item.type correctly said "Painting". CMA's `type` field is already a
    // clean, authoritative single value (unlike Met's classification/
    // objectName, which is why those still need the fuzzy multi-field
    // match), so it doesn't need a department fallback at all.
    category: normalizeCategory(item.type, fallbackCategory),
    source_museum: "cleveland",
    image_url: imageUrl,
    // CMA's public dataset doesn't populate keywords/tags (verified live --
    // consistently null across sampled records), so department is the only
    // available tag-like signal.
    tags: item.department ? [item.department] : [],
  };
}

// ---------- Europeana ----------

interface EuropeanaItem {
  id: string;
  title?: string[];
  dcCreator?: string[];
  year?: string[];
  edmTimespanLabel?: { def?: string }[];
  dctermsMedium?: string[];
  country?: string[];
  edmIsShownBy?: string[];
  rights?: string[];
  dcSubjectLangAware?: { def?: string[] };
}

async function fetchEuropeanaCategory(
  category: Category,
  providers: string[],
  targetCount: number
): Promise<NewImageRecord[]> {
  const results: NewImageRecord[] = [];

  for (const provider of providers) {
    if (results.length >= targetCount) break;
    // Cursor-based, not offset-based: Europeana hard-caps offset pagination
    // at 1000 results ("It is not possible to paginate beyond the first
    // 1000 search results") and explicitly names cursor pagination as the
    // way around it -- verified live that it actually does go past 1000
    // with zero duplicate ids across pages.
    let cursor = "*";

    while (results.length < targetCount) {
      const params = new URLSearchParams({
        wskey: EUROPEANA_API_KEY,
        query: "*",
        reusability: "open",
        rows: "100",
        cursor,
      });
      params.append("qf", "TYPE:IMAGE");
      params.append("qf", `DATA_PROVIDER:"${provider}"`);

      const res = await fetch(`https://api.europeana.eu/record/v2/search.json?${params.toString()}`);
      if (!res.ok) {
        console.warn(`[europeana] search failed for "${provider}": ${res.status}`);
        break;
      }
      const data = (await res.json()) as { items?: EuropeanaItem[]; nextCursor?: string };
      const batch = data.items ?? [];
      if (batch.length === 0) break;

      for (const item of batch) {
        const record = europeanaItemToRecord(item, category);
        if (record) results.push(record);
        if (results.length >= targetCount) break;
      }

      if (!data.nextCursor) break;
      cursor = data.nextCursor;
      await sleep(150);
    }
  }

  return results.slice(0, targetCount);
}

function europeanaItemToRecord(item: EuropeanaItem, category: Category): NewImageRecord | null {
  const imageUrl = item.edmIsShownBy?.[0];
  if (!imageUrl) return null;
  // Belt-and-suspenders on top of the reusability=open query filter -- see
  // the EUROPEANA_PROVIDERS comment for why CC BY/CC BY-SA (also "open")
  // are deliberately excluded here.
  if (!isFullyOpenRights(item.rights?.[0])) return null;

  const title = item.title?.[0];
  if (!title) return null;

  // Europeana aggregates across many European languages -- "anonymous"
  // shows up as "Anoniem" (Dutch), "Anonyme" (French), "Anonimo" (Italian/
  // Spanish, sometimes with accent), "Unbekannt" (German), "Okänd"
  // (Swedish), etc. Verified live: a plain English-only check let "Anonyme"
  // through as if it were a real artist name.
  const ANONYMOUS_PATTERN =
    /^(anonymous|anoniem|anonyme|anonimo|an[oó]nimo|unbekannt|unknown|onbekend|ok[aä]nd)$/i;
  const artist =
    (item.dcCreator ?? [])
      .filter((c) => !c.startsWith("http") && !ANONYMOUS_PATTERN.test(c.trim()))
      .join(", ") || null;

  const tags = Array.from(
    new Set(
      (item.dcSubjectLangAware?.def ?? []).filter((s) => !s.startsWith("http") && !s.startsWith("urn:"))
    )
  );

  return {
    external_id: item.id,
    title,
    artist,
    date_period: item.year?.[0] ?? mostSpecificYear(item.edmTimespanLabel),
    culture: item.country?.[0] ?? null,
    medium: item.dctermsMedium?.[0] ?? null,
    category,
    source_museum: "europeana",
    image_url: imageUrl,
    tags,
  };
}

// edmTimespanLabel is a list of increasingly specific date descriptions
// (e.g. "Second millenium AD" -> "...years 1001-2000" -> "1689"); verified
// against live samples that the most specific one -- usually a bare year --
// comes last, so scan backwards for the first one that looks like a year.
function mostSpecificYear(timespans: { def?: string }[] | undefined): string | null {
  if (!timespans) return null;
  for (let i = timespans.length - 1; i >= 0; i--) {
    const def = timespans[i]?.def?.trim();
    if (def && /^\d{3,4}$/.test(def)) return def;
  }
  return null;
}

// ---------- shared helpers ----------

function normalizeCategory(...raw: (string | undefined)[]): Category {
  const text = raw.filter(Boolean).join(" ").toLowerCase();
  if (text.includes("sculpture")) return "sculpture";
  if (text.includes("print")) return "print";
  if (text.includes("paint")) return "painting";
  return "other";
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.local.example to .env.local and fill it in.`);
  }
  return value;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
