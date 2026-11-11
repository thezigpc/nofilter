import type { PackSelectionPreset } from "@tabletop-judge/shared";
import { socket } from "./socket.js";

export type { PackSelectionPreset };

// Saved pack selections are a shared, global list (see server/src/
// packSelectionPresets/store.ts) - same "one list, any device" model as
// Table Style presets.

export function loadPackSelectionPresets(): Promise<PackSelectionPreset[]> {
  return new Promise((resolve) => socket.emit("listPackSelectionPresets", resolve));
}

export function savePackSelectionPreset(preset: PackSelectionPreset): Promise<PackSelectionPreset[]> {
  return new Promise((resolve) => socket.emit("savePackSelectionPreset", { preset }, resolve));
}

export function deletePackSelectionPreset(name: string): Promise<PackSelectionPreset[]> {
  return new Promise((resolve) => socket.emit("deletePackSelectionPreset", { name }, resolve));
}

/** Live updates from other devices saving/deleting while this one is open. Returns an unsubscribe function. */
export function onPackSelectionPresetsUpdated(handler: (presets: PackSelectionPreset[]) => void): () => void {
  socket.on("packSelectionPresetsUpdated", handler);
  return () => socket.off("packSelectionPresetsUpdated", handler);
}
