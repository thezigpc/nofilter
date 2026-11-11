import type { GameSetupPreset } from "@tabletop-judge/shared";
import { GAME_SETUP_PRESETS_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";

function isPresetArray(parsed: unknown): parsed is GameSetupPreset[] {
  return Array.isArray(parsed);
}

let presets: GameSetupPreset[] = [];
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  presets = (await loadJsonFile(GAME_SETUP_PRESETS_PATH, isPresetArray)) ?? [];
  loaded = true;
}

async function persist(): Promise<void> {
  await saveJsonFileAtomic(GAME_SETUP_PRESETS_PATH, presets);
}

export async function listPresets(): Promise<GameSetupPreset[]> {
  await ensureLoaded();
  return presets;
}

/** Upserted by name, same as every other preset store here. */
export async function savePreset(preset: GameSetupPreset): Promise<GameSetupPreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== preset.name);
  presets.push(preset);
  await persist();
  return presets;
}

export async function deletePreset(name: string): Promise<GameSetupPreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== name);
  await persist();
  return presets;
}
