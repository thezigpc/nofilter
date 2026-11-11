import type { GameSetupPreset } from "@tabletop-judge/shared";
import { hasLegacyKeys, migrateLegacyGameSetup } from "@tabletop-judge/shared";
import { log } from "../util/logger.js";
import { GAME_SETUP_PRESETS_PATH } from "../config.js";
import { store } from "../util/store.js";

function isPresetArray(parsed: unknown): parsed is GameSetupPreset[] {
  return Array.isArray(parsed);
}

let presets: GameSetupPreset[] = [];
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const raw = (await store.read(GAME_SETUP_PRESETS_PATH, isPresetArray)) ?? [];
  // Presets saved before the Judge/Wild Card rename carry the old keys
  // (randoCardrissian, randoCanScore, czar_accent). Map them forward and
  // rewrite the file once, so existing deployments need no hand-editing.
  presets = raw.map((p) => migrateLegacyGameSetup(p));
  loaded = true;
  if (raw.some((p) => hasLegacyKeys(p))) {
    await persist();
    log.info("presets", "migrated legacy game setup presets", { path: GAME_SETUP_PRESETS_PATH });
  }
}

async function persist(): Promise<void> {
  await store.write(GAME_SETUP_PRESETS_PATH, presets);
}

export async function listPresets(): Promise<GameSetupPreset[]> {
  await ensureLoaded();
  return presets;
}

/** Upserted by name, same as every other preset store here. */
export async function savePreset(preset: GameSetupPreset): Promise<GameSetupPreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== preset.name);
  presets.push(migrateLegacyGameSetup(preset));
  await persist();
  return presets;
}

export async function deletePreset(name: string): Promise<GameSetupPreset[]> {
  await ensureLoaded();
  presets = presets.filter((p) => p.name !== name);
  await persist();
  return presets;
}
