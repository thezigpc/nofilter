import type { Server } from "socket.io";
import type { ClientToServerEvents, Role, ServerToClientEvents } from "@tabletop-judge/shared";
import { generateRoomCode, normalizeRoomCode, THEMES_REQUIRING_SPOTLIGHT } from "@tabletop-judge/shared";
import type { LoadedCardData } from "../cards/loader.js";
import type { DefaultTheme } from "../tableStyle/store.js";
import { getDefaultRoleNames } from "../roleNames/store.js";
import { ROOM_INACTIVITY_TTL_MS, ROOM_SWEEP_INTERVAL_MS } from "../config.js";
import { Room } from "./Room.js";
import { RoomError } from "./errors.js";
import { log } from "../util/logger.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly io: IO;
  private cardData: LoadedCardData;
  private defaultTheme: DefaultTheme;

  constructor(io: IO, cardData: LoadedCardData, defaultTheme: DefaultTheme) {
    this.io = io;
    this.cardData = cardData;
    this.defaultTheme = defaultTheme;
    setInterval(() => this.sweepIdleRooms(), ROOM_SWEEP_INTERVAL_MS).unref();
  }

  getCardData(): LoadedCardData {
    return this.cardData;
  }

  /** Swaps the card data used by every room created from now on (e.g. after
   * an admin uploads a new Core Set). A Room captures its own reference to
   * this at construction time (see Room.ts's constructor), so rooms already
   * in progress keep playing with whatever they started with - deliberate,
   * so an upload mid-session can't change the deck out from under an active
   * game. No restart required either way. */
  setCardData(cardData: LoadedCardData): void {
    this.cardData = cardData;
  }

  /** Changes the theme/accent every room created from now on starts with.
   * Like setCardData, only forward-looking - a room's `tableStyle` is its
   * own mutable state from the moment it's created (a host can already
   * change it from the Lobby), so this only affects the choice new rooms
   * are seeded with, never rewrites an active room's current look. */
  setDefaultTheme(defaultTheme: DefaultTheme): void {
    this.defaultTheme = defaultTheme;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  createRoom(hostName: string, role: Role, socketId: string) {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new Room(code, this.io, this.cardData);
    // Forward-looking, like the theme below: a room already in progress
    // keeps whatever names it started with.
    room.roleNames = { ...getDefaultRoleNames() };
    room.tableStyle = {
      ...room.tableStyle,
      theme: this.defaultTheme.theme,
      accentIndex: this.defaultTheme.accentIndex,
      backgroundStyle: this.defaultTheme.backgroundStyle,
      backgroundAnimated: this.defaultTheme.backgroundAnimated,
      mobileBackgroundEnabled: this.defaultTheme.mobileBackgroundEnabled,
      facedownOpacity: this.defaultTheme.facedownOpacity,
      // Bypasses Room.updateTableStyle (this assigns tableStyle directly, on
      // a room with no players yet), so the same Parlour-forces-Spotlight
      // enforcement has to be repeated here rather than relying on that
      // method's copy of it.
      spotlightEnabled: room.tableStyle.spotlightEnabled || THEMES_REQUIRING_SPOTLIGHT.includes(this.defaultTheme.theme),
    };
    // Contain a broken room to itself: its players get told the game ended
    // and why, every other room in the process carries on untouched.
    room.onFatalError = () => {
      this.closeRoom(
        code,
        "Something went wrong on our end and this game had to stop — sorry! This app is a work in progress. Start a new room to play again."
      );
    };
    this.rooms.set(code, room);
    const { player, token } = room.addOrReconnectPlayer(hostName, role, undefined, socketId);
    return { room, player, token };
  }

  joinRoom(rawCode: string, name: string, role: "player" | "table", token: string | undefined, socketId: string) {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No room with that code.");
    const { player, token: outToken } = room.addOrReconnectPlayer(name, role, token, socketId);
    return { room, player, token: outToken };
  }

  /** Runs on an interval with nothing above it on the stack, so a throw
   * here would otherwise reach the process as an uncaughtException. One bad
   * room must not stop the others from being swept (or kill the server), so
   * each room is closed independently and failures are logged, not thrown. */
  private sweepIdleRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      try {
        if (now - room.lastActivityAt > ROOM_INACTIVITY_TTL_MS) {
          this.closeRoom(code, "Room closed after an hour of inactivity.");
        }
      } catch (err) {
        log.error("roomManager", "sweep failed - dropping room from the registry", { code, err: String(err) });
        this.rooms.delete(code);
      }
    }
  }

  // ---------- Host-machine-only admin operations (see server/src/admin) ----------

  listRoomSummaries() {
    return [...this.rooms.values()].map((room) => room.getAdminSummary());
  }

  closeRoom(code: string, reason: string): boolean {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) return false;
    log.info("room", "closed", { code: room.code, phase: room.phase, reason });
    room.closeRoom(reason);
    this.rooms.delete(room.code);
    return true;
  }

  closeAllRooms(reason: string): number {
    const codes = [...this.rooms.keys()];
    for (const code of codes) this.closeRoom(code, reason);
    return codes.length;
  }
}
