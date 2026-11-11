import type { Server } from "socket.io";
import type { ClientToServerEvents, Role, ServerToClientEvents } from "@tabletop-judge/shared";
import { normalizeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, THEMES_REQUIRING_SPOTLIGHT } from "@tabletop-judge/shared";
import { RoomRegistry, type CloseCause, type RoomOverview, type SessionKind } from "@bargames/gamekit/server";
import { nanoid } from "nanoid";
import type { LoadedCardData } from "../cards/loader.js";
import type { DefaultTheme } from "../tableStyle/store.js";
import { getDefaultRoleNames } from "../roleNames/store.js";
import { ROOM_INACTIVITY_TTL_MS, ROOM_SWEEP_INTERVAL_MS } from "../config.js";
import { Room, type RoomGameEvent } from "./Room.js";
import { RoomError } from "./errors.js";
import { log } from "../util/logger.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export type { CloseCause };

/** In-game moments a Room reports (round_started, winner, ...). Room
 * lifecycle (created/closed/players_changed) comes from the registry's own
 * events instead - see `registry.on`. */
export type RoomGameEventListener = (type: Exclude<RoomGameEvent, "players_changed">, room: Room, data: Record<string, unknown>) => void;

const FATAL_REASON =
  "Something went wrong on our end and this game had to stop — sorry! This app is a work in progress. Start a new room to play again.";

/**
 * The game's view of its rooms. Bookkeeping - codes, the idle sweep, close
 * causes, lifecycle events, players_changed debouncing, status overviews -
 * is @bargames/gamekit's RoomRegistry; this adds what is No Filter's own:
 * seeding new rooms from the deployment defaults, seating the creator,
 * venue rooms' controller key, and the card data and theme new rooms get.
 */
export class RoomManager {
  readonly registry: RoomRegistry<Room>;
  private readonly io: IO;
  private cardData: LoadedCardData;
  private defaultTheme: DefaultTheme;
  private gameEventListener: RoomGameEventListener | null = null;

  constructor(io: IO, cardData: LoadedCardData, defaultTheme: DefaultTheme) {
    this.io = io;
    this.cardData = cardData;
    this.defaultTheme = defaultTheme;
    this.registry = new RoomRegistry<Room>({
      create: (code, kind, ctx) => {
        const room = new Room(code, this.io, this.cardData);
        room.kind = kind;
        this.applyDefaults(room);
        // Contain a broken room to itself: its players are told the game
        // ended and why; every other room carries on untouched.
        room.onFatalError = () => ctx.close(FATAL_REASON, "error");
        room.onGameEvent = (type, data) => {
          if (type === "players_changed") this.registry.notePlayers(room);
          else this.gameEventListener?.(type, room, data);
        };
        return room;
      },
      // No cap: this game never had one (a deployment is a handful of rooms).
      maxRooms: Number.POSITIVE_INFINITY,
      idleMinutes: () => ROOM_INACTIVITY_TTL_MS / 60_000,
      sweepIntervalMs: ROOM_SWEEP_INTERVAL_MS,
      idleReason: "Room closed after an hour of inactivity.",
      errorReason: FATAL_REASON,
      // Same codes as ever: 5 characters, digits and letters without 0/O/1/I.
      codeLength: ROOM_CODE_LENGTH,
      codeAlphabet: ROOM_CODE_ALPHABET,
      normalizeCode: normalizeRoomCode,
      // The join screen (name + role). The box's games list links here.
      joinPath: (room) => `/room/${room.code}`,
      log,
    });
  }

  /** Bar Games: where in-game moments (round_started, winner, ...) go. */
  onGameEvent(fn: RoomGameEventListener | null): void {
    this.gameEventListener = fn;
  }

  getCardData(): LoadedCardData {
    return this.cardData;
  }

  /** Swaps the card data used by every room created from now on (e.g. after
   * an admin uploads a new Core Set). A Room captures its own reference to
   * this at construction time, so rooms already in progress keep playing
   * with whatever they started with - an upload mid-session can't change
   * the deck out from under an active game. No restart required. */
  setCardData(cardData: LoadedCardData): void {
    this.cardData = cardData;
  }

  /** Changes the look every room created from now on starts with. Only
   * forward-looking: a room's tableStyle is its own from the moment it's
   * created (a host can change it from the Lobby). */
  setDefaultTheme(defaultTheme: DefaultTheme): void {
    this.defaultTheme = defaultTheme;
  }

  getRoom(code: string): Room | undefined {
    return this.registry.get(code);
  }

  /** Every open room, most recently active first (Bar Games status). */
  overviews(): RoomOverview[] {
    return this.registry.overviews();
  }

  createRoom(hostName: string, role: Role, socketId: string) {
    let seat!: ReturnType<Room["addOrReconnectPlayer"]>;
    // Seat the creator before room_created fires.
    const room = this.registry.create("patron", (r) => {
      seat = r.addOrReconnectPlayer(hostName, role, undefined, socketId);
    });
    return { room, player: seat.player, token: seat.token };
  }

  /**
   * Bar Games "create_room": a room with no host phone, for the venue's TVs.
   * Nobody becomes host by joining it; the box drives it with commands, and
   * staff get host authority from the returned key (see Room.venueKey). The
   * registry keeps it open while a Table shows it, until "end" closes it.
   */
  createVenueRoom(title?: string): { room: Room; venueKey: string } {
    const venueKey = nanoid(24);
    const kind: SessionKind = "venue";
    const room = this.registry.create(kind, (r) => {
      r.title = title?.trim().slice(0, 60) || undefined;
      r.venueKey = venueKey;
    });
    return { room, venueKey };
  }

  /** Seeds a brand-new room from the deployment defaults (role names, look).
   * Forward-looking only: a room already in progress keeps what it started
   * with. */
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

  joinRoom(
    rawCode: string,
    name: string,
    role: "player" | "table",
    token: string | undefined,
    socketId: string,
    venueKey?: string
  ) {
    const room = this.registry.get(rawCode);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No room with that code.");
    const { player, token: outToken } = room.addOrReconnectPlayer(name, role, token, socketId, venueKey);
    return { room, player, token: outToken };
  }

  listRoomSummaries() {
    return this.registry.all().map((room) => room.getAdminSummary());
  }

  /** The one way a room closes - host, admin, idle sweep, a room's own fatal
   * error, the box's "end" and shutdown all come through the registry's
   * closeRoom, which removes it from status and emits room_closed. */
  closeRoom(code: string, reason: string, cause: CloseCause = "admin"): boolean {
    return this.registry.closeRoom(code, reason, cause);
  }

  closeAllRooms(reason: string, cause: CloseCause = "admin"): number {
    const count = this.registry.size;
    this.registry.closeAll(reason, cause);
    return count;
  }
}
