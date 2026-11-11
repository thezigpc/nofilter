import { nanoid } from "nanoid";
import type { CustomSet } from "@tabletop-judge/shared";
import { CUSTOM_SETS_PATH } from "../config.js";
import { store } from "../util/store.js";
import { resolvePick } from "../cards/validate.js";

function isCustomSetArray(parsed: unknown): parsed is CustomSet[] {
  return Array.isArray(parsed);
}

let sets: CustomSet[] = [];
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  sets = (await store.read(CUSTOM_SETS_PATH, isCustomSetArray)) ?? [];
  loaded = true;
}

async function persist(): Promise<void> {
  await store.write(CUSTOM_SETS_PATH, sets);
}

function cleanText(text: string): string {
  return text.trim().slice(0, 300);
}

function cleanName(name: string): string {
  return name.trim().slice(0, 80);
}

/** Called once at server boot, alongside loadCardData/initCustomCards -
 * Room.ts's buildDecks()/updatePackSelection()/buildStateFor() are
 * synchronous hot paths, so they read via the cached getCustomSets()
 * below rather than awaiting this repeatedly. */
export async function initCustomSets(): Promise<void> {
  await ensureLoaded();
}

export function getCustomSets(): CustomSet[] {
  return sets;
}

export async function listCustomSets(): Promise<CustomSet[]> {
  await ensureLoaded();
  return sets;
}

/** Always creates a fresh set with a new id, even if the name matches an
 * existing set - two sets can share a display name, distinguished
 * internally by id. The "cs_" id prefix guarantees no collision with
 * static pack ids (plain stringified array indices like "0".."426"). */
export async function createSet(
  name: string,
  white: { text: string }[] = [],
  black: { text: string; pick?: number }[] = []
): Promise<CustomSet[]> {
  await ensureLoaded();
  const cleanedName = cleanName(name);
  if (!cleanedName) return sets;
  const set: CustomSet = {
    id: `cs_${nanoid(10)}`,
    name: cleanedName,
    white: white.map((w) => ({ id: nanoid(10), text: cleanText(w.text ?? "") })).filter((w) => w.text),
    black: black
      .map((b) => {
        const text = cleanText(b.text ?? "");
        return { id: nanoid(10), text, pick: resolvePick(text, b.pick) };
      })
      .filter((b) => b.text),
  };
  sets.push(set);
  await persist();
  return sets;
}

export async function addWhiteCard(setId: string, text: string): Promise<CustomSet[]> {
  await ensureLoaded();
  const set = sets.find((s) => s.id === setId);
  const clean = cleanText(text);
  if (set && clean) {
    set.white.push({ id: nanoid(10), text: clean });
    await persist();
  }
  return sets;
}

export async function addBlackCard(setId: string, text: string, pick: number): Promise<CustomSet[]> {
  await ensureLoaded();
  const set = sets.find((s) => s.id === setId);
  const clean = cleanText(text);
  if (set && clean) {
    set.black.push({ id: nanoid(10), text: clean, pick: resolvePick(clean, pick) });
    await persist();
  }
  return sets;
}

export async function deleteCard(setId: string, cardId: string): Promise<CustomSet[]> {
  await ensureLoaded();
  const set = sets.find((s) => s.id === setId);
  if (set) {
    set.white = set.white.filter((c) => c.id !== cardId);
    set.black = set.black.filter((c) => c.id !== cardId);
    await persist();
  }
  return sets;
}

export async function deleteSet(setId: string): Promise<CustomSet[]> {
  await ensureLoaded();
  sets = sets.filter((s) => s.id !== setId);
  await persist();
  return sets;
}
