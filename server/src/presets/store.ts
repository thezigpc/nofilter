import type { TableStylePreset } from "@tabletop-judge/shared";
import { TABLE_STYLE_PRESETS_PATH } from "../config.js";
import { loadJsonFile, saveJsonFileAtomic } from "../util/jsonFileStore.js";

function isPresetArray(parsed: unknown): parsed is TableStylePreset[] {
  return Array.isArray(parsed);
}

let presets: TableStylePreset[] = [];
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  presets = (await loadJsonFile(TABLE_STYLE_PRESETS_PATH, isPresetArray)) ?? [];
  loaded = true;
}

async function persist(): Promise<void> {
  await saveJsonFileAtomic(TABLE_STYLE_PRESETS_PATH, presets);
}

export async function listPresets(): Promise<TableStylePreset[]> {
  await ensureLoaded();
  return presets;
}

export async function savePreset(preset: TableStylePreset): Promise<TableStylePreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== preset.name);
  presets.push(preset);
  await persist();
  return presets;
}

export async function deletePreset(name: string): Promise<TableStylePreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== name);
  await persist();
  return presets;
}
