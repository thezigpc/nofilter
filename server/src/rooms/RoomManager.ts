import type { Server } from "socket.io";
import type { ClientToServerEvents, Role, ServerToClientEvents } from "@tabletop-judge/shared";
import { generateRoomCode, normalizeRoomCode, THEMES_REQUIRING_SPOTLIGHT } from "@tabletop-judge/shared";
import type { LoadedCardData } from "../cards/loader.js";
import type { DefaultTheme } from "../tableStyle/store.js";
import { getDefaultRoleNames } from "../roleNames/store.js";
import { ROOM_INACTIVITY_TTL_MS, ROOM_SWEEP_INTERVAL_MS } from "../config.js";
import { Room, type RoomGameEvent, type RoomOverview } from "./Room.js";
import { nanoid } from "nanoid";
import { RoomError } from "./errors.js";
import { log } from "../util/logger.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/** Why a room closed - sent as room_closed's reason. Same values as
 * @bargames/gamekit's CloseCause, so the registry can replace this. */
export type CloseCause = "host" | "admin" | "idle" | "error" | "shutdown";

/** Where room lifecycle events go: a Bar Games box (server/src/bargames.ts),
 * or nowhere when standalone. Fire-and-forget; must never throw. */
export interface RoomEventSink {
  emit(type: RoomGameEvent | "room_created" | "room_closed", room: Room, data?: Record<string, unknown>): void;
}

/** players_changed at most this often per room (SDK guidance: 2 s). */
const PLAYERS_CHANGED_DEBOUNCE_MS = 2000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly io: IO;
  private cardData: LoadedCardData;
  private defaultTheme: DefaultTheme;
  private events: RoomEventSink | null = null;
  private playersChangedTimers = new Map<string, NodeJS.Timeout>();

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

  /** Connects room lifecycle events to a Bar Games box (see bargames.ts). */
  setEventSink(sink: RoomEventSink | null): void {
    this.events = sink;
  }

  private emit(type: Parameters<RoomEventSink["emit"]>[0], room: Room, data?: Record<string, unknown>): void {
    try {
      this.events?.emit(type, room, data);
    } catch (err) {
      log.warn("room", "event sink failed", { code: room.code, type, err: String(err) });
    }
  }

  /** Every open room, most recently active first (Bar Games status). */
  overviews(): RoomOverview[] {
    return [...this.rooms.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt).map((r) => r.toOverview());
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  createRoom(hostName: string, role: Role, socketId: string) {
    const room = this.newRoom(this.freshCode());
    this.applyDefaults(room);
    const { player, token } = room.addOrReconnectPlayer(hostName, role, undefined, socketId);
    this.register(room);
    return { room, player, token };
  }

  private freshCode(): string {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));
    return code;
  }

  private newRoom(code: string): Room {
    return new Room(code, this.io, this.cardData);
  }

  /** Seeds a brand-new room from the deployment defaults (role names, look).
   * Forward-looking only: a room already in progress keeps what it started
   * with. Shared by phone/Table rooms and Bar Games venue rooms. */
  private applyDefaults(room: Room): void {
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
  }

  private register(room: Room): void {
    // Contain a broken room to itself: its players get told the game ended
    // and why, every other room in the process carries on untouched.
    room.onFatalError = () => {
      this.closeRoom(
        room.code,
        "Something went wrong on our end and this game had to stop — sorry! This app is a work in progress. Start a new room to play again.",
        "error"
      );
    };
    room.onGameEvent = (type, data) => {
      if (type === "players_changed") this.schedulePlayersChanged(room);
      else this.emit(type, room, data);
    };
    this.rooms.set(room.code, room);
    this.emit("room_created", room, room.title ? { title: room.title } : undefined);
  }

  /** Coalesces join/leave/kick bursts into one players_changed per room. */
  private schedulePlayersChanged(room: Room): void {
    if (!this.events || this.playersChangedTimers.has(room.code)) return;
    const timer = setTimeout(() => {
      this.playersChangedTimers.delete(room.code);
      if (this.rooms.get(room.code) === room) this.emit("players_changed", room, { players: room.playerCount() });
    }, PLAYERS_CHANGED_DEBOUNCE_MS);
    timer.unref();
    this.playersChangedTimers.set(room.code, timer);
  }

  /**
   * Bar Games "create_room": a room with no host phone, for the venue's TVs.
   * Nobody becomes host by joining it; the box drives it with commands, and
   * staff get host authority from the returned key (see Room.venueKey). It
   * stays open while a Table shows it, until "end" closes it.
   */
  createVenueRoom(title?: string): { room: Room; venueKey: string } {
    const room = this.newRoom(this.freshCode());
    this.applyDefaults(room);
    room.kind = "venue";
    room.title = title?.trim().slice(0, 60) || undefined;
    room.venueKey = nanoid(24);
    this.register(room);
    return { room, venueKey: room.venueKey };
  }


  joinRoom(
    rawCode: string,
    name: string,
    role: "player" | "table",
    token: string | undefined,
    socketId: string,
    venueKey?: string
  ) {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No room with that code.");
    const { player, token: outToken } = room.addOrReconnectPlayer(name, role, token, socketId, venueKey);
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
        // A venue room on a TV is "in use" even when nobody's playing.
        if (room.kind === "venue" && room.tableCount() > 0) continue;
        if (now - room.lastActivityAt > ROOM_INACTIVITY_TTL_MS) {
          this.closeRoom(code, "Room closed after an hour of inactivity.", "idle");
        }
      } catch (err) {
        log.error("roomManager", "sweep failed - dropping room from the registry", { code, err: String(err) });
        this.rooms.delete(code);
        this.emit("room_closed", room, { reason: "error" });
      }
    }
  }

  // ---------- Host-machine-only admin operations (see server/src/admin) ----------

  listRoomSummaries() {
    return [...this.rooms.values()].map((room) => room.getAdminSummary());
  }

  /** The one way a room closes - host, admin, idle sweep, a room's own fatal
   * error, the box's "end" and shutdown all come through here, so this is
   * where room_closed is emitted and where the room leaves status. */
  closeRoom(code: string, reason: string, cause: CloseCause = "admin"): boolean {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) return false;
    log.info("room", "closed", { code: room.code, phase: room.phase, reason, cause });
    this.rooms.delete(room.code);
    clearTimeout(this.playersChangedTimers.get(room.code));
    this.playersChangedTimers.delete(room.code);
    try {
      room.closeRoom(reason);
    } finally {
      this.emit("room_closed", room, { reason: cause });
    }
    return true;
  }

  closeAllRooms(reason: string, cause: CloseCause = "admin"): number {
    const codes = [...this.rooms.keys()];
    for (const code of codes) this.closeRoom(code, reason, cause);
    return codes.length;
  }
}
