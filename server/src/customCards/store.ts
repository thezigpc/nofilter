import { nanoid } from "nanoid";
import type { CustomCardsData } from "@tabletop-judge/shared";
import { CUSTOM_CARDS_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";
import { resolvePick } from "../cards/validate.js";

function isCustomCardsData(parsed: unknown): parsed is CustomCardsData {
  const p = parsed as CustomCardsData | null;
  return !!p && Array.isArray(p.white) && Array.isArray(p.black);
}

let data: CustomCardsData = { white: [], black: [] };
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  data = (await loadJsonFile(CUSTOM_CARDS_PATH, isCustomCardsData)) ?? { white: [], black: [] };
  loaded = true;
}

async function persist(): Promise<void> {
  await saveJsonFileAtomic(CUSTOM_CARDS_PATH, data);
}

function cleanText(text: string): string {
  return text.trim().slice(0, 300);
}

/** Called once at server boot, alongside loadCardData - Room.ts's
 * buildDecks()/buildStateFor() are synchronous hot paths, so they read via
 * the cached getCustomCards() below rather than awaiting this repeatedly. */
export async function initCustomCards(): Promise<void> {
  await ensureLoaded();
}

export function getCustomCards(): CustomCardsData {
  return data;
}

export async function listCustomCards(): Promise<CustomCardsData> {
  await ensureLoaded();
  return data;
}

export async function addWhiteCard(text: string): Promise<CustomCardsData> {
  await ensureLoaded();
  const clean = cleanText(text);
  if (clean) {
    data.white.push({ id: nanoid(10), text: clean });
    await persist();
  }
  return data;
}

export async function addBlackCard(text: string, pick: number): Promise<CustomCardsData> {
  await ensureLoaded();
  const clean = cleanText(text);
  if (clean) {
    data.black.push({ id: nanoid(10), text: clean, pick: resolvePick(clean, pick) });
    await persist();
  }
  return data;
}

export async function deleteCard(id: string): Promise<CustomCardsData> {
  await ensureLoaded();
  data.white = data.white.filter((c) => c.id !== id);
  data.black = data.black.filter((c) => c.id !== id);
  await persist();
  return data;
}

/** Appends rather than replacing - accidentally wiping a host's existing
 * submitted cards on a bad upload would be a much worse failure mode than
 * ending up with a few duplicates. */
export async function mergeUploadedCards(upload: {
  white?: { text: string }[];
  black?: { text: string; pick?: number }[];
}): Promise<CustomCardsData> {
  await ensureLoaded();
  for (const w of upload.white ?? []) {
    const clean = cleanText(w.text ?? "");
    if (clean) data.white.push({ id: nanoid(10), text: clean });
  }
  for (const b of upload.black ?? []) {
    const clean = cleanText(b.text ?? "");
    if (clean) data.black.push({ id: nanoid(10), text: clean, pick: resolvePick(clean, b.pick) });
  }
  await persist();
  return data;
}
