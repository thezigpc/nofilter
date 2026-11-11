// The game's single connection to a Bar Games box (a venue server that
// hosts games, brands them and casts the Shared Screen to TVs).
//
// Off a box - no BG_CORE_URL / BG_GAME_TOKEN in the environment - every call
// here is a no-op and the game behaves exactly as it always has. The SDK
// guarantees that; anything box-only added here is also guarded by `onBox`.
//
// Room lifecycle wiring (status, room_created/room_closed/players_changed,
// "end", create_room, error handling) is @bargames/gamekit's wireBarGames
// over RoomManager's registry; this file adds No Filter's own commands and
// its in-game events.

import { createBarGames } from "@bargames/sdk/server";
import { wireBarGames } from "@bargames/gamekit/bargames";
import { DEFAULT_GAME_NAME } from "@tabletop-judge/shared";
import type { IncomingMessage } from "node:http";
import { VENUE_ACTOR_ID } from "./rooms/Room.js";
import type { RoomManager } from "./rooms/RoomManager.js";
import { log } from "./util/logger.js";

export const bg = createBarGames({
  gameId: "nofilter",
  defaultName: DEFAULT_GAME_NAME,
});

/** True when running on a box. Guards any box-only behaviour. */
export const onBox = bg.connected;

/** The real client IP: the gateway's on a box, cf-connecting-ip or the
 * socket address otherwise. Used for the admin login's records; the login
 * throttle itself is deliberately global (see admin/auth.ts). */
export const clientIp = (req: IncomingMessage): string => bg.clientIp(req);

/** The name to show: the venue's rename on a box, otherwise the game's own
 * admin-set name, exactly as before. */
export async function displayName(fallback: string): Promise<string> {
  return onBox ? (await bg.venue()).game.displayName : fallback;
}

/** The URL a cast TV opens (bargames.json routes.table). */
export const tablePath = (code: string) => `/room/${encodeURIComponent(code)}?role=table&display=1`;

/** Commands, status and events. Call once the RoomManager exists. Every
 * command runs the same Room method the host's socket intent uses, as the
 * venue (a non-seat actor), so validation, timers and the broadcast are
 * identical; a refusal's RoomError message is what staff see. */
export function registerBarGames(rooms: RoomManager): void {
  rooms.onGameEvent((type, room, data) => bg.emit({ type, roomCode: room.code, sessionKind: room.kind, data }));

  wireBarGames(bg, rooms.registry, {
    // "Put a game on the TVs -> New room": no host phone. Staff get the
    // room's host controls through hostUrl (a Table joining with the key).
    createVenueRoom: ({ title }) => {
      const { room, venueKey } = rooms.createVenueRoom(title);
      log.info("bargames", "venue room created", { code: room.code });
      return { room, hostUrl: `${tablePath(room.code)}&key=${encodeURIComponent(venueKey)}` };
    },
    commands: {
      start: (room) => room.startGame(VENUE_ACTOR_ID),
      // Rounds advance on their own when the Judge picks, so "next" only
      // means something once a game is over: a fresh game, same players
      // and settings.
      next_round: (room) => {
        if (room.phase() !== "gameEnd") {
          throw new Error("A game is still in progress - rounds move on when the Judge picks a winner.");
        }
        room.playAgain(VENUE_ACTOR_ID);
        room.startGame(VENUE_ACTOR_ID);
      },
    },
    endReason: "The venue closed this room.",
  });
}

/** Casting from inside the game (host only, box only). Off a box displays()
 * reports enabled: false and cast/stopCast refuse without any network call. */
export const casting = {
  displays: () => bg.displays(),
  cast: (code: string, ids: string[], pin?: string) => bg.cast(code, ids, { pin }),
  stop: (ids: string[], pin?: string) => bg.stopCast(ids, { pin }),
};
