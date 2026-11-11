import { DEFAULT_GAME_NAME } from "@tabletop-judge/shared";
import { GAME_NAME_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";

interface GameNameData {
  name: string;
}

function isGameNameData(parsed: unknown): parsed is GameNameData {
  const p = parsed as GameNameData | null;
  return !!p && typeof p.name === "string" && p.name.trim().length > 0;
}

let name: string = DEFAULT_GAME_NAME;
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const data = await loadJsonFile(GAME_NAME_PATH, isGameNameData);
  if (data) name = data.name;
  loaded = true;
}

/** Called once at server boot, alongside initCustomCards/initCustomSets -
 * GET /api/game-name and every socket connection read the cached
 * getGameName() below rather than awaiting this repeatedly. */
export async function initGameName(): Promise<void> {
  await ensureLoaded();
}

export function getGameName(): string {
  return name;
}

export async function setGameName(next: string): Promise<string> {
  await ensureLoaded();
  const clean = next.trim().slice(0, 60);
  if (clean) {
    name = clean;
    await saveJsonFileAtomic(GAME_NAME_PATH, { name });
  }
  return name;
}
