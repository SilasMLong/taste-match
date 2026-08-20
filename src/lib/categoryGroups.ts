// The five top-level browsing groups shown as filter bubbles on the deck.
// This is deliberately a separate layer from `images.category`
// (painting/sculpture/print/...), not a renaming of it: "Fine Art" covers
// several existing category values at once, while the other four each map
// onto a category that doesn't have any seeded data yet (no architecture/
// furniture/product/fashion source is wired up as of this writing --
// selecting one of those bubbles will show an empty deck until one is).
export type CategoryGroup = "fine_art" | "architecture" | "products" | "furniture" | "fashion";

export const CATEGORY_GROUPS: { key: CategoryGroup; label: string; categories: string[] }[] = [
  { key: "fine_art", label: "Fine Art", categories: ["painting", "sculpture", "print", "other"] },
  { key: "architecture", label: "Architecture", categories: ["architecture"] },
  { key: "products", label: "Products", categories: ["product"] },
  { key: "furniture", label: "Furniture", categories: ["furniture"] },
  { key: "fashion", label: "Fashion", categories: ["fashion"] },
];

export function categoriesForGroup(group: string): string[] | null {
  return CATEGORY_GROUPS.find((g) => g.key === group)?.categories ?? null;
}
