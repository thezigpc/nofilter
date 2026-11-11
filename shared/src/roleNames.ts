/**
 * What the two named roles are called in this room.
 *
 * "Judge" is the rotating player who picks each round's winner; "Wild Card"
 * is the house-rule bot that plays a random card every round. Both are
 * player-visible labels only - every identifier, event and error code
 * stays fixed, so renaming them can never break a client or a saved file.
 *
 * Two layers, same shape as the theme default: an admin sets the
 * deployment-wide default from /admin, every new room is seeded with it,
 * and a host can override it per room from the Lobby.
 */
export interface RoleNames {
  judge: string;
  wildCard: string;
}

export const DEFAULT_ROLE_NAMES: RoleNames = { judge: "Judge", wildCard: "Wild Card" };

export const MAX_ROLE_NAME_LENGTH = 24;

/** Trims, collapses whitespace, drops control characters and caps length.
 * Anything left empty falls back, so a role can never render as a blank. */
export function normalizeRoleName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const clean = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ROLE_NAME_LENGTH)
    .trim();
  return clean || fallback;
}

export function normalizeRoleNames(raw: unknown, fallback: RoleNames = DEFAULT_ROLE_NAMES): RoleNames {
  const r = (raw ?? {}) as Partial<Record<keyof RoleNames, unknown>>;
  return {
    judge: normalizeRoleName(r.judge, fallback.judge),
    wildCard: normalizeRoleName(r.wildCard, fallback.wildCard),
  };
}

/** Fills `{judge}` / `{wildCard}` placeholders in shared, data-driven text
 * (Action Card and Quick Setup descriptions) with the room's names. */
export function fillRoleNames(text: string, names: RoleNames): string {
  return text.replace(/\{judge\}/g, names.judge).replace(/\{wildCard\}/g, names.wildCard);
}

/** Keys and ids renamed in Nov 2026 (Czar -> Judge, Rando -> Wild Card).
 * Saved game-setup presets on existing deployments still carry the old
 * spellings; this maps them forward on load and on apply, so nothing on
 * disk has to be edited by hand. */
const LEGACY_HOUSE_RULE_KEYS: Record<string, string> = {
  randoCardrissian: "wildCard",
  randoCanScore: "wildCardCanScore",
};
const LEGACY_ACTION_CARD_IDS: Record<string, string> = {
  czar_accent: "judge_accent",
};

export function migrateLegacyHouseRules<T extends object>(rules: T): T {
  const out: Record<string, unknown> = { ...(rules as Record<string, unknown>) };
  for (const [oldKey, newKey] of Object.entries(LEGACY_HOUSE_RULE_KEYS)) {
    if (oldKey in out) {
      if (!(newKey in out)) out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  return out as T;
}

export function migrateLegacyActionCardId(id: string): string {
  return LEGACY_ACTION_CARD_IDS[id] ?? id;
}

export function migrateLegacyActionCardTiers<T>(tiers: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, tier] of Object.entries(tiers)) out[migrateLegacyActionCardId(id)] = tier;
  return out;
}

/** True when a migration changed anything - lets a store rewrite its file
 * once instead of carrying the old keys forever. */
export function hasLegacyKeys(setup: { houseRules?: object; actionCardTiers?: object }): boolean {
  const rules = setup.houseRules ?? {};
  const tiers = setup.actionCardTiers ?? {};
  return (
    Object.keys(LEGACY_HOUSE_RULE_KEYS).some((k) => k in rules) ||
    Object.keys(LEGACY_ACTION_CARD_IDS).some((k) => k in tiers)
  );
}
