// The game's single connection to a Bar Games box (a venue server that
// hosts games, brands them and casts the Shared Screen to TVs).
//
// Off a box - no BG_CORE_URL / BG_GAME_TOKEN in the environment - every call
// here is a no-op and the game behaves exactly as it always has. The SDK
// guarantees that; anything box-only added here is also guarded by `onBox`.
//
// Kept to this one file on purpose: when @bargames/gamekit's RoomRegistry and
// wireBarGames replace RoomManager's bookkeeping, this is the file that
// changes (the RoomOverview fields and close causes already match the kit).

import { createBarGames, type CommandResult, type GameStatus } from "@bargames/sdk/server";
import { DEFAULT_GAME_NAME } from "@tabletop-judge/shared";
import type { IncomingMessage } from "node:http";
import { toErrorPayload } from "./rooms/errors.js";
import { VENUE_ACTOR_ID, type Room } from "./rooms/Room.js";
import type { RoomManager } from "./rooms/RoomManager.js";
import { log } from "./util/logger.js";

export const bg = createBarGames({
  gameId: "nofilter",
  defaultName: DEFAULT_GAME_NAME,
});

/** True when running on a box. Guards any box-only behaviour. */
export const onBox = bg.connected;

/** The real client IP: the gateway's on a box, cf-connecting-ip or the
 * socket address otherwise. (No Filter doesn't rate-limit by IP today - the
 * admin login throttle is deliberately global - so this is for logs.) */
export const clientIp = (req: IncomingMessage): string => bg.clientIp(req);

/** The name to show: the venue's rename on a box, otherwise the game's own
 * admin-set name, exactly as before. */
export async function displayName(fallback: string): Promise<string> {
  return onBox ? (await bg.venue()).game.displayName : fallback;
}

/** The URL a cast TV opens (bargames.json routes.table). */
export const tablePath = (code: string) => `/room/${encodeURIComponent(code)}?role=table&display=1`;

/** Runs a host action as the box would: as the venue, through the same Room
 * method the host's socket intent uses, so validation, timers and the
 * broadcast are identical. A RoomError becomes { ok: false, message }. */
function asVenue(room: Room | undefined, action: (room: Room) => void): CommandResult {
  if (!room) return { ok: false, message: "No room with that code." };
  try {
    action(room);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: toErrorPayload(err).message };
  }
}

/** Commands, status and lifecycle events. Call once the RoomManager exists. */
export function registerBarGames(rooms: RoomManager): void {
  if (onBox) {
    rooms.setEventSink({
      emit: (type, room, data) => bg.emit({ type, roomCode: room.code, sessionKind: room.kind, data }),
    });
  }

  bg.setStatusProvider((): GameStatus => ({ rooms: rooms.overviews() }));

  // "Put a game on the TVs -> New room": no host phone. Staff get the room's
  // host controls through hostUrl (a Table joining with the venue key).
  bg.onCreateRoom(({ title }) => {
    const { room, venueKey } = rooms.createVenueRoom(title);
    log.info("bargames", "venue room created", { code: room.code });
    return { roomCode: room.code, hostUrl: `${tablePath(room.code)}&key=${encodeURIComponent(venueKey)}` };
  });

  bg.onCommand("start", ({ roomCode }) =>
    asVenue(roomCode ? rooms.getRoom(roomCode) : undefined, (room) => room.startGame(VENUE_ACTOR_ID))
  );

  // Rounds advance on their own when the Judge picks, so "next" only means
  // something once a game is over: a fresh game, same players and settings.
  bg.onCommand("next_round", ({ roomCode }) =>
    asVenue(roomCode ? rooms.getRoom(roomCode) : undefined, (room) => {
      if (room.phase !== "gameEnd") {
        throw new Error("A game is still in progress - rounds move on when the Judge picks a winner.");
      }
      room.playAgain(VENUE_ACTOR_ID);
      room.startGame(VENUE_ACTOR_ID);
    })
  );

  bg.onCommand("end", ({ roomCode }) => {
    const room = roomCode ? rooms.getRoom(roomCode) : undefined;
    if (!room) return { ok: false, message: "No room with that code." };
    rooms.closeRoom(room.code, "The venue closed this room.", "admin");
    return { ok: true };
  });
}

/** Casting from inside the game (host only, box only). Off a box displays()
 * reports enabled: false and cast/stopCast refuse without any network call. */
export const casting = {
  displays: () => bg.displays(),
  cast: (code: string, ids: string[], pin?: string) => bg.cast(code, ids, { pin }),
  stop: (ids: string[], pin?: string) => bg.stopCast(ids, { pin }),
};
