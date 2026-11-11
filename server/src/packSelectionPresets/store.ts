import type { PackSelectionPreset } from "@tabletop-judge/shared";
import { PACK_SELECTION_PRESETS_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";

function isPresetArray(parsed: unknown): parsed is PackSelectionPreset[] {
  return Array.isArray(parsed);
}

let presets: PackSelectionPreset[] = [];
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  presets = (await loadJsonFile(PACK_SELECTION_PRESETS_PATH, isPresetArray)) ?? [];
  loaded = true;
}

async function persist(): Promise<void> {
  await saveJsonFileAtomic(PACK_SELECTION_PRESETS_PATH, presets);
}

export async function listPresets(): Promise<PackSelectionPreset[]> {
  await ensureLoaded();
  return presets;
}

export async function savePreset(preset: PackSelectionPreset): Promise<PackSelectionPreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== preset.name);
  presets.push(preset);
  await persist();
  return presets;
}

export async function deletePreset(name: string): Promise<PackSelectionPreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== name);
  await persist();
  return presets;
}
