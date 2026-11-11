import type { PackSummary } from "@tabletop-judge/shared";

export interface PackGroup {
  category: string;
  packs: PackSummary[];
}

/** A section starts collapsed once it's long enough that opening it by
 * default would dump a wall of rows on the page - same idea as the old
 * official(short)/third-party(400+) split, just size-based instead of
 * keyed to specific category names, since there's no guaranteed category
 * any more (a Core Set upload can carry whatever sections its admin gave
 * it - see CoreSetPanel's section mapper). */
export const COLLAPSE_THRESHOLD = 20;

/**
 * Splits a pack list into Custom Sets (always their own separate,
 * always-present section - see PackSummary.isCustomSet) and everything
 * else, grouped dynamically by whatever `category` values are actually
 * present. Shared by Lobby's pack picker and Card Management's preset
 * builder, which both used to duplicate a hardcoded official/third-party
 * split.
 */
export function groupPacksByCategory(packs: PackSummary[]): {
  categoryGroups: PackGroup[];
  customSetPacks: PackSummary[];
} {
  const customSetPacks = packs.filter((p) => p.isCustomSet);
  const byCategory = new Map<string, PackSummary[]>();
  for (const p of packs) {
    if (p.isCustomSet) continue;
    const list = byCategory.get(p.category);
    if (list) list.push(p);
    else byCategory.set(p.category, [p]);
  }
  const categoryGroups = [...byCategory.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, groupPacks]) => ({ category, packs: groupPacks }));
  return { categoryGroups, customSetPacks };
}
