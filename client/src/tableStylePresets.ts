import type { TableStylePreset } from "@tabletop-judge/shared";
import { socket } from "./socket.js";

export type { TableStylePreset };

// Presets are a shared design library stored server-side (see
// server/src/presets/store.ts) so the same list shows up whether you're on
// the host's phone, the Table, or the standalone Template Editor on any
// device - not scoped to whichever single browser happened to save it.

export function loadTableStylePresets(): Promise<TableStylePreset[]> {
  return new Promise((resolve) => socket.emit("listTableStylePresets", resolve));
}

export function saveTableStylePreset(preset: TableStylePreset): Promise<TableStylePreset[]> {
  return new Promise((resolve) => socket.emit("saveTableStylePreset", { preset }, resolve));
}

export function deleteTableStylePreset(name: string): Promise<TableStylePreset[]> {
  return new Promise((resolve) => socket.emit("deleteTableStylePreset", { name }, resolve));
}

/** Live updates from other devices saving/deleting while this one is open. Returns an unsubscribe function. */
export function onTableStylePresetsUpdated(handler: (presets: TableStylePreset[]) => void): () => void {
  socket.on("tableStylePresetsUpdated", handler);
  return () => socket.off("tableStylePresetsUpdated", handler);
}
