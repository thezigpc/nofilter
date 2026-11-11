import { readFileSync } from "fs";
import type { BlackCard, PackSummary, WhiteCard } from "@tabletop-judge/shared";
import { resolvePick } from "./validate.js";

export interface RawCard {
  text: string;
  pack?: string;
  pick?: number;
}

export interface RawPack {
  name: string;
  /** Freeform section label - see PackSummary.category. */
  category?: string;
  /** Legacy field from the older pack schema. Only consulted as a
   * fallback when `category` is absent, so an older-schema corpus file
   * file still groups sensibly without needing to be edited - see
   * resolveCategory() below. */
  official?: boolean;
  sheetName?: string;
  white?: RawCard[];
  black?: RawCard[];
  mechanic?: number[];
}

export interface LoadedCardData {
  packs: PackSummary[];
  whiteByPack: Map<string, WhiteCard[]>;
  blackByPack: Map<string, BlackCard[]>;
}

/**
 * `category` is what actually groups packs in the client (pack browser,
 * Lobby's picker) - this is the one place that resolves it when a pack
 * doesn't carry one explicitly, so every loading path (the bundled sample,
 * an env-pinned file, an uploaded Core Set reloaded on the next boot) falls
 * back the same way. An *upload* additionally gets an interactive mapper
 * (CoreSetPanel) letting a human merge near-duplicate raw labels before
 * this ever runs - this function only ever sees whatever category the
 * uploader already resolved things to, or a legacy file with no mapper
 * involved at all.
 */
export function resolveCategory(category: string | undefined, official: boolean | undefined): string {
  const trimmed = category?.trim();
  if (trimmed) return trimmed;
  return official ? "Official" : "Uncategorized";
}

/**
 * Builds indexed card data from an already-parsed pack array, assigning
 * stable ids per card keyed by pack array index (the source schema has no
 * top-level pack id field). Pulled out from loadCardData() so both a
 * from-disk load (loadCardData below) and an in-memory Core Set upload
 * (server/src/cards/coreSet.ts) go through the exact same indexing and
 * pick-repair logic rather than two implementations drifting apart.
 */
export function buildCardData(raw: RawPack[]): LoadedCardData {
  const packs: PackSummary[] = [];
  const whiteByPack = new Map<string, WhiteCard[]>();
  const blackByPack = new Map<string, BlackCard[]>();

  raw.forEach((pack, packIndex) => {
    const packId = String(packIndex);

    const white: WhiteCard[] = (pack.white ?? []).map((c, i) => ({
      id: `w${packIndex}_${i}`,
      text: c.text,
      pack: packId,
    }));

    const black: BlackCard[] = (pack.black ?? []).map((c, i) => ({
      id: `b${packIndex}_${i}`,
      text: c.text,
      pick: resolvePick(c.text, c.pick),
      pack: packId,
    }));

    whiteByPack.set(packId, white);
    blackByPack.set(packId, black);

    packs.push({
      id: packId,
      name: pack.name,
      category: resolveCategory(pack.category, pack.official),
      whiteCount: white.length,
      blackCount: black.length,
    });
  });

  return { packs, whiteByPack, blackByPack };
}

/**
 * Loads a pack-array JSON file (see CLAUDE.md) and assigns stable ids per
 * card. Swapping or upgrading the source file only requires it to match
 * that schema - nothing here is wired to specific pack contents.
 */
export function loadCardData(filePath: string): LoadedCardData {
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as RawPack[];
  return buildCardData(raw);
}
