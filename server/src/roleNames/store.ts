import { DEFAULT_ROLE_NAMES, normalizeRoleNames, type RoleNames } from "@tabletop-judge/shared";
import { ROLE_NAMES_PATH } from "../config.js";
import { store } from "../util/store.js";

// The deployment-wide default for what the Judge and the Wild Card bot are
// called - same lazy-load/atomic-write shape as gameName/store.ts. A new
// room is seeded from this; a host can still rename either per room.

function isObject(parsed: unknown): parsed is Partial<RoleNames> {
  return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
}

let names: RoleNames = { ...DEFAULT_ROLE_NAMES };
let loaded = false;

export async function initRoleNames(): Promise<void> {
  if (loaded) return;
  const data = await store.read(ROLE_NAMES_PATH, isObject);
  if (data) names = normalizeRoleNames(data);
  loaded = true;
}

export function getDefaultRoleNames(): RoleNames {
  return names;
}

export async function setDefaultRoleNames(next: unknown): Promise<RoleNames> {
  await initRoleNames();
  names = normalizeRoleNames(next, DEFAULT_ROLE_NAMES);
  await store.write(ROLE_NAMES_PATH, names);
  return names;
}
