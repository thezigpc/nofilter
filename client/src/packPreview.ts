import type { PackContents } from "@tabletop-judge/shared";
import { socket } from "./socket.js";

// Pack contents come from the server's shared card-data singleton (see
// server/src/cards/loader.ts), not per-room state - fetched on demand
// since most packs are never previewed in a given room.
export function fetchPackPreview(packId: string): Promise<PackContents | null> {
  return new Promise((resolve) => socket.emit("previewPack", { packId }, resolve));
}
