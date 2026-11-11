import type { CustomSet } from "@tabletop-judge/shared";
import { socket } from "./socket.js";

export type { CustomSet };

// Custom Sets are a shared, global pool (see server/src/customSets/store.ts)
// - each set individually selectable per-room like a real pack, unlike the
// loose custom-cards pool's single useCustomCards toggle.

export function loadCustomSets(): Promise<CustomSet[]> {
  return new Promise((resolve) => socket.emit("listCustomSets", resolve));
}

export function createCustomSet(
  name: string,
  white?: { text: string }[],
  black?: { text: string; pick?: number }[]
): Promise<CustomSet[]> {
  return new Promise((resolve) => socket.emit("createCustomSet", { name, white, black }, resolve));
}

export function addCustomSetWhiteCard(setId: string, text: string): Promise<CustomSet[]> {
  return new Promise((resolve) => socket.emit("addCustomSetWhiteCard", { setId, text }, resolve));
}

export function addCustomSetBlackCard(setId: string, text: string, pick: number): Promise<CustomSet[]> {
  return new Promise((resolve) => socket.emit("addCustomSetBlackCard", { setId, text, pick }, resolve));
}

export function deleteCustomSetCard(setId: string, cardId: string): Promise<CustomSet[]> {
  return new Promise((resolve) => socket.emit("deleteCustomSetCard", { setId, cardId }, resolve));
}

export function deleteCustomSet(setId: string): Promise<CustomSet[]> {
  return new Promise((resolve) => socket.emit("deleteCustomSet", { setId }, resolve));
}
