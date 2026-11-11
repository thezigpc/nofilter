import { readFileSync } from "fs";
import type { CoreSetInfo, CoreSetUploadReport, UploadCoreSetPack } from "@tabletop-judge/shared";
import { BUNDLED_SAMPLE_CARD_DATA_PATH, CARD_DATA_PATH_OVERRIDE, CORE_SET_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";
import { buildCardData, resolveCategory, type LoadedCardData, type RawPack } from "./loader.js";
import { validateAndRepairCards } from "./validate.js";
import { log } from "../util/logger.js";

function isRawPackArray(parsed: unknown): parsed is RawPack[] {
  return Array.isArray(parsed);
}

let currentPacks: RawPack[] = [];
let source: CoreSetInfo["source"] = "bundled_sample";

/**
 * Resolves what card data this process boots with, checked once at boot:
 *   1. CARD_DATA_PATH env var, if explicitly set — existing deployments
 *      (e.g. Windows production pointing at a full third-party corpus that
 *      isn't checked into git) keep working completely unchanged, no
 *      migration required. Locks out Core Set uploads (see uploadCoreSet
 *      below) since the env var would just win again on the next restart.
 *   2. A Core Set previously uploaded through the admin panel, persisted at
 *      CORE_SET_PATH.
 *   3. The small bundled sample pack shipped in the repo — the fresh-deploy
 *      default, so a brand new install has something playable immediately.
 */
export async function loadInitialCardData(): Promise<LoadedCardData> {
  if (CARD_DATA_PATH_OVERRIDE) {
    currentPacks = JSON.parse(readFileSync(CARD_DATA_PATH_OVERRIDE, "utf-8")) as RawPack[];
    source = "env_override";
    log.info("boot", "card data: using CARD_DATA_PATH override", { path: CARD_DATA_PATH_OVERRIDE });
  } else {
    const uploaded = await loadJsonFile(CORE_SET_PATH, isRawPackArray);
    if (uploaded) {
      currentPacks = uploaded;
      source = "uploaded_core_set";
      log.info("boot", "card data: using previously uploaded Core Set", { path: CORE_SET_PATH });
    } else {
      currentPacks = JSON.parse(readFileSync(BUNDLED_SAMPLE_CARD_DATA_PATH, "utf-8")) as RawPack[];
      source = "bundled_sample";
      log.info("boot", "card data: using bundled sample pack", { path: BUNDLED_SAMPLE_CARD_DATA_PATH });
    }
  }
  return buildCardData(currentPacks);
}

export function getCoreSetInfo(cardData: LoadedCardData): CoreSetInfo {
  let totalWhite = 0;
  let totalBlack = 0;
  const categories = new Set<string>();
  for (const pack of cardData.packs) {
    totalWhite += pack.whiteCount;
    totalBlack += pack.blackCount;
    categories.add(pack.category);
  }
  return {
    source,
    totalPacks: cardData.packs.length,
    totalWhite,
    totalBlack,
    locked: Boolean(CARD_DATA_PATH_OVERRIDE),
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Validates/repairs every incoming pack's cards through the same shared
 * pass used by Custom Cards/Sets uploads (server/src/cards/validate.ts),
 * then either appends the cleaned packs ("add") or replaces the whole Core
 * Set ("replace"). Persists to CORE_SET_PATH and returns the freshly built
 * LoadedCardData for the caller to hand to RoomManager.setCardData() —
 * rooms already in progress keep whatever they captured at construction
 * time, only rooms created afterward see the new data.
 */
type UploadOutcome = { cardData: LoadedCardData; report: CoreSetUploadReport };

/** Tail of the serialization chain. Uploads run one at a time: two landing
 * together would each read `currentPacks`, await the file write, and then
 * have their setCardData() calls applied in completion order - leaving the
 * live deck and the persisted file disagreeing until the next restart.
 * Chaining keeps each upload's read-modify-write atomic. Settled (not
 * rejected) so a failed upload never poisons the chain for the next one. */
let uploadChain: Promise<unknown> = Promise.resolve();

export function uploadCoreSet(mode: "add" | "replace", rawPacks: UploadCoreSetPack[]): Promise<UploadOutcome> {
  const next = uploadChain.then(
    () => runUpload(mode, rawPacks),
    () => runUpload(mode, rawPacks)
  );
  uploadChain = next.catch(() => undefined);
  return next;
}

async function runUpload(mode: "add" | "replace", rawPacks: UploadCoreSetPack[]): Promise<UploadOutcome> {
  if (CARD_DATA_PATH_OVERRIDE) {
    throw new Error("CARD_DATA_PATH is set for this deployment — remove it to manage cards through the admin panel instead.");
  }

  const report: CoreSetUploadReport = {
    packsAdded: 0,
    totalPacks: 0,
    whiteAdded: 0,
    blackAdded: 0,
    cardsRepaired: 0,
    cardsDropped: 0,
  };

  const cleanedPacks: RawPack[] = [];
  for (const pack of rawPacks) {
    const name = typeof pack.name === "string" ? pack.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const { white, black, report: r } = validateAndRepairCards({ white: pack.white, black: pack.black });
    if (white.length === 0 && black.length === 0) continue;
    // Server-side safety net only - CoreSetPanel's section mapper already
    // resolves a category for every pack before this ever gets sent, so
    // this fallback (same one loader.ts uses) is for direct API use only.
    const category = resolveCategory(pack.category, undefined).slice(0, 60);
    cleanedPacks.push({ name, category, white, black });
    report.packsAdded++;
    report.whiteAdded += white.length;
    report.blackAdded += black.length;
    report.cardsRepaired += r.pickCorrected;
    report.cardsDropped += r.emptyDropped;
  }

  currentPacks = mode === "replace" ? cleanedPacks : [...currentPacks, ...cleanedPacks];
  source = "uploaded_core_set";
  report.totalPacks = currentPacks.length;

  await saveJsonFileAtomic(CORE_SET_PATH, currentPacks);
  log.info("cards", "core set updated", { mode, packsAdded: report.packsAdded, totalPacks: report.totalPacks });
  return { cardData: buildCardData(currentPacks), report };
}

type DeleteOutcome = { cardData: LoadedCardData; removedCount: number };

/**
 * Removes every pack whose (trimmed) name matches, keeping the rest -
 * "upload an extra category, then take back just that one" without having
 * to re-upload the whole Core Set in "replace" mode with it manually cut
 * out. Shares uploadChain with uploadCoreSet (not a separate chain) so a
 * delete landing mid-upload (or vice versa) still serializes correctly
 * against the same currentPacks/CORE_SET_PATH read-modify-write.
 *
 * Deletes by name, not by PackSummary.id - that id is array-index-derived
 * (see loader.ts's buildCardData) and reshuffles for every pack after the
 * one removed on the very next rebuild, so it's not a safe identifier to
 * hand back across a request/response round trip. Name isn't guaranteed
 * unique either, but it's the only field an admin actually recognizes a
 * pack by, and removing every same-named copy matches "delete this pack"
 * as a mental model better than silently picking one of several.
 */
export function deleteCoreSetPack(name: string): Promise<DeleteOutcome> {
  const next = uploadChain.then(
    () => runDelete(name),
    () => runDelete(name)
  );
  uploadChain = next.catch(() => undefined);
  return next;
}

async function runDelete(name: string): Promise<DeleteOutcome> {
  if (CARD_DATA_PATH_OVERRIDE) {
    throw new Error("CARD_DATA_PATH is set for this deployment — remove it to manage cards through the admin panel instead.");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("No pack name given.");

  const before = currentPacks.length;
  currentPacks = currentPacks.filter((p) => p.name.trim() !== trimmed);
  const removedCount = before - currentPacks.length;
  if (removedCount === 0) {
    throw new Error(`No pack named "${trimmed}" found in the Core Set.`);
  }
  // The result is no longer the pristine bundled sample even if that's
  // where it started - same reasoning as uploadCoreSet's own source flip.
  source = "uploaded_core_set";

  await saveJsonFileAtomic(CORE_SET_PATH, currentPacks);
  log.info("cards", "core set pack deleted", { name: trimmed, removedCount, totalPacks: currentPacks.length });
  return { cardData: buildCardData(currentPacks), removedCount };
}
