import { nanoid } from "nanoid";
import type { Server } from "socket.io";
import type {
  ActionCardDef,
  GameSetup,
  ActionCardTier,
  ActionCardTierWeights,
  BlackCard,
  ClientToServerEvents,
  CustomSet,
  DeckOptions,
  DoubleDownOffer,
  GameResult,
  HouseRules,
  JudgingCardSlot,
  PackSummary,
  Phase,
  PublicPlayer,
  Role,
  RoomStateForClient,
  RoundResult,
  ServerToClientEvents,
  TableStyle,
  WhiteCard,
  WinCondition,
  WinConditionMode,
} from "@tabletop-judge/shared";
import {
  ACTION_CARD_DEFS,
  ACTION_CARD_TIERS,
  DEFAULT_ACTION_CARD_TIER,
  MAX_ACTION_CARD_TIER_WEIGHT,
  MIN_ACTION_CARD_TIER_WEIGHT,
  resolveTiers,
  DEFAULT_ACTION_CARD_DENSITY,
  MIN_ACTION_CARD_DENSITY,
  MAX_ACTION_CARD_DENSITY,
  getActionCardDef,
  DEFAULT_BLACK_CARD_SCALE,
  DEFAULT_DECK_OPTIONS,
  DEFAULT_DOUBLE_DOWN_WINDOW_SECONDS,
  DEFAULT_HOUSE_RULES,
  DEFAULT_SCOREBOARD_SCALE,
  DEFAULT_SPOTLIGHT_SCALE,
  DEFAULT_TABLE_SCALE,
  DEFAULT_TABLE_STYLE,
  DEFAULT_WIN_CONDITION,
  MAX_BLACK_CARD_SCALE,
  MAX_DOUBLE_DOWN_WINDOW_SECONDS,
  MAX_HAND_SIZE,
  MAX_MAX_CARD_SIZE,
  MAX_SCOREBOARD_SCALE,
  MAX_SPOTLIGHT_SCALE,
  MAX_TABLE_SCALE,
  MIN_BLACK_CARD_SCALE,
  MIN_DOUBLE_DOWN_WINDOW_SECONDS,
  MIN_HAND_SIZE,
  DEFAULT_PERSONAL_CARDS_MAX_COUNT,
  DEFAULT_PERSONAL_CARDS_WINDOW_MINUTES,
  MAX_PERSONAL_CARDS_MAX_COUNT,
  MAX_PERSONAL_CARDS_WINDOW_MINUTES,
  MIN_MAX_CARD_SIZE,
  MIN_PERSONAL_CARDS_MAX_COUNT,
  MIN_PERSONAL_CARDS_WINDOW_MINUTES,
  PERSONAL_CARDS_GRACE_SECONDS,
  MIN_SCOREBOARD_SCALE,
  MIN_SPOTLIGHT_SCALE,
  MIN_TABLE_SCALE,
  minPlayersToContinue,
  minPlayersToStart,
  THEMES_REQUIRING_SPOTLIGHT,
  BACKGROUND_STYLES,
  MIN_FACEDOWN_OPACITY,
  MAX_FACEDOWN_OPACITY,
  DEFAULT_ROLE_NAMES,
  fillRoleNames,
  migrateLegacyGameSetup,
  migrateLegacyHouseRules,
  normalizeRoleNames,
  type RoleNames,
} from "@tabletop-judge/shared";
import type { LoadedCardData } from "../cards/loader.js";
import { isVulgar } from "../cards/vulgarFilter.js";
import { getCustomCards } from "../customCards/store.js";
import { getCustomSets } from "../customSets/store.js";
import { shuffle } from "../util/shuffle.js";
import { log } from "../util/logger.js";
import { RoomError } from "./errors.js";
import type { DoubleDownPendingOffer, ServerPlayer, SubmissionEntry } from "./types.js";
import { autoSubmitWildCard, createWildCardPlayer, dealToWildCard, WILD_CARD_PLAYER_ID } from "./houseRules/wildCard.js";
import { canOfferDoubleDown, isEligibleToWager } from "./houseRules/doubleDown.js";
import { ACTION_CARD_TIER_WEIGHTS, HAND_SIZE, HOST_CLAIM_AFTER_SECONDS, ROUND_END_DELAY_MS } from "../config.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/** Bar Games session kinds this game uses (see bargames.json). */
export type SessionKind = "venue" | "patron";

/** Lifecycle moments a Room reports through onGameEvent. room_created and
 * room_closed are RoomManager's, since only it sees every create and close. */
export type RoomGameEvent = "players_changed" | "round_started" | "round_ended" | "winner" | "game_over";

/** The id a Bar Games box command acts as - see Room.venueActor. Longer than
 * nanoid(8), so it can never collide with a real player id. */
export const VENUE_ACTOR_ID = "__venue__";

/** The room's host, or (venue rooms) a keyed controller screen. */
export function hasHostAuthority(player: ServerPlayer): boolean {
  return player.isHost || !!player.isVenueController;
}

/** One room as Bar Games' status (and its Rooms page) sees it. Field names
 * match @bargames/gamekit's RoomOverview so that registry can replace this. */
export interface RoomOverview {
  code: string;
  kind: SessionKind;
  players: number;
  phase: string;
  title?: string;
  hostConnected?: boolean;
  hostName?: string;
  tables: number;
  createdAt: string;
  lastActivityAt: string;
}

// Third-party packs in large card corpora frequently republish the same
// card text as official packs or as each other. Comparing trimmed/lowercased
// text (rather than card id) is what actually catches those duplicates.
function dedupeByText<T extends { text: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const card of cards) {
    const key = card.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

// Baking the "Custom Set: {name}" prefix in here means every existing
// client render site (pack rows, the preview modal header, search-by-name)
// already shows/matches it correctly with zero client-side special-casing.
// Exported for server/src/socket/index.ts's listAllPacks handler, which
// needs the exact same merge outside of any room context.
export function customSetToPackSummary(set: CustomSet): PackSummary {
  return {
    id: set.id,
    name: `Custom Set: ${set.name}`,
    // Not used for grouping - Custom Sets are always their own separate
    // section (isCustomSet), never mixed into category-based ones. Set
    // for type-completeness / debugging only.
    category: "Custom Sets",
    whiteCount: set.white.length,
    blackCount: set.black.length,
    isCustomSet: true,
  };
}

export class Room {
  readonly code: string;
  phase: Phase = "lobby";
  houseRules: HouseRules = { ...DEFAULT_HOUSE_RULES };
  winCondition: WinCondition = { ...DEFAULT_WIN_CONDITION };
  deckOptions: DeckOptions = { ...DEFAULT_DECK_OPTIONS };
  selectedPackIds: string[] = [];
  /** Only ever populated by applying a saved PackSelectionPreset (see
   * updateExcludedCards) - not a live, room-editable toggle. */
  excludedCardIds: Set<string> = new Set();
  handSize: number = HAND_SIZE;
  doubleDownWindowSeconds: number = DEFAULT_DOUBLE_DOWN_WINDOW_SECONDS;
  personalCardsWindowMinutes: number = DEFAULT_PERSONAL_CARDS_WINDOW_MINUTES;
  personalCardsMaxCount: number = DEFAULT_PERSONAL_CARDS_MAX_COUNT;
  actionCardDensity: number = DEFAULT_ACTION_CARD_DENSITY;
  /** Per-card frequency. Anything unset falls back to the default tier,
   * so a card added in a later release is automatically in play. */
  actionCardTiers: Record<string, ActionCardTier> = {};
  /** Room-level override of the server's tier weights (see config.ts). */
  actionCardTierWeights: ActionCardTierWeights = { ...ACTION_CARD_TIER_WEIGHTS };
  tableScale: number = DEFAULT_TABLE_SCALE;
  blackCardScale: number = DEFAULT_BLACK_CARD_SCALE;
  spotlightScale: number = DEFAULT_SPOTLIGHT_SCALE;
  scoreboardScale: number = DEFAULT_SCOREBOARD_SCALE;
  tableStyle: TableStyle = { ...DEFAULT_TABLE_STYLE };
  /** Player-visible names for the Judge and the Wild Card bot - see
   * shared/src/roleNames.ts. Seeded from the deployment default by
   * RoomManager.createRoom(), overridable by the host in the Lobby. */
  roleNames: RoleNames = { ...DEFAULT_ROLE_NAMES };

  private readonly io: IO;
  private readonly cardData: LoadedCardData;

  private players = new Map<string, ServerPlayer>();
  private judgeOrder: string[] = [];
  private judgeIndex = 0;

  private whiteDeck: WhiteCard[] = [];
  private whiteDiscard: WhiteCard[] = [];
  private blackDeck: BlackCard[] = [];
  private blackDiscard: BlackCard[] = [];

  private currentBlackCard: BlackCard | null = null;
  private submissions = new Map<string, SubmissionEntry>();
  /** Display order of this round's lineup slots — reshufflable until the first reveal. */
  private judgingOrder: string[] = [];
  /** submissionIds the Judge/Table has flipped face-up this round. */
  private revealedIds = new Set<string>();
  /** Server-synced so the spotlight opens/closes together on the Table and
   * the Judge's own phone, whichever one triggers it. */
  private spotlightId: string | null = null;
  private pendingDoubleDown = new Map<string, DoubleDownPendingOffer>();
  /** Crowd Favorite mode only: voterId -> submissionId, re-castable until the round resolves. */
  private votes = new Map<string, string>();
  /** Players who joined mid-round (after the current black card was dealt) — excused from
   * being required to submit this round only; cleared at the next dealPhase(). */
  private midGameExcused = new Set<string>();
  /** Epoch ms the current Double Down window closes, while one is running. */
  private doubleDownDeadline: number | null = null;
  /** Epoch ms the personalCards writing window closes, while one is running. */
  private personalCardsDeadline: number | null = null;
  /** Epoch ms the current round was dealt - lets clients show "waiting Xm" per un-submitted player. */
  private dealtAt: number = Date.now();

  private lastRoundResult: RoundResult | undefined;
  private roundHistory: RoundResult[] = [];
  /** Rounds decided this game. Kept separate from roundHistory.length,
   * which is capped at 100 and so cannot back a round-limit win
   * condition on a longer game. */
  private roundsPlayed = 0;
  private finalResult: GameResult | undefined;

  /** Card Block targets staged by playActionCard - become active (see
   * blockedFromDrawingIds) at the *next* dealPhase(), not the current
   * round. */
  private pendingCardBlockIds = new Set<string>();
  /** Card Block targets active for the round currently in progress - can't
   * draw at all (Auto Draw top-up or manual) until the following deal. */
  private blockedFromDrawingIds = new Set<string>();
  /** Set by a played "flavor"-shape Action Card - a judging-time
   * instruction for the Judge, cleared at finishRound(). */
  private pendingJudgingMessage: string | null = null;
  /** Set by the Democracy Action Card: this one round is decided by a vote
   * instead of the Judge. Reset every dealPhase(), so it never leaks into
   * the next round. */
  private democracyThisRound = false;

  private phaseTimer: NodeJS.Timeout | null = null;
  lastActivityAt = Date.now();
  readonly createdAt = Date.now();

  /** Bar Games session kind. "patron" for every room a phone or Table
   * creates (and every room standalone); "venue" only for rooms the box
   * creates with create_room - see RoomManager.createVenueRoom. */
  kind: SessionKind = "patron";
  title: string | undefined;
  /** Venue rooms only: the secret in the box's "host controls" link. A
   * Table joining with it becomes a venue controller (host authority, no
   * seat). Null for every other room, so the key path can't exist there. */
  venueKey: string | null = null;

  /** Set by RoomManager to report lifecycle moments to a Bar Games box
   * (a no-op standalone). Kept as a plain hook so Room has no SDK import. */
  onGameEvent: ((type: RoomGameEvent, data: Record<string, unknown>) => void) | null = null;
  private lastStartedRound = 0;

  private notify(type: RoomGameEvent, data: Record<string, unknown> = {}): void {
    try {
      this.onGameEvent?.(type, data);
    } catch (err) {
      log.warn("room", "game event hook failed", { code: this.code, type, err: String(err) });
    }
  }

  /** Set by RoomManager. Called when a phase timer throws - socket-driven
   * actions are already wrapped by withRoom (see server/src/socket), but a
   * timer callback runs on its own stack with nothing above it, so an
   * uncaught throw there would otherwise reach the process and kill every
   * room in the server, not just this one. */
  onFatalError: ((err: unknown) => void) | null = null;

  constructor(code: string, io: IO, cardData: LoadedCardData) {
    this.code = code;
    this.io = io;
    this.cardData = cardData;
  }

  // ---------- Player management ----------

  addOrReconnectPlayer(
    name: string,
    role: Role,
    token: string | undefined,
    socketId: string,
    venueKey?: string
  ): { player: ServerPlayer; token: string; reconnected: boolean } {
    if (token) {
      const existing = [...this.players.values()].find((p) => p.token === token);
      if (existing) {
        existing.connected = true;
        existing.socketId = socketId;
        existing.disconnectedAt = null;
        this.lastActivityAt = Date.now();
        // dealPhase()'s Auto Draw top-up only fills hands that are
        // connected at that exact moment - a player who dropped right
        // around deal time and reconnects moments later would otherwise be
        // stuck needing a manual draw despite Auto Draw being on. Only
        // relevant mid-Submission, and only if they haven't already
        // submitted (nothing to top up for otherwise).
        if (
          this.houseRules.autoDraw &&
          this.phase === "submission" &&
          existing.role === "player" &&
          !existing.isWildCard &&
          !this.hasNormalSubmission(existing.id)
        ) {
          while (existing.hand.length < this.handSize) {
            const card = this.drawWhiteCardFor(existing);
            if (!card) break;
            existing.hand.push(card);
          }
        }
        return { player: existing, token, reconnected: true };
      }
    }

    const id = nanoid(8);
    const newToken = nanoid(24);
    // Host is always a player, never the Table (CLAUDE.md: Table holds no
    // hand and never enters the rotation) — so a Table that creates a room
    // before anyone else joins must not claim host, and must not block the
    // first real player from claiming it afterward.
    //
    // Venue rooms (Bar Games) are the exception: nobody is promoted to host
    // just by arriving first - at a bar that would hand a random patron the
    // power to close the room or kick people. Host authority there comes
    // from the box's commands and a keyed controller screen instead.
    const isHost =
      this.kind !== "venue" && role === "player" && ![...this.players.values()].some((p) => p.role === "player");
    const isVenueController = role === "table" && !!this.venueKey && venueKey === this.venueKey;
    const player: ServerPlayer = {
      id,
      token: newToken,
      name: name.trim().slice(0, 32) || "Player",
      role,
      socketId,
      connected: true,
      isHost,
      ...(isVenueController ? { isVenueController: true } : {}),
      hand: [],
      score: 0,
      wonBlackCards: [],
      personalCards: [],
      personalDeck: [],
    };
    this.players.set(id, player);

    // Mid-game joins are allowed (the room code is the security boundary,
    // same trust model as everything else — CLAUDE.md). A joiner arriving
    // after Dealing gets an empty hand like anyone else (hands are always
    // manually drawn) and is excused from being *required* to submit for
    // whichever round is already underway — see maybeAdvanceToReveal.
    // personalCards is excluded here too - no round has happened yet, so
    // there's nothing to catch up on, and judgeOrder gets rebuilt fresh from
    // current players when that window closes anyway (see beginFirstRound).
    if (role === "player" && this.phase !== "lobby" && this.phase !== "gameEnd" && this.phase !== "personalCards") {
      this.judgeOrder.push(id);
      this.midGameExcused.add(id);
      if (this.houseRules.catchUpNewPlayers) {
        const others = [...this.players.values()].filter(
          (p) => p.role === "player" && !p.isWildCard && p.id !== id
        );
        if (others.length > 0) {
          const target = Math.min(...others.map((p) => p.wonBlackCards.length));
          for (let i = 0; i < target; i++) {
            const card = this.grantCatchUpBlackCard();
            if (!card) break;
            player.wonBlackCards.push(card);
          }
        }
      }
    }

    this.lastActivityAt = Date.now();
    if (role === "player") this.notify("players_changed");
    return { player, token: newToken, reconnected: false };
  }

  /** Pulls from the discard pile first (already-seen cards) so granting
   * catch-up currency doesn't shrink the pool of not-yet-seen prompts. */
  private grantCatchUpBlackCard(): BlackCard | null {
    if (this.blackDiscard.length > 0) return this.blackDiscard.pop()!;
    if (this.blackDeck.length > 0) return this.blackDeck.pop()!;
    return null;
  }

  markDisconnected(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();

    // Mirrors leaveRoom's host handoff, but only pre-game: a disconnected
    // host with nobody around to reach them shouldn't be able to
    // permanently strand a room before it even starts (this is exactly how
    // a Table-first room can get stuck if the first player to join, who
    // became host, drops before hitting Start). Mid-game disconnects
    // intentionally keep your seat and everything about it, host status
    // included — see CLAUDE.md on reconnect being first-class.
    if (this.phase === "lobby" && player.isHost) {
      const candidates = [...this.players.values()].filter(
        (p) => p.id !== playerId && p.role === "player" && !p.isWildCard
      );
      const next = candidates.find((p) => p.connected) ?? candidates[0];
      if (next) {
        player.isHost = false;
        next.isHost = true;
      }
    }

    this.broadcast();
  }

  /** The moment a disconnected host becomes claimable, or null if the
   * host is connected (or there isn't one). Mid-game disconnects normally
   * keep host status, which is right for a phone that locks for a minute -
   * but a dead battery would otherwise leave nobody able to end the game,
   * kick anyone, or hit Play Again at the finish. */
  hostClaimableSince(): number | null {
    const host = [...this.players.values()].find((p) => p.isHost);
    if (!host || host.connected || !host.disconnectedAt) return null;
    return host.disconnectedAt + HOST_CLAIM_AFTER_SECONDS * 1000;
  }

  /** Any connected real player can take over once the host has been gone
   * past the threshold. Deliberately a claim rather than an automatic
   * handoff: whoever is actually still at the table decides, and it can
   * never fire while the host is merely mid-reconnect. */
  claimHost(playerId: string): void {
    const claimant = this.players.get(playerId);
    if (!claimant) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    if (claimant.role !== "player" || claimant.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only a player can take over as host.");
    }
    if (claimant.isHost) return;
    if (this.kind === "venue") throw new RoomError("VENUE_ROOM", "This room is run by the venue - there's no host to take over.");

    const claimableAt = this.hostClaimableSince();
    if (claimableAt === null) throw new RoomError("HOST_PRESENT", "The host is still connected.");
    if (Date.now() < claimableAt) {
      const secondsLeft = Math.ceil((claimableAt - Date.now()) / 1000);
      throw new RoomError("HOST_NOT_GONE_YET", `The host has to be away a little longer - ${secondsLeft}s.`);
    }

    for (const other of this.players.values()) other.isHost = false;
    claimant.isHost = true;
    log.info("room", "host claimed after disconnect", { code: this.code, name: claimant.name });
    this.broadcast();
  }

  attachSocket(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (player) player.socketId = socketId;
  }

  destroy(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
  }

  /** Host-machine-only admin action (see server/src/admin) — not reachable from any client. */
  closeRoom(reason: string): void {
    for (const player of this.players.values()) {
      if (!player.connected || !player.socketId) continue;
      this.io.to(player.socketId).emit("kicked", { code: "ROOM_CLOSED", message: reason });
      this.io.sockets.sockets.get(player.socketId)?.leave(this.code);
    }
    this.destroy();
  }

  /** The card data this room captured when it was created. Deliberately
   * exposed: an admin uploading a new Core Set swaps RoomManager's copy,
   * but a room in progress keeps playing with what it started on - so
   * anything answering a question *about this room's packs* (e.g. the
   * preview modal) has to read this, not the manager's current copy.
   * Reading the wrong one silently returns another pack's cards entirely,
   * since pack ids are just array indices into whichever set is loaded. */
  getCardData(): LoadedCardData {
    return this.cardData;
  }

  /** Real players only - not Tables, not the Wild Card bot. */
  playerCount(): number {
    return [...this.players.values()].filter((p) => p.role === "player" && !p.isWildCard).length;
  }

  /** Shared Screens connected right now (cast TVs included). A venue room
   * isn't idle-closed while one is showing it. */
  tableCount(): number {
    return [...this.players.values()].filter((p) => p.role === "table" && p.connected).length;
  }

  toOverview(): RoomOverview {
    const host = [...this.players.values()].find((p) => p.isHost);
    const controllers = [...this.players.values()].filter((p) => p.isVenueController);
    return {
      code: this.code,
      kind: this.kind,
      players: this.playerCount(),
      phase: this.phase,
      ...(this.title ? { title: this.title } : {}),
      // A venue room has no player host; its "host" is the staff controller.
      hostConnected: host ? host.connected : controllers.some((c) => c.connected),
      ...(host ? { hostName: host.name } : {}),
      tables: this.tableCount(),
      createdAt: new Date(this.createdAt).toISOString(),
      lastActivityAt: new Date(this.lastActivityAt).toISOString(),
    };
  }

  getAdminSummary() {
    return {
      code: this.code,
      phase: this.phase,
      playerCount: this.players.size,
      connectedCount: [...this.players.values()].filter((p) => p.connected).length,
      lastActivityAt: this.lastActivityAt,
    };
  }

  // ---------- Leaving / kicking / host handoff ----------

  /** Voluntary self-leave. Lobby has always allowed this; mid-game now does
   * too - same discard/rotation handling as being kicked (their hand was
   * never seen by anyone, so it's fine to just re-absorb it into the
   * piles). If real (non-Wild Card) players drop below minPlayersToContinue(),
   * the game ends immediately on current standings, same as the host's End
   * Game button - there's no "too few players" state to limp along in. */
  leaveRoom(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    if (this.phase === "lobby") {
      this.removePlayerInternal(playerId);
      this.broadcast();
      return;
    }
    if (player.role !== "player") {
      throw new RoomError("CANT_LEAVE", "Only players can leave mid-game — the Shared Screen isn't in the rotation.");
    }

    const wasJudge = playerId === this.currentJudgeId();
    this.removePlayerInternal(playerId);

    const realPlayers = [...this.players.values()].filter((p) => p.role === "player" && !p.isWildCard);
    if (realPlayers.length < minPlayersToContinue(this.houseRules)) {
      this.endGameNow();
      return;
    }

    if (wasJudge && (this.phase === "submission" || this.phase === "reveal" || this.phase === "judging")) {
      this.clearTimer();
      this.dealPhase();
    } else if (this.phase === "submission") {
      this.maybeAdvanceToReveal();
    }
    this.broadcast();
  }

  kickPlayer(actingId: string, targetId: string): void {
    const actor = this.requireHost(actingId);
    if (targetId === actor.id) throw new RoomError("CANT_KICK_SELF", "You can't kick yourself.");
    const target = this.players.get(targetId);
    if (!target) throw new RoomError("NOT_IN_ROOM", "That player isn't in this room.");
    if (target.isWildCard) throw new RoomError("CANT_KICK_WILD_CARD", `${this.roleNames.wildCard} isn't a real player — turn off the house rule instead.`);

    const wasJudge = targetId === this.currentJudgeId();
    const removedSocketId = target.socketId;
    this.removePlayerInternal(targetId);

    if (removedSocketId) {
      this.io.to(removedSocketId).emit("kicked", { code: "KICKED", message: "You were removed from the room by the host." });
      this.io.sockets.sockets.get(removedSocketId)?.leave(this.code);
    }

    if (wasJudge && (this.phase === "submission" || this.phase === "reveal" || this.phase === "judging")) {
      this.clearTimer();
      if (this.judgeOrder.length < 2) {
        this.resetToLobby();
      } else {
        this.dealPhase();
      }
    } else if (this.phase === "submission") {
      this.maybeAdvanceToReveal();
    }

    this.broadcast();
  }

  transferHost(actingId: string, targetId: string): void {
    const actor = this.requireHost(actingId);
    const target = this.players.get(targetId);
    if (!target) throw new RoomError("NOT_IN_ROOM", "That player isn't in this room.");
    if (target.isWildCard) throw new RoomError("CANT_HOST_WILD_CARD", `${this.roleNames.wildCard} can't be host.`);
    if (target.role === "table") {
      throw new RoomError("CANT_HOST_TABLE", "The Shared Screen can't be host — it doesn't hold cards or take a turn.");
    }
    if (target.id === actor.id) return;
    if (this.kind === "venue") throw new RoomError("VENUE_ROOM", "This room is run by the venue - it doesn't have a player host.");
    actor.isHost = false;
    target.isHost = true;
    this.broadcast();
  }

  private removePlayerInternal(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.discardWhite(player.hand);
    this.blackDiscard.push(...player.wonBlackCards);
    for (const [subId, entry] of [...this.submissions.entries()]) {
      if (entry.playerId === playerId) this.submissions.delete(subId);
    }
    this.pendingDoubleDown.delete(playerId);

    const judgeIdx = this.judgeOrder.indexOf(playerId);
    if (judgeIdx !== -1) {
      this.judgeOrder.splice(judgeIdx, 1);
      // Strictly less-than: removing someone *before* the current Judge
      // shifts the array left under them, so the pointer needs to shift
      // down by one to keep tracking the same person. But removing the
      // *current* Judge themselves (judgeIdx === judgeIndex) needs no
      // decrement at all - splice already slides the next player into
      // that same slot. Using <= here decremented anyway, landing the
      // pointer one slot backward onto whoever was Judge the round before -
      // a real repeat/skip bug in the rotation whenever the current Judge
      // was kicked or left mid-round.
      if (judgeIdx < this.judgeIndex && this.judgeIndex > 0) {
        this.judgeIndex -= 1;
      }
      this.judgeIndex = this.judgeOrder.length > 0 ? this.judgeIndex % this.judgeOrder.length : 0;
    }

    const wasHost = player.isHost;
    this.players.delete(playerId);
    if (player.role === "player" && !player.isWildCard) this.notify("players_changed");

    if (wasHost) {
      const candidates = [...this.players.values()].filter((p) => !p.isWildCard);
      const next = candidates.find((p) => p.connected) ?? candidates[0];
      if (next) next.isHost = true;
    }
  }

  // ---------- Lobby configuration ----------

  requireHost(playerId: string): ServerPlayer {
    if (playerId === VENUE_ACTOR_ID) return this.venueActor;
    const player = this.players.get(playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    if (!hasHostAuthority(player)) throw new RoomError("NOT_HOST", "Only the host can do that.");
    return player;
  }

  /** Who a Bar Games box command acts as: the room's host, without being a
   * seat. Never in `players`, so it has no hand, no Judge turn and no
   * scoreboard line, and no socket can ever claim its id (socket player ids
   * come from the server's own join). */
  private readonly venueActor: ServerPlayer = {
    id: VENUE_ACTOR_ID,
    token: "",
    name: "Venue",
    role: "table",
    socketId: null,
    connected: true,
    isHost: true,
    hand: [],
    score: 0,
    wonBlackCards: [],
    personalCards: [],
    personalDeck: [],
  };

  /** Game-options settings (packs/house rules/table style) are shared authority
   * between the host and the Table — an operator standing at the shared screen
   * shouldn't need a phone. Room-management/identity actions (start/kick/
   * transfer) stay host-only, see requireHost. */
  /** Public for the same reason requireHost is: the socket layer needs to
   * authorise an action whose side effects live outside the Room (saving a
   * preset to the shared on-disk store). */
  requireLobbyAuthority(playerId: string): ServerPlayer {
    if (playerId === VENUE_ACTOR_ID) return this.venueActor;
    const player = this.players.get(playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    // Venue rooms: a Table is usually a cast TV - or a patron who opened
    // ?role=table themselves - so only the keyed controller gets settings.
    if (this.kind === "venue" && !hasHostAuthority(player)) {
      throw new RoomError("NOT_HOST", "This room is run by the venue - ask staff to change its settings.");
    }
    if (!hasHostAuthority(player) && player.role !== "table") {
      throw new RoomError("NOT_HOST", "Only the host or the Shared Screen can do that.");
    }
    return player;
  }

  updatePackSelection(playerId: string, packIds: string[]): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    const validIds = new Set(this.cardData.packs.map((p) => p.id));
    for (const set of getCustomSets()) validIds.add(set.id);
    this.selectedPackIds = packIds.filter((id) => validIds.has(id));
    this.broadcast();
  }

  /** Bulk-replace, same shape as updatePackSelection - only ever called by
   * applying a saved PackSelectionPreset (see Lobby.tsx), never edited live
   * in the room itself. */
  updateExcludedCards(playerId: string, cardIds: string[]): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    this.excludedCardIds = new Set(cardIds);
    this.broadcast();
  }

  updateHouseRules(playerId: string, rules: Partial<HouseRules>): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    this.houseRules = { ...this.houseRules, ...migrateLegacyHouseRules(rules) };
    this.broadcast();
  }

  /** Renames the Judge and/or the Wild Card bot for this room. Lobby-only,
   * like the house rules it sits beside. The bot is only seated at game
   * start, but Play Again returns here with it still seated, so it is
   * renamed in place too. */
  updateRoleNames(playerId: string, names: Partial<RoleNames>): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    this.roleNames = normalizeRoleNames({ ...this.roleNames, ...names }, this.roleNames);
    const bot = this.players.get(WILD_CARD_PLAYER_ID);
    if (bot) bot.name = this.roleNames.wildCard;
    this.broadcast();
  }

  // Host-only (not Table) and allowed in any phase, unlike the other Lobby
  // settings above — the win target is the one thing a host may want to
  // raise on the fly mid-game to keep a fun round going, not just at setup.
  updateWinCondition(playerId: string, target: number, mode?: WinConditionMode): void {
    this.requireHost(playerId);
    if (!Number.isFinite(target) || target < 1) {
      throw new RoomError("INVALID_TARGET", "Win target must be a positive number.");
    }
    this.winCondition = {
      // Omitting the mode only changes the number - the Lobby's number
      // input and its mode buttons are separate controls.
      mode: mode ?? this.winCondition.mode,
      target: Math.floor(target),
    };
    this.broadcast();
  }

  updateDeckOptions(playerId: string, options: Partial<DeckOptions>): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    const next: DeckOptions = { ...this.deckOptions, ...options };
    // Mutually exclusive - whichever one this call is turning on wins.
    if (options.excludeVulgar) next.vulgarOnly = false;
    if (options.vulgarOnly) next.excludeVulgar = false;
    this.deckOptions = next;
    this.broadcast();
  }

  updateHandSize(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    if (!Number.isFinite(value)) throw new RoomError("INVALID_HAND_SIZE", "Hand size must be a number.");
    this.handSize = Math.min(MAX_HAND_SIZE, Math.max(MIN_HAND_SIZE, Math.floor(value)));
    this.broadcast();
  }

  updateDoubleDownWindow(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    if (!Number.isFinite(value)) throw new RoomError("INVALID_WINDOW", "Double Down window must be a number.");
    this.doubleDownWindowSeconds = Math.min(
      MAX_DOUBLE_DOWN_WINDOW_SECONDS,
      Math.max(MIN_DOUBLE_DOWN_WINDOW_SECONDS, Math.round(value))
    );
    this.broadcast();
  }

  updatePersonalCardsSettings(playerId: string, settings: { windowMinutes?: number; maxCount?: number }): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    if (settings.windowMinutes !== undefined) {
      if (!Number.isFinite(settings.windowMinutes)) {
        throw new RoomError("INVALID_WINDOW", "Personal Cards window must be a number.");
      }
      this.personalCardsWindowMinutes = Math.min(
        MAX_PERSONAL_CARDS_WINDOW_MINUTES,
        Math.max(MIN_PERSONAL_CARDS_WINDOW_MINUTES, Math.round(settings.windowMinutes))
      );
    }
    if (settings.maxCount !== undefined) {
      if (!Number.isFinite(settings.maxCount)) {
        throw new RoomError("INVALID_MAX_COUNT", "Personal Cards max count must be a number.");
      }
      this.personalCardsMaxCount = Math.min(
        MAX_PERSONAL_CARDS_MAX_COUNT,
        Math.max(MIN_PERSONAL_CARDS_MAX_COUNT, Math.round(settings.maxCount))
      );
    }
    this.broadcast();
  }

  setActionCardDensity(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    if (!Number.isFinite(value)) throw new RoomError("INVALID_DENSITY", "Action Card density must be a number.");
    this.actionCardDensity = Math.min(MAX_ACTION_CARD_DENSITY, Math.max(MIN_ACTION_CARD_DENSITY, Math.round(value)));
    this.broadcast();
  }

  /**
   * Applies a whole saved/built-in configuration in one go.
   *
   * Every field is optional and only applied when present, so a setup can
   * deliberately say nothing about (say) hand size and leave whatever the
   * room already had. Pack selection is never touched - that has its own
   * preset system, and having two mechanisms fight over the same setting
   * would be worse than each doing less.
   */
  applyGameSetup(playerId: string, rawSetup: GameSetup): void {
    // A preset saved before the Judge/Wild Card rename still says
    // randoCardrissian / czar_accent - map it forward rather than silently
    // dropping those settings.
    const setup = migrateLegacyGameSetup(rawSetup);
    this.requireLobbyAuthority(playerId);
    this.requireLobby();

    if (setup.houseRules) {
      // Reuse updateHouseRules' own validation rather than assigning
      // straight through - it enforces the rules that can't coexist.
      this.updateHouseRules(playerId, setup.houseRules);
    }
    if (setup.winCondition) {
      this.updateWinCondition(playerId, setup.winCondition.target, setup.winCondition.mode);
    }
    if (setup.handSize !== undefined) {
      this.updateHandSize(playerId, setup.handSize);
    }
    if (setup.deckOptions) {
      this.updateDeckOptions(playerId, setup.deckOptions);
    }
    if (setup.actionCardDensity !== undefined) {
      this.setActionCardDensity(playerId, setup.actionCardDensity);
    }
    if (setup.actionCardTiers) {
      for (const [cardId, tier] of Object.entries(setup.actionCardTiers)) {
        if (getActionCardDef(cardId)) this.actionCardTiers[cardId] = tier;
      }
    }
    log.info("room", "game setup applied", { code: this.code });
    this.broadcast();
  }

  /** The room's current configuration, for saving as a preset. */
  currentGameSetup(): GameSetup {
    return {
      houseRules: { ...this.houseRules },
      winCondition: { ...this.winCondition },
      handSize: this.handSize,
      deckOptions: { ...this.deckOptions },
      actionCardDensity: this.actionCardDensity,
      actionCardTiers: resolveTiers(this.actionCardTiers),
    };
  }

  setActionCardTier(playerId: string, cardId: string, tier: ActionCardTier): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    if (!ACTION_CARD_TIERS.includes(tier)) throw new RoomError("INVALID_TIER", "Not a valid Action Card tier.");
    if (!getActionCardDef(cardId)) throw new RoomError("BAD_CARD", "No Action Card with that id.");
    this.actionCardTiers[cardId] = tier;
    this.broadcast();
  }

  setActionCardTierWeights(playerId: string, weights: Partial<ActionCardTierWeights>): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    const clamp = (n: number) => Math.min(MAX_ACTION_CARD_TIER_WEIGHT, Math.max(MIN_ACTION_CARD_TIER_WEIGHT, n));
    for (const key of ["rare", "normal", "common"] as const) {
      const value = weights[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value)) throw new RoomError("INVALID_WEIGHT", "Tier weights must be numbers.");
      this.actionCardTierWeights[key] = clamp(value);
    }
    this.broadcast();
  }

  updateTableStyle(playerId: string, style: Partial<TableStyle>): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    const next: TableStyle = { ...this.tableStyle, ...style };
    if (style.maxCardSize !== undefined && style.maxCardSize !== null) {
      if (!Number.isFinite(style.maxCardSize)) {
        throw new RoomError("INVALID_MAX_CARD_SIZE", "Max card size must be a number.");
      }
      next.maxCardSize = Math.round(Math.min(MAX_MAX_CARD_SIZE, Math.max(MIN_MAX_CARD_SIZE, style.maxCardSize)));
    }
    if (style.layout !== undefined && style.layout !== "dense" && style.layout !== "strip") {
      throw new RoomError("INVALID_LAYOUT", "Unknown Shared Screen layout.");
    }
    if (style.backgroundStyle !== undefined && !BACKGROUND_STYLES.includes(style.backgroundStyle)) {
      throw new RoomError("INVALID_BACKGROUND_STYLE", "Unknown background style.");
    }
    if (style.facedownOpacity !== undefined) {
      if (!Number.isFinite(style.facedownOpacity)) {
        throw new RoomError("INVALID_FACEDOWN_OPACITY", "Face-down opacity must be a number.");
      }
      next.facedownOpacity = Math.round(
        Math.min(MAX_FACEDOWN_OPACITY, Math.max(MIN_FACEDOWN_OPACITY, style.facedownOpacity))
      );
    }
    // A fanned/overlapping theme like Parlour only reads as intended through
    // Spotlight - the ambient grid hides each card's covered edge. Force it
    // on (and don't let it be turned off) rather than leaving that up to the
    // client to remember, so the room can't land on a config where the only
    // view is unreadable.
    if (THEMES_REQUIRING_SPOTLIGHT.includes(next.theme)) {
      next.spotlightEnabled = true;
    }
    this.tableStyle = next;
    this.broadcast();
  }

  setTableScale(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    this.requireLobby();
    const clamped = Math.min(MAX_TABLE_SCALE, Math.max(MIN_TABLE_SCALE, value));
    this.tableScale = Math.round(clamped * 100) / 100;
    this.broadcast();
  }

  // Independent of tableScale and, unlike it, usable in any phase - the
  // point is being able to blow the prompt up big and readable during the
  // "waiting for everyone to submit" lull without resizing anything else.
  setBlackCardScale(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    const clamped = Math.min(MAX_BLACK_CARD_SCALE, Math.max(MIN_BLACK_CARD_SCALE, value));
    this.blackCardScale = Math.round(clamped * 100) / 100;
    this.broadcast();
  }

  // Same "any phase" model as blackCardScale - the spotlight overlay only
  // ever appears during Reveal/Judging, so being locked to Lobby-only would
  // make it impossible to tune while actually looking at it.
  setSpotlightScale(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    const clamped = Math.min(MAX_SPOTLIGHT_SCALE, Math.max(MIN_SPOTLIGHT_SCALE, value));
    this.spotlightScale = Math.round(clamped * 100) / 100;
    this.broadcast();
  }

  setScoreboardScale(playerId: string, value: number): void {
    this.requireLobbyAuthority(playerId);
    const clamped = Math.min(MAX_SCOREBOARD_SCALE, Math.max(MIN_SCOREBOARD_SCALE, value));
    this.scoreboardScale = Math.round(clamped * 100) / 100;
    this.broadcast();
  }

  private requireLobby(): void {
    if (this.phase !== "lobby") {
      throw new RoomError("GAME_IN_PROGRESS", "Can't change settings once the game has started.");
    }
  }

  // ---------- Game lifecycle ----------

  startGame(playerId: string): void {
    this.requireHost(playerId);
    this.requireLobby();

    if (this.selectedPackIds.length === 0 && !this.deckOptions.useCustomCards) {
      throw new RoomError("NO_PACKS", "Pick at least one pack (or enable custom cards) before starting.");
    }

    const realPlayers = [...this.players.values()].filter((p) => p.role === "player" && !p.isWildCard);
    const minPlayers = minPlayersToStart(this.houseRules);
    if (realPlayers.length < minPlayers) {
      throw new RoomError(
        "NOT_ENOUGH_PLAYERS",
        `Need at least ${minPlayers} players to start (currently ${realPlayers.length}).`
      );
    }

    this.buildDecks();

    // Deck sizes and the active rule set are the two things worth capturing
    // at start: almost every "the game did something weird" question later
    // comes down to which rules were on and how big the deck actually was
    // after filtering.
    log.info("game", "started", {
      code: this.code,
      players: realPlayers.length,
      white: this.whiteDeck.length,
      black: this.blackDeck.length,
      handSize: this.handSize,
      target: this.winCondition.target,
      rules: Object.entries(this.houseRules)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(",") || "none",
    });

    if (this.houseRules.wildCard) {
      const wildCard = createWildCardPlayer(this.roleNames.wildCard);
      this.players.set(wildCard.id, wildCard);
    } else {
      this.players.delete(WILD_CARD_PLAYER_ID);
    }

    for (const player of realPlayers) {
      player.usedHandRefresh = false;
    }
    this.roundHistory = [];
    this.roundsPlayed = 0;

    if (this.houseRules.personalCards) {
      this.phase = "personalCards";
      this.clearTimer();
      const ms = this.personalCardsWindowMinutes * 60_000;
      this.personalCardsDeadline = Date.now() + ms;
      this.phaseTimer = this.safeTimeout("personalCardsWindow", ms, () => this.beginFirstRound());
      this.broadcast();
    } else {
      this.beginFirstRound();
    }
  }

  /** Shuffles the Judge rotation and deals the first round - either called
   * directly from startGame() (Personal Cards off) or once the writing
   * window's timer fires (see startGame()). judgeOrder is built fresh from
   * *current* players, not the realPlayers snapshot from startGame(), so
   * anyone who joined mid-window is automatically included. */
  private beginFirstRound(): void {
    this.personalCardsDeadline = null;
    for (const player of this.players.values()) {
      if (player.role !== "player" || player.isWildCard) continue;
      player.personalDeck = shuffle(player.personalCards);
    }
    const realPlayers = [...this.players.values()].filter((p) => p.role === "player" && !p.isWildCard);
    this.judgeOrder = shuffle(realPlayers.map((p) => p.id));
    this.judgeIndex = 0;
    this.dealPhase();
  }

  /** Host-only, ends the game right now regardless of anyone's score —
   * current standings decide the winner, same final-scores screen as a
   * normal win. */
  endGame(playerId: string): void {
    this.requireHost(playerId);
    if (this.phase === "lobby" || this.phase === "gameEnd") {
      throw new RoomError("WRONG_PHASE", "No game in progress to end.");
    }
    this.endGameNow();
  }

  /** Shared by the host's End Game button and a voluntary leave that drops
   * below minPlayersToContinue() - ends right now regardless of anyone's
   * score, current standings decide the winner. */
  private endGameNow(): void {
    this.clearTimer();
    this.finalResult = this.buildFinalResult();
    this.phase = "gameEnd";
    this.broadcast();
  }

  /** Host-only, gameEnd only — wipes scores/hands/won black cards for a
   * fresh game with the same players and settings, and drops back to the
   * Lobby so the host can tweak anything before hitting Start Game again
   * (which already rebuilds the deck and reshuffles the Judge order). */
  playAgain(playerId: string): void {
    this.requireHost(playerId);
    if (this.phase !== "gameEnd") throw new RoomError("WRONG_PHASE", "Can only start a new game once one has ended.");
    this.resetToLobby();
    this.broadcast();
  }

  /** Shared by playAgain and kickPlayer's "kicking the Judge dropped the
   * rotation below 2" path - a full reset back to a clean Lobby (scores,
   * hands, discard piles, Wild Card's own player entry, Judge rotation), not
   * just a phase flip. Without this, that kick path left stale state
   * lingering - most importantly Wild Card's player entry, which
   * startGame()'s realPlayers filter didn't exclude either, so a later
   * Start Game could shuffle that stale Wild Card entry into the Judge
   * rotation. Wild Card has no client to actually drive a round if picked, so
   * this effectively handed judge control to the Shared Screen instead
   * (see requireJudgeAuthority's Table-mirrors-Judge trust) - the bug
   * behind "someone other than the human players became the Judge". */
  private resetToLobby(): void {
    for (const player of this.players.values()) {
      if (player.isWildCard) continue;
      this.discardWhite(player.hand);
      player.hand = [];
      this.blackDiscard.push(...player.wonBlackCards);
      player.wonBlackCards = [];
      player.score = 0;
      player.usedHandRefresh = false;
      // Personal cards are per-game - Play Again starts everyone with a
      // clean slate for a fresh writing window, not last game's leftovers.
      player.personalCards = [];
      player.personalDeck = [];
    }
    this.players.delete(WILD_CARD_PLAYER_ID);

    this.submissions.clear();
    this.pendingDoubleDown.clear();
    this.votes.clear();
    this.judgingOrder = [];
    this.revealedIds.clear();
    this.spotlightId = null;
    this.midGameExcused.clear();
    this.currentBlackCard = null;
    this.lastRoundResult = undefined;
    this.roundHistory = [];
    this.roundsPlayed = 0;
    this.finalResult = undefined;
    this.judgeOrder = [];
    this.judgeIndex = 0;

    this.phase = "lobby";
  }

  /** Shared by skipBlackCard and submitCustomBlackCard: anyone who'd
   * already submitted for the discarded black card gets those cards (and
   * any Double Down stake) back in hand rather than losing them - neither
   * a skip nor a Judge-authored replacement is the submitter's fault. */
  private returnSubmissionsToHands(): void {
    for (const entry of this.submissions.values()) {
      const owner = this.players.get(entry.playerId);
      if (!owner) continue;
      owner.hand.push(...entry.cards);
      if (entry.stakedBlackCard) owner.wonBlackCards.push(entry.stakedBlackCard);
    }
    this.submissions.clear();
    this.pendingDoubleDown.clear();
    this.judgingOrder = [];
    this.revealedIds.clear();
    this.spotlightId = null;
    // A Double Down countdown (see maybeAdvanceToReveal) may be in flight
    // when the black card changes out from under it (Skip / a fresh Custom
    // Prompt) — that timer would otherwise still fire and try to reveal a
    // round whose submissions just got wiped out from under it.
    this.clearTimer();
    this.doubleDownDeadline = null;
  }

  /** Wild Card still needs a fresh auto-submission whenever the black card
   * changes mid-Submission (skip or a custom prompt) - dealPhase()'s
   * version runs once per round, this is the same logic for that case. */
  private autoSubmitWildCardIfEnabled(): void {
    if (!this.houseRules.wildCard || !this.currentBlackCard) return;
    const wildCard = this.players.get(WILD_CARD_PLAYER_ID);
    if (!wildCard) return;
    const cards = autoSubmitWildCard(wildCard, this.currentBlackCard);
    if (cards.length === this.currentBlackCard.pick) {
      const submissionId = nanoid(10);
      this.submissions.set(submissionId, { submissionId, playerId: wildCard.id, cards, isDoubleDown: false });
    }
  }

  /** Host or the current Judge (not Table - it's a judgment call about the
   * round's content, not a display setting) can bail on a bad prompt during
   * Submission and draw a new one. */
  skipBlackCard(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    const isJudge = player.id === this.currentJudgeId();
    if (!hasHostAuthority(player) && !isJudge) {
      throw new RoomError("NOT_HOST", `Only the host or the ${this.roleNames.judge} can skip the black card.`);
    }
    if (this.phase !== "submission") {
      throw new RoomError("WRONG_PHASE", "Can only skip the black card during submission.");
    }
    if (!this.currentBlackCard) throw new RoomError("NO_BLACK_CARD", "No black card in play.");

    this.returnSubmissionsToHands();
    this.blackDiscard.push(this.currentBlackCard);
    this.currentBlackCard = this.drawBlackCard();
    this.autoSubmitWildCardIfEnabled();
    this.broadcast();
  }

  /** Host or the current Judge - bows out of judging this round (AFK, or
   * just don't want to), handing it to the next player in rotation and
   * redealing. Same "return in-flight submissions" handling as Skip Card;
   * unlike kicking the Judge, nobody's removed, so the rotation just moves
   * on and this player gets their normal turn again next time it comes
   * around. */
  skipJudgeTurn(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    const isJudge = player.id === this.currentJudgeId();
    if (!hasHostAuthority(player) && !isJudge) {
      throw new RoomError("NOT_HOST", `Only the host or the current ${this.roleNames.judge} can skip the ${this.roleNames.judge}'s turn.`);
    }
    if (this.phase !== "submission" && this.phase !== "reveal" && this.phase !== "judging") {
      throw new RoomError("WRONG_PHASE", `Can only skip the ${this.roleNames.judge}'s turn while a round is in progress.`);
    }
    if (this.judgeOrder.length === 0) throw new RoomError("NO_JUDGE", `No ${this.roleNames.judge} rotation to skip.`);

    this.returnSubmissionsToHands();
    if (this.currentBlackCard) this.blackDiscard.push(this.currentBlackCard);
    this.judgeIndex = (this.judgeIndex + 1) % this.judgeOrder.length;
    this.dealPhase();
  }

  /** Host-only - excuses one slow/AFK player from being required to submit
   * this round only (same mechanism a mid-game joiner gets - see
   * addOrReconnectPlayer), letting the round advance without waiting on
   * them. They keep their seat/hand and are required again next round. */
  excusePlayerThisRound(hostId: string, targetId: string): void {
    this.requireHost(hostId);
    if (this.phase !== "submission") {
      throw new RoomError("WRONG_PHASE", "Can only skip a player's turn during submission.");
    }
    const target = this.players.get(targetId);
    if (!target || target.role !== "player" || target.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "That's not a player who can be excused.");
    }
    if (target.id === this.currentJudgeId() && !this.isVotingRound()) {
      throw new RoomError("IS_JUDGE", `The ${this.roleNames.judge} isn't a required submitter this round — use Skip Turn instead if they're stuck.`);
    }
    if (this.hasNormalSubmission(targetId)) {
      throw new RoomError("ALREADY_SUBMITTED", "That player already submitted this round.");
    }
    this.midGameExcused.add(targetId);
    this.maybeAdvanceToReveal();
    this.broadcast();
  }

  /** The Judge writes their own black card for the round instead of
   * drawing one - same "return in-flight submissions" handling as skip. */
  submitCustomBlackCard(judgeId: string, text: string, pick: number): void {
    if (!this.houseRules.customPrompts) {
      throw new RoomError("RULE_DISABLED", "Custom Prompts isn't enabled for this game.");
    }
    const player = this.players.get(judgeId);
    if (!player || player.id !== this.currentJudgeId()) {
      throw new RoomError("NOT_JUDGE", `Only the ${this.roleNames.judge} can write a custom prompt.`);
    }
    if (this.phase !== "submission") {
      throw new RoomError("WRONG_PHASE", "Can only set a custom prompt during submission.");
    }
    const cleanText = text.trim().slice(0, 300);
    if (!cleanText) throw new RoomError("EMPTY_PROMPT", "Write something first.");
    const cleanPick = Math.min(3, Math.max(1, Math.floor(pick) || 1));

    this.returnSubmissionsToHands();
    if (this.currentBlackCard) this.blackDiscard.push(this.currentBlackCard);
    this.currentBlackCard = { id: nanoid(10), text: cleanText, pick: cleanPick, pack: "custom-prompt" };
    this.autoSubmitWildCardIfEnabled();
    this.broadcast();
  }

  /** Once per game, discard your whole hand and draw a fresh one for free. */
  refreshHand(playerId: string): void {
    if (!this.houseRules.handRefresh) {
      throw new RoomError("RULE_DISABLED", "Hand Refresh isn't enabled for this game.");
    }
    if (this.phase !== "submission") {
      throw new RoomError("WRONG_PHASE", "You can only refresh your hand during submission.");
    }
    const player = this.players.get(playerId);
    if (!player || player.role !== "player" || player.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players refresh their hand.");
    }
    if (this.hasNormalSubmission(playerId)) {
      throw new RoomError("ALREADY_SUBMITTED", "You already submitted this round.");
    }
    if (player.usedHandRefresh) {
      throw new RoomError("ALREADY_USED", "You've already used your hand refresh this game.");
    }
    this.discardAndRefillHand(player);
    player.usedHandRefresh = true;
    this.broadcast();
  }

  /** Discards a player's whole hand and redraws it back to handSize - the
   * shared body of Hand Refresh and Discard Bomb (see playActionCard),
   * which differ only in who's targeted and what gates access to it. */
  private discardAndRefillHand(player: ServerPlayer): void {
    this.discardWhite(player.hand);
    player.hand = [];
    for (let i = 0; i < this.handSize; i++) {
      const card = this.drawWhiteCardFor(player);
      if (!card) break;
      player.hand.push(card);
    }
  }

  private buildDecks(): void {
    let white: WhiteCard[] = [];
    let black: BlackCard[] = [];
    for (const packId of this.selectedPackIds) {
      if (this.cardData.whiteByPack.has(packId)) {
        white.push(...(this.cardData.whiteByPack.get(packId) ?? []));
        black.push(...(this.cardData.blackByPack.get(packId) ?? []));
      } else {
        // Not a static pack id - check the Custom Sets pool (a separate,
        // individually-selectable pool from the useCustomCards toggle
        // below). Runs before the dedupe/vulgar filters, so Custom Set
        // cards automatically respect those room settings like everything
        // else, no special-casing needed.
        const set = getCustomSets().find((s) => s.id === packId);
        if (set) {
          white.push(...set.white.map((c) => ({ ...c, pack: packId })));
          black.push(...set.black.map((c) => ({ ...c, pack: packId })));
        }
      }
    }
    if (this.deckOptions.useCustomCards) {
      const custom = getCustomCards();
      white.push(...custom.white.map((c) => ({ ...c, pack: "custom" })));
      black.push(...custom.black.map((c) => ({ ...c, pack: "custom" })));
    }
    if (this.houseRules.singleAnswerOnly) {
      black = black.filter((c) => c.pick === 1);
    }
    if (this.deckOptions.excludeDuplicates) {
      white = dedupeByText(white);
      black = dedupeByText(black);
    }
    if (this.deckOptions.excludeVulgar) {
      white = white.filter((c) => !isVulgar(c.text));
      black = black.filter((c) => !isVulgar(c.text));
    }
    if (this.deckOptions.vulgarOnly) {
      white = white.filter((c) => isVulgar(c.text));
    }
    if (this.excludedCardIds.size > 0) {
      white = white.filter((c) => !this.excludedCardIds.has(c.id));
      black = black.filter((c) => !this.excludedCardIds.has(c.id));
    }
    if (black.length === 0) {
      throw new RoomError(
        "NO_BLACK_CARDS",
        "The selected packs don't have any black cards left after applying the deck filters."
      );
    }
    // Action Cards are genuine entries in the white deck (not a separate
    // shadow pool checked probabilistically on every draw) - mixed in here,
    // before the shuffle, at a percentage of the real (post-filter) white
    // count so the rarity stays consistent regardless of how many packs are
    // selected. Wild Card is kept off them separately (see dealPhase()'s
    // drawNonActionCardForWildCard) since they're now indistinguishable from
    // any other white card at the deck level.
    if (this.houseRules.actionCards && white.length > 0) {
      const tiers = resolveTiers(this.actionCardTiers);
      const realPlayerCount = [...this.players.values()].filter((p) => p.role === "player" && !p.isWildCard).length;
      const defs = ACTION_CARD_DEFS
        // Cards that only make sense with a Judge are left out entirely under
        // Crowd Favorite, rather than being drawable and then refused.
        .filter((d) => !(d.requiresJudgeMode && this.houseRules.crowdFavorite))
        // Same idea for a card that needs a real electorate (Democracy) -
        // left out below its floor rather than drawable and then refused.
        .filter((d) => !d.minRealPlayers || realPlayerCount >= d.minRealPlayers)
        .filter((d) => tiers[d.id] !== "off");

      if (defs.length > 0) {
        const count = Math.max(1, Math.round(white.length * (this.actionCardDensity / 100)));
        const weights = defs.map((d) => {
          const tier = tiers[d.id];
          return tier === "off" ? 0 : this.actionCardTierWeights[tier];
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        // Largest-remainder apportionment rather than a weighted random
        // draw per card: the seeded mix then matches the configured weights
        // exactly instead of only on average, which keeps "Common is ~5x
        // Rare" true in a single game rather than across many.
        const exact = weights.map((w) => (totalWeight > 0 ? (count * w) / totalWeight : 0));
        const counts = exact.map((n) => Math.floor(n));
        let remaining = count - counts.reduce((a, b) => a + b, 0);
        const byRemainder = exact
          .map((n, i) => ({ i, frac: n - Math.floor(n) }))
          .sort((a, b) => b.frac - a.frac);
        for (let k = 0; remaining > 0 && k < byRemainder.length; k++, remaining--) {
          counts[byRemainder[k].i] += 1;
        }
        // Any leftover from every fraction being zero goes to the heaviest card.
        while (remaining > 0) {
          counts[byRemainder[0]?.i ?? 0] += 1;
          remaining--;
        }

        defs.forEach((def, i) => {
          for (let n = 0; n < counts[i]; n++) {
            white.push({ id: nanoid(10), text: def.name, pack: "action", actionCardId: def.id });
          }
        });
      }
    }
    this.whiteDeck = shuffle(white);
    this.blackDeck = shuffle(black);
    this.whiteDiscard = [];
    this.blackDiscard = [];
  }

  private drawWhiteCard(): WhiteCard | null {
    if (this.whiteDeck.length === 0) {
      if (this.whiteDiscard.length === 0) return null;
      this.whiteDeck = shuffle(this.whiteDiscard);
      this.whiteDiscard = [];
    }
    return this.whiteDeck.pop() ?? null;
  }

  /** A player's own draws pull from their personal stash (Personal Cards
   * house rule, pre-shuffled once the writing window closes) before the
   * shared deck - falls back to drawWhiteCard() once that stash is empty.
   * Action Cards are ordinary entries in the shared deck now (see
   * buildDecks()), so no special-casing is needed here - any real player
   * can draw one through the normal shuffle. Wild Card is kept off them via a
   * dedicated draw path (see drawNonActionCardForWildCard below), not this
   * method - Wild Card never calls drawWhiteCardFor() at all (its hand-fill
   * uses a raw drawWhiteCard() callback, see dealPhase()). */
  private drawWhiteCardFor(player: ServerPlayer): WhiteCard | null {
    if (player.personalDeck.length > 0) return player.personalDeck.pop()!;
    return this.drawWhiteCard();
  }

  /** Wild Card's dedicated draw path (see dealPhase()) - identical to
   * drawWhiteCard() except it never lets an Action Card through. A skipped
   * Action Card is slotted back in just one card deeper than where it was
   * (not shuffled, not sent to the bottom of a potentially huge deck) -
   * Wild Card just quietly passes over it, and it comes right back up as the
   * very next draw for whoever's next in line. It can't go back in the
   * *exact* same spot (drawWhiteCard() pops from the top), since that would
   * just hand Wild Card the same card again next attempt, forever.
   * Bounded: if every real white card is currently out in players' hands
   * and only Action Cards remain in the deck, cycling through them could
   * otherwise spin forever - give up and let Wild Card simply not draw this
   * time, same as the ordinary "deck's genuinely empty" case elsewhere. */
  private drawNonActionCardForWildCard(): WhiteCard | null {
    for (let attempt = 0; attempt < 200; attempt++) {
      const card = this.drawWhiteCard();
      if (!card) return null;
      if (!card.actionCardId) return card;
      this.whiteDeck.splice(Math.max(0, this.whiteDeck.length - 1), 0, card);
    }
    return null;
  }

  /** Personal cards never re-enter the shared discard pile once played or
   * discarded - unlike every other card, they stay out of circulation for
   * the rest of the game. Use this instead of pushing into whiteDiscard
   * directly anywhere a player's own cards might be mixed in. */
  private discardWhite(cards: WhiteCard[]): void {
    this.whiteDiscard.push(...cards.filter((c) => c.pack !== "personal"));
  }

  private drawBlackCard(): BlackCard | null {
    if (this.blackDeck.length === 0) {
      if (this.blackDiscard.length === 0) return null;
      this.blackDeck = shuffle(this.blackDiscard);
      this.blackDiscard = [];
    }
    return this.blackDeck.pop() ?? null;
  }

  private currentJudgeId(): string | null {
    return this.judgeOrder[this.judgeIndex] ?? null;
  }

  private dealPhase(): void {
    this.phase = "dealing";
    this.dealtAt = Date.now();
    // A redeal of the same round (Judge kicked or skipped) isn't a new round.
    if (this.roundsPlayed + 1 !== this.lastStartedRound) {
      this.lastStartedRound = this.roundsPlayed + 1;
      this.notify("round_started", { round: this.lastStartedRound });
    }

    // Card Block (see playActionCard): staged against a future round when
    // played, becomes active for exactly the round now starting, and is
    // cleared again at the next dealPhase() after this one.
    this.blockedFromDrawingIds = new Set(this.pendingCardBlockIds);
    this.pendingCardBlockIds.clear();

    // Trim any hand that's grown past handSize back down to the cap before
    // this round's own top-up/bonus runs - most commonly a Pick Bonus card
    // nobody spent (e.g. the Judge, who doesn't submit). The bonus is meant
    // to help through *that* round, not accumulate round over round.
    for (const player of this.players.values()) {
      if (player.role !== "player" || player.isWildCard) continue;
      if (player.hand.length > this.handSize) {
        const excess = player.hand.splice(this.handSize);
        this.discardWhite(excess);
      }
    }

    // Real players draw their own hands manually by default (see
    // drawCards) — a deliberate departure from CLAUDE.md's original
    // auto-fill description. Wild Card has no client to click a button, so it
    // still auto-deals regardless. With the Auto Draw house rule on, real
    // players get the same top-up here too - otherwise Auto Draw only ever
    // covered the post-submission refill, leaving every round's starting
    // hand (most visibly the very first one) still stuck on manual draw.
    if (this.houseRules.wildCard) {
      const wildCard = this.players.get(WILD_CARD_PLAYER_ID);
      if (wildCard) dealToWildCard(wildCard, () => this.drawNonActionCardForWildCard(), this.handSize);
    }
    if (this.houseRules.autoDraw) {
      for (const player of this.players.values()) {
        if (player.role !== "player" || player.isWildCard || !player.connected) continue;
        if (this.blockedFromDrawingIds.has(player.id)) continue;
        while (player.hand.length < this.handSize) {
          const card = this.drawWhiteCardFor(player);
          if (!card) break;
          player.hand.push(card);
        }
      }
    }

    this.currentBlackCard = this.drawBlackCard();

    // Pick Bonus: a pick-2/3 round costs more cards to submit than a normal
    // pick-1 round, so on those rounds every real player gets one extra
    // card - always auto-drawn regardless of the Auto Draw setting, same
    // "bypasses the toggle" precedent as the Double Down replacement card.
    // A flat +1 (not scaled to pick count), granted once per round
    // independent of current hand fullness - deliberately simple.
    if (this.houseRules.pickBonus && this.currentBlackCard && this.currentBlackCard.pick >= 2) {
      for (const player of this.players.values()) {
        if (player.role !== "player" || player.isWildCard || !player.connected) continue;
        if (this.blockedFromDrawingIds.has(player.id)) continue;
        const card = this.drawWhiteCardFor(player);
        if (card) player.hand.push(card);
      }
    }

    this.submissions.clear();
    this.judgingOrder = [];
    this.revealedIds.clear();
    this.spotlightId = null;
    this.pendingDoubleDown.clear();
    this.votes.clear();
    this.democracyThisRound = false;
    this.midGameExcused.clear();
    this.phase = "submission";

    this.autoSubmitWildCardIfEnabled();

    this.broadcast();
  }

  // ---------- Personal Cards ----------

  addPersonalCard(playerId: string, text: string): void {
    if (this.phase !== "personalCards") throw new RoomError("WRONG_PHASE", "The personal-card window isn't open.");
    const player = this.players.get(playerId);
    if (!player || player.role !== "player" || player.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players write personal cards.");
    }
    const cleanText = text.trim().slice(0, 200);
    if (!cleanText) throw new RoomError("EMPTY_CARD", "Write something first.");
    if (player.personalCards.length >= this.personalCardsMaxCount) {
      throw new RoomError("LIMIT_REACHED", `You can only write ${this.personalCardsMaxCount} personal cards.`);
    }
    // Personal cards live in their own pool (player.personalDeck), entirely
    // outside buildDecks()/dedupeByText() - without this, a freely-typed
    // personal card could duplicate a shared-pack card (or another
    // player's personal card) verbatim, showing up as a "duplicate" in
    // someone else's hand with no way to catch it. Only enforced when the
    // room already opted into deduping in general, same as everywhere else.
    if (this.deckOptions.excludeDuplicates) {
      const key = cleanText.toLowerCase();
      const dupInSharedPool = this.whiteDeck.some((c) => c.text.trim().toLowerCase() === key);
      const dupInPersonal = [...this.players.values()].some((p) =>
        p.personalCards.some((c) => c.text.trim().toLowerCase() === key)
      );
      if (dupInSharedPool || dupInPersonal) {
        throw new RoomError("DUPLICATE_CARD", "This room excludes duplicate cards — that text is already in play.");
      }
    }
    if (this.deckOptions.excludeVulgar && isVulgar(cleanText)) {
      throw new RoomError("VULGAR_BLOCKED", "This room excludes vulgar cards — that one's not allowed.");
    }
    if (this.deckOptions.vulgarOnly && !isVulgar(cleanText)) {
      throw new RoomError("NOT_VULGAR_ENOUGH", "This room only allows vulgar cards — that one's not vulgar enough.");
    }
    player.personalCards.push({ id: nanoid(10), text: cleanText, pack: "personal" });
    this.maybeShortenPersonalCardsWindow();
    this.broadcast();
  }

  /**
   * Once every connected player has written their full allowance there is
   * nothing left to wait for, so the remaining window collapses to a short
   * grace period. That still leaves room to fix a typo or swap a card, but
   * avoids sitting through minutes of dead timer - and makes the jump to
   * the first round less abrupt than cutting over the instant the last card
   * lands.
   *
   * Only ever shortens: deleting a card afterwards doesn't win the time
   * back, or the window could be yo-yoed indefinitely.
   */
  private maybeShortenPersonalCardsWindow(): void {
    if (this.phase !== "personalCards" || !this.personalCardsDeadline) return;
    const writers = [...this.players.values()].filter(
      (p) => p.role === "player" && !p.isWildCard && p.connected
    );
    if (writers.length === 0) return;
    if (!writers.every((p) => p.personalCards.length >= this.personalCardsMaxCount)) return;

    const graceMs = PERSONAL_CARDS_GRACE_SECONDS * 1000;
    if (this.personalCardsDeadline - Date.now() <= graceMs) return;

    this.clearTimer();
    this.personalCardsDeadline = Date.now() + graceMs;
    this.phaseTimer = this.safeTimeout("personalCardsWindow", graceMs, () => this.beginFirstRound());
  }

  removePersonalCard(playerId: string, cardId: string): void {
    if (this.phase !== "personalCards") throw new RoomError("WRONG_PHASE", "The personal-card window isn't open.");
    const player = this.players.get(playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    player.personalCards = player.personalCards.filter((c) => c.id !== cardId);
    this.broadcast();
  }

  // ---------- Drawing / trading in ----------

  /** Draws exactly one card, not a fill-to-full — each draw is its own
   * deliberate action (and its own "just drawn" moment client-side), same
   * unit as the Double Down replacement always drew. Click again for more. */
  drawCards(playerId: string): void {
    if (this.phase !== "submission") throw new RoomError("WRONG_PHASE", "You can only draw during submission.");
    const player = this.players.get(playerId);
    if (!player || player.role !== "player" || player.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players draw cards.");
    }
    if (this.blockedFromDrawingIds.has(playerId)) {
      throw new RoomError("CARD_BLOCKED", "You've been Card Blocked this round — no draws.");
    }
    if (player.hand.length >= this.handSize) return;
    const card = this.drawWhiteCardFor(player);
    if (card) player.hand.push(card);
    this.broadcast();
  }

  tradeInCards(playerId: string, cardIds: string[]): void {
    if (!this.houseRules.tradeIn) throw new RoomError("RULE_DISABLED", "Trade-In isn't enabled for this game.");
    if (this.phase !== "submission") throw new RoomError("WRONG_PHASE", "You can only trade in during submission.");
    const player = this.players.get(playerId);
    if (!player || player.role !== "player" || player.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players trade in cards.");
    }
    if (!this.isVotingRound() && player.id === this.currentJudgeId()) {
      throw new RoomError("YOU_ARE_JUDGE", `The ${this.roleNames.judge} doesn't trade in cards this round.`);
    }
    if (this.hasNormalSubmission(playerId)) throw new RoomError("ALREADY_SUBMITTED", "You already submitted this round.");
    if (cardIds.length === 0) throw new RoomError("NOTHING_TO_TRADE", "Select at least one card to trade in.");
    if (player.wonBlackCards.length === 0) {
      throw new RoomError("NOT_ELIGIBLE", "You need a previously-won black card to trade in.");
    }
    if (new Set(cardIds).size !== cardIds.length) throw new RoomError("BAD_SELECTION", "Duplicate cards selected.");
    for (const id of cardIds) {
      if (!player.hand.some((c) => c.id === id)) throw new RoomError("CARD_NOT_IN_HAND", "One of those cards isn't in your hand.");
    }

    const staked = player.wonBlackCards.pop()!;
    this.blackDiscard.push(staked);
    // A won black card is both currency and a point — spending one here
    // costs the point that came with it, same as losing one to a failed
    // Double Down wager (see finishRound).
    player.score = Math.max(0, player.score - 1);

    for (const id of cardIds) {
      const index = player.hand.findIndex((c) => c.id === id);
      const [discarded] = player.hand.splice(index, 1);
      this.discardWhite([discarded]);
    }
    for (let i = 0; i < cardIds.length; i++) {
      const card = this.drawWhiteCardFor(player);
      if (!card) break;
      player.hand.push(card);
    }

    this.broadcast();
  }

  /** Plays an Action Card from hand (see shared/src/actionCards.ts) - a
   * side-action alongside the normal submission, not a replacement for it.
   * Validation is generic per `shape`; only the effect switch below is
   * per-card, deliberately confined to this one method. */
  playActionCard(playerId: string, cardId: string, targetPlayerId?: string, giveCardId?: string): void {
    if (!this.houseRules.actionCards) throw new RoomError("RULE_DISABLED", "Action Cards aren't enabled for this game.");
    if (this.phase !== "submission") throw new RoomError("WRONG_PHASE", "You can only play an Action Card during submission.");
    const player = this.players.get(playerId);
    if (!player || player.role !== "player" || player.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players play Action Cards.");
    }
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) throw new RoomError("CARD_NOT_IN_HAND", "That card isn't in your hand.");
    const card = player.hand[cardIndex];
    const def = card.actionCardId ? getActionCardDef(card.actionCardId) : undefined;
    if (!def) throw new RoomError("NOT_AN_ACTION_CARD", "That's not an Action Card.");

    let target: ServerPlayer | undefined;
    if (def.shape === "target" || def.shape === "targetAndGive") {
      if (!targetPlayerId) throw new RoomError("NO_TARGET", "Choose a player to target.");
      if (targetPlayerId === playerId) throw new RoomError("BAD_TARGET", "You can't target yourself.");
      target = this.players.get(targetPlayerId);
      if (!target || target.role !== "player" || target.isWildCard) {
        throw new RoomError("BAD_TARGET", "That's not a valid target.");
      }
    }
    if (def.shape === "targetAndGive") {
      if (!giveCardId) throw new RoomError("NO_GIVE_CARD", "Choose one of your own cards to give away.");
      if (giveCardId === cardId) throw new RoomError("BAD_GIVE_CARD", "You can't give away the Action Card itself.");
      if (!player.hand.some((c) => c.id === giveCardId)) {
        throw new RoomError("CARD_NOT_IN_HAND", "That card isn't in your hand.");
      }
    }

    // Per-card preconditions are checked *before* the card is consumed
    // below. Throwing from inside the effect switch would discard the card
    // and then abort, quietly costing the player an Action Card for a play
    // that never happened.
    switch (def.id) {
      case "steal":
        if (target!.hand.length === 0) {
          throw new RoomError("NOTHING_TO_STEAL", `${target!.name} has no cards to steal.`);
        }
        break;
      case "tax":
        if (target!.wonBlackCards.length === 0) {
          throw new RoomError("NOTHING_TO_TAX", `${target!.name} has no won black cards to take.`);
        }
        break;
      case "democracy":
        if (this.houseRules.crowdFavorite) {
          throw new RoomError("RULE_DISABLED", "Every round is already put to a vote in Crowd Favorite.");
        }
        if ([...this.players.values()].filter((p) => p.role === "player" && !p.isWildCard).length < (def.minRealPlayers ?? 0)) {
          throw new RoomError("NOT_ENOUGH_PLAYERS", "Not enough real players left for a meaningful vote.");
        }
        // Playing this turns the Judge into a contestant for the round, so
        // it has to land before the actor commits their own card - that
        // way the round can't already be complete when the Judge is
        // suddenly added to the required submitters.
        if (this.hasNormalSubmission(playerId)) {
          throw new RoomError("ALREADY_SUBMITTED", "Play Democracy before you submit your own card.");
        }
        break;
    }

    if (def.costsWonBlackCard) {
      if (player.wonBlackCards.length === 0) {
        throw new RoomError("NOT_ELIGIBLE", "You need a previously-won black card to play this.");
      }
      const staked = player.wonBlackCards.pop()!;
      this.blackDiscard.push(staked);
      // Same "a won black card is both currency and a point" rule as
      // Trade-In and a lost Double Down wager - see finishRound().
      player.score = Math.max(0, player.score - 1);
    }

    // Consumed on use, always - remove and discard before applying the
    // effect (steal/give below operate on hand contents past this point).
    player.hand.splice(cardIndex, 1);
    this.discardWhite([card]);

    switch (def.id) {
      case "steal": {
        const t = target!;
        const stolenIndex = Math.floor(Math.random() * t.hand.length);
        const [stolen] = t.hand.splice(stolenIndex, 1);
        player.hand.push(stolen);
        const giveIndex = player.hand.findIndex((c) => c.id === giveCardId);
        const [given] = player.hand.splice(giveIndex, 1);
        t.hand.push(given);
        break;
      }
      case "peek": {
        const t = target!;
        const holding = t.hand.some((c) => c.actionCardId);
        const message = holding ? `${t.name} is holding an Action Card.` : `${t.name} isn't holding an Action Card right now.`;
        if (player.socketId) this.io.to(player.socketId).emit("actionCardResult", { message });
        break;
      }
      case "discard_bomb": {
        this.discardAndRefillHand(target!);
        break;
      }
      case "card_block": {
        this.pendingCardBlockIds.add(target!.id);
        break;
      }
      case "triple_boost": {
        for (let i = 0; i < 3; i++) {
          const drawn = this.drawWhiteCardFor(player);
          if (!drawn) break;
          player.hand.push(drawn);
        }
        break;
      }
      case "tax": {
        const t = target!;
        const taken = t.wonBlackCards.pop()!;
        // A won black card carries a point with it, so losing one costs the
        // point too - same rule as Trade-In and a lost Double Down wager.
        // The actor gains it as spendable currency only: score rises solely
        // from winning a round (CLAUDE.md), which is also why a mid-game
        // catch-up grant doesn't move it either.
        t.score = Math.max(0, t.score - 1);
        player.wonBlackCards.push(taken);
        break;
      }
      case "democracy": {
        this.democracyThisRound = true;
        this.pendingJudgingMessage = fillRoleNames(def.description, this.roleNames);
        break;
      }
      default: {
        // Every "flavor"-shape card (e.g. judge_accent): no state change,
        // just a judging-time instruction surfaced once the round reaches
        // Judging (see buildStateFor's pendingJudgingMessage).
        this.pendingJudgingMessage = fillRoleNames(def.description, this.roleNames);
        break;
      }
    }

    this.broadcast();
  }

  // ---------- Submission ----------

  submitCards(playerId: string, cardIds: string[]): void {
    if (this.phase !== "submission") throw new RoomError("WRONG_PHASE", "Not accepting submissions right now.");
    const player = this.players.get(playerId);
    if (!player || player.role !== "player") throw new RoomError("NOT_A_PLAYER", "Only players submit cards.");
    if (!this.isVotingRound() && player.id === this.currentJudgeId()) {
      throw new RoomError("YOU_ARE_JUDGE", `The ${this.roleNames.judge} doesn't submit a card.`);
    }
    if (this.hasNormalSubmission(playerId)) throw new RoomError("ALREADY_SUBMITTED", "You already submitted this round.");
    if (!this.currentBlackCard) throw new RoomError("NO_BLACK_CARD", "No black card in play.");
    if (cardIds.length !== this.currentBlackCard.pick) {
      throw new RoomError("WRONG_CARD_COUNT", `This round needs exactly ${this.currentBlackCard.pick} card(s).`);
    }

    const cards: WhiteCard[] = [];
    for (const cardId of cardIds) {
      const index = player.hand.findIndex((c) => c.id === cardId);
      if (index === -1) throw new RoomError("CARD_NOT_IN_HAND", "One of those cards isn't in your hand.");
      cards.push(player.hand[index]);
    }
    // Remove after validating the whole set, preserving submitted order.
    for (const card of cards) {
      const index = player.hand.findIndex((c) => c.id === card.id);
      player.hand.splice(index, 1);
    }

    const submissionId = nanoid(10);
    this.submissions.set(submissionId, { submissionId, playerId, cards, isDoubleDown: false });

    if (this.houseRules.doubleDown && canOfferDoubleDown(player, this.currentBlackCard.pick)) {
      const replacement = this.drawWhiteCardFor(player);
      if (replacement) {
        player.hand.push(replacement);
        this.pendingDoubleDown.set(playerId, { replacementCard: replacement, wagered: false });
      }
    }

    // Auto Draw: top the hand back up right away instead of waiting on a
    // manual Draw click. Still one-card-at-a-time under the hood (same as a
    // manual draw or the Double Down replacement above) — this just removes
    // the click, not the "draw one at a time" semantics.
    if (this.houseRules.autoDraw) {
      while (player.hand.length < this.handSize) {
        const card = this.drawWhiteCardFor(player);
        if (!card) break;
        player.hand.push(card);
      }
    }

    this.maybeAdvanceToReveal();
    this.broadcast();
  }

  /**
   * Takes a submission back while the round is still open - for the very
   * common "I misread the black card" moment, which otherwise left you
   * watching a round you'd already lost.
   *
   * Only allowed while at least one required player still hasn't submitted.
   * Once everyone is in, the round is effectively locked (the Double Down
   * window is running or Reveal is imminent), and letting someone pull a
   * card out from under that would reopen a round others have finished.
   *
   * Undoing has to unwind everything the submission caused, or submit ->
   * unsubmit becomes a card printer: Auto Draw tops the hand back up on
   * submit, and Double Down deals a replacement, so a naive take-back would
   * hand out a free card per cycle.
   */
  unsubmitCards(playerId: string): void {
    if (this.phase !== "submission") throw new RoomError("WRONG_PHASE", "Too late to take that back.");
    const player = this.players.get(playerId);
    if (!player || player.role !== "player" || player.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players submit cards.");
    }

    const entry = [...this.submissions.entries()].find(([, sub]) => sub.playerId === playerId && !sub.isDoubleDown);
    if (!entry) throw new RoomError("NOT_SUBMITTED", "You haven't submitted anything this round.");

    const offer = this.pendingDoubleDown.get(playerId);
    if (offer?.wagered) {
      throw new RoomError("ALREADY_WAGERED", "You've already wagered a black card on this round.");
    }
    if (!this.someoneStillToSubmit(playerId)) {
      throw new RoomError("ROUND_LOCKED", "Everyone else is in — this round is already locked.");
    }

    const [submissionId, submission] = entry;
    this.submissions.delete(submissionId);

    // Hand the played cards back at the front, so the trim below takes the
    // auto-drawn surplus off the end rather than the cards being returned.
    player.hand.unshift(...submission.cards);

    // Drop the Double Down replacement too - it was dealt *because* of the
    // submission being undone.
    if (offer) {
      const index = player.hand.findIndex((c) => c.id === offer.replacementCard.id);
      if (index !== -1) {
        const [replacement] = player.hand.splice(index, 1);
        this.discardWhite([replacement]);
      }
      this.pendingDoubleDown.delete(playerId);
    }

    // Undo the Auto Draw top-up. Without this the hand grows by one every
    // submit/unsubmit cycle.
    while (player.hand.length > this.handSize) {
      const surplus = player.hand.pop();
      if (!surplus) break;
      this.discardWhite([surplus]);
    }

    // A pending Double Down window may no longer be warranted now that
    // someone is outstanding again.
    this.clearTimer();
    this.doubleDownDeadline = null;
    this.broadcast();
  }

  /** Whether any required submitter other than `exceptPlayerId` still has a
   * card to play. Mirrors maybeAdvanceToReveal's notion of "required". */
  private someoneStillToSubmit(exceptPlayerId: string): boolean {
    const judgeId = this.currentJudgeId();
    const required = this.judgeOrder
      .filter((id) => this.isVotingRound() || id !== judgeId)
      .filter((id) => this.players.get(id)?.connected)
      .filter((id) => !this.midGameExcused.has(id))
      .filter((id) => id !== exceptPlayerId);
    const submitted = new Set([...this.submissions.values()].map((sub) => sub.playerId));
    return required.some((id) => !submitted.has(id));
  }

  wagerDoubleDown(playerId: string): void {
    if (this.phase !== "submission") throw new RoomError("WRONG_PHASE", "Too late to wager this round.");
    const player = this.players.get(playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    const offer = this.pendingDoubleDown.get(playerId);
    if (!offer || offer.wagered) throw new RoomError("NO_OFFER", "No Double Down offer available.");
    if (offer.replacementCard.actionCardId) {
      throw new RoomError("CANNOT_WAGER_ACTION_CARD", "An Action Card can't be wagered — it's not a joke card.");
    }
    if (!isEligibleToWager(player)) {
      throw new RoomError("NOT_ELIGIBLE", "You need a previously-won black card to wager.");
    }

    const handIndex = player.hand.findIndex((c) => c.id === offer.replacementCard.id);
    if (handIndex === -1) throw new RoomError("CARD_NOT_IN_HAND", "That replacement card is no longer in your hand.");
    player.hand.splice(handIndex, 1);

    const staked = player.wonBlackCards.pop();
    if (!staked) throw new RoomError("NOT_ELIGIBLE", "You need a previously-won black card to wager.");

    const submissionId = nanoid(10);
    this.submissions.set(submissionId, {
      submissionId,
      playerId,
      cards: [offer.replacementCard],
      isDoubleDown: true,
      stakedBlackCard: staked,
    });
    offer.wagered = true;

    this.broadcast();
  }

  private hasNormalSubmission(playerId: string): boolean {
    return [...this.submissions.values()].some((s) => s.playerId === playerId && !s.isDoubleDown);
  }

  private maybeAdvanceToReveal(): void {
    const judgeId = this.currentJudgeId();
    // Crowd Favorite: nobody's exempt from submitting - there's no Judge to
    // judge, everyone (including whoever judgeOrder currently points at) is
    // a contestant.
    const required = this.judgeOrder
      .filter((id) => this.isVotingRound() || id !== judgeId)
      .filter((id) => this.players.get(id)?.connected)
      .filter((id) => !this.midGameExcused.has(id));
    const submitted = new Set([...this.submissions.values()].map((s) => s.playerId));
    const allIn = required.every((id) => submitted.has(id));
    if (!allIn || required.length === 0) return;

    // Re-entrant safe: kicking a player mid-submission re-runs this check,
    // so always clear any timer already in flight before deciding whether
    // to (re)start one, rather than risk two competing timers.
    this.clearTimer();
    this.doubleDownDeadline = null;

    // Give anyone with a live, unwagered Double Down offer a beat to decide
    // before locking in - without this, the round can jump straight to
    // Reveal the instant the last player submits, closing that window
    // almost instantly for whoever was still deciding.
    const hasPendingWagers =
      this.houseRules.doubleDown &&
      [...this.pendingDoubleDown.values()].some((offer) => !offer.wagered && !offer.replacementCard.actionCardId);
    if (hasPendingWagers && this.doubleDownWindowSeconds > 0) {
      const windowMs = this.doubleDownWindowSeconds * 1000;
      this.doubleDownDeadline = Date.now() + windowMs;
      this.phaseTimer = this.safeTimeout("doubleDownWindow", windowMs, () => {
        this.doubleDownDeadline = null;
        if (this.phase === "submission") {
          this.moveToReveal();
        } else {
          this.broadcast();
        }
      });
      this.broadcast();
      return;
    }

    this.moveToReveal();
  }

  private moveToReveal(): void {
    this.phase = "reveal";
    this.judgingOrder = shuffle([...this.submissions.keys()]);
    this.revealedIds.clear();
    // Crowd Favorite / Democracy: there's no Judge driving a one-at-a-time
    // reveal in a vote - everyone eligible needs to see every card at once
    // to vote, so skip the face-down suspense entirely and land straight
    // in judging with the whole lineup already flipped. Without this,
    // revealSubmission's Judge/Table-only gate (requireJudgeAuthority) left
    // whichever player the judge rotation still happens to point at as the
    // sole person able to flip cards for everyone else to vote on - a real
    // bug, not just a missing nicety, since "No Judge in this mode" is
    // the whole point of a voting round.
    if (this.isVotingRound()) {
      for (const id of this.judgingOrder) this.revealedIds.add(id);
      this.phase = "judging";
    }
    this.broadcast();
  }

  // ---------- Judging: shuffle, reveal, pick ----------

  private requireJudgeAuthority(senderId: string): ServerPlayer {
    const sender = this.players.get(senderId);
    if (!sender) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    // The Table mirrors whichever player is currently Judge (CLAUDE.md), so
    // input from the Table is trusted the same as the Judge's own phone.
    const isJudge = sender.id === this.currentJudgeId();
    const isTableMirror = sender.role === "table";
    if (!isJudge && !isTableMirror) throw new RoomError("NOT_JUDGE", `Only the ${this.roleNames.judge} can do that.`);
    return sender;
  }

  /** Deliberately broader than requireJudgeAuthority (Judge/Table only) -
   * this is a display/cosmetic setting, not a judging action, so the host
   * also gets it (matching setTableScale's Lobby-only host access, but
   * usable any phase - the host may want to resize the Shared Screen
   * mid-game too, not just before a Judge exists). */
  adjustTableScale(senderId: string, delta: number): void {
    const sender = this.players.get(senderId);
    if (!sender) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");
    const isJudge = sender.id === this.currentJudgeId();
    const isTableMirror = sender.role === "table";
    if (!isJudge && !isTableMirror && !hasHostAuthority(sender)) {
      throw new RoomError("NOT_JUDGE", `Only the ${this.roleNames.judge}, the host, or the Shared Screen can do that.`);
    }
    const next = Math.round((this.tableScale + delta) * 100) / 100;
    this.tableScale = Math.min(MAX_TABLE_SCALE, Math.max(MIN_TABLE_SCALE, next));
    this.broadcast();
  }

  shuffleSubmissions(senderId: string): void {
    if (this.phase !== "reveal") {
      throw new RoomError("SHUFFLE_LOCKED", "Shuffling is only available before any card has been revealed.");
    }
    this.requireJudgeAuthority(senderId);
    this.judgingOrder = shuffle(this.judgingOrder);
    this.broadcast();
  }

  revealSubmission(senderId: string, submissionId: string): void {
    if (this.phase !== "reveal" && this.phase !== "judging") {
      throw new RoomError("WRONG_PHASE", "Not judging right now.");
    }
    this.requireJudgeAuthority(senderId);
    if (!this.submissions.has(submissionId)) throw new RoomError("BAD_SUBMISSION", "That submission doesn't exist.");
    if (this.revealedIds.has(submissionId)) return;
    this.revealedIds.add(submissionId);
    if (this.phase === "reveal") this.phase = "judging";
    // Whichever device (Table or the Judge's own phone) triggers the reveal,
    // the spotlight should open the same way on both - not just locally on
    // whoever tapped it.
    if (this.tableStyle.spotlightEnabled) this.spotlightId = submissionId;
    this.broadcast();
  }

  /** Bring an already-revealed card (back) into the spotlight - mirrors on
   * every judge-authority viewer, same as the auto-open in revealSubmission. */
  spotlightSubmission(senderId: string, submissionId: string): void {
    this.requireJudgeAuthority(senderId);
    if (!this.revealedIds.has(submissionId)) {
      throw new RoomError("NOT_REVEALED", "Reveal this card before spotlighting it.");
    }
    this.spotlightId = submissionId;
    this.broadcast();
  }

  clearSpotlight(senderId: string): void {
    this.requireJudgeAuthority(senderId);
    this.spotlightId = null;
    this.broadcast();
  }

  judgePick(senderId: string, submissionId: string): void {
    if (this.houseRules.crowdFavorite) {
      throw new RoomError("RULE_DISABLED", "Crowd Favorite is on — vote instead of picking.");
    }
    if (this.democracyThisRound) {
      throw new RoomError("RULE_DISABLED", "Democracy was played — this round goes to a vote.");
    }
    if (this.phase !== "judging") throw new RoomError("WRONG_PHASE", "Not judging right now.");
    this.requireJudgeAuthority(senderId);
    if (!this.revealedIds.has(submissionId)) {
      throw new RoomError("NOT_REVEALED", "Reveal this card before picking it.");
    }
    this.finishRound(submissionId);
  }

  /** No Judge in this mode - everyone (who submitted) votes once for a
   * revealed card that isn't their own; re-castable until the round
   * resolves, which happens automatically once every eligible voter's in. */
  /** True when the winner is decided by vote rather than by the Judge -
   * Crowd Favorite for the whole game, or Democracy for this round only. */
  private isVotingRound(): boolean {
    return this.houseRules.crowdFavorite || this.democracyThisRound;
  }

  /** Who has to vote before the round can resolve: everyone with a card
   * in the lineup. */
  private eligibleVoters(): ServerPlayer[] {
    // Under both Crowd Favorite and Democracy the Judge submits a card like
    // everyone else, so "everyone with a card in the lineup" already covers
    // the whole table - no special case for the Judge.
    const ids = new Set([...this.submissions.values()].map((s) => s.playerId));
    return [...ids]
      .map((id) => this.players.get(id))
      .filter((p): p is ServerPlayer => !!p && p.role === "player" && !p.isWildCard);
  }

  voteForSubmission(playerId: string, submissionId: string): void {
    if (!this.isVotingRound()) throw new RoomError("RULE_DISABLED", "This round isn't decided by a vote.");
    if (this.phase !== "judging") throw new RoomError("WRONG_PHASE", "Not judging right now.");
    if (!this.revealedIds.has(submissionId)) {
      throw new RoomError("NOT_REVEALED", "Reveal this card before voting for it.");
    }
    const voter = this.players.get(playerId);
    if (!voter || voter.role !== "player" || voter.isWildCard) {
      throw new RoomError("NOT_A_PLAYER", "Only players vote.");
    }
    const entry = this.submissions.get(submissionId);
    if (!entry) throw new RoomError("BAD_SUBMISSION", "That submission doesn't exist.");
    if (entry.playerId === playerId) throw new RoomError("CANT_VOTE_SELF", "You can't vote for your own card.");

    this.votes.set(playerId, submissionId);
    this.broadcast();
    this.maybeResolveCrowdFavorite();
  }

  private maybeResolveCrowdFavorite(): void {
    const eligibleVoters = this.eligibleVoters();
    if (eligibleVoters.length === 0 || !eligibleVoters.every((p) => this.votes.has(p.id))) return;

    const tally = new Map<string, number>();
    for (const submissionId of this.votes.values()) {
      tally.set(submissionId, (tally.get(submissionId) ?? 0) + 1);
    }
    const maxVotes = Math.max(...tally.values());
    const topSubmissionIds = [...tally.entries()].filter(([, n]) => n === maxVotes).map(([id]) => id);
    const winningSubmissionId = topSubmissionIds[Math.floor(Math.random() * topSubmissionIds.length)];
    this.finishRound(winningSubmissionId);
  }

  /** Shared by judgePick and the Crowd Favorite vote-tally resolution:
   * scores the winner, resolves any wagered Double Down entries, and
   * schedules the roundEnd -> next round/gameEnd transition. */
  private finishRound(submissionId: string): void {
    const entry = this.submissions.get(submissionId);
    if (!entry) throw new RoomError("BAD_SUBMISSION", "That submission doesn't exist.");
    if (!this.currentBlackCard) throw new RoomError("NO_BLACK_CARD", "No black card in play.");

    const winner = this.players.get(entry.playerId);
    if (!winner) throw new RoomError("BAD_SUBMISSION", "That player is no longer in the room.");

    this.spotlightId = null;
    this.pendingJudgingMessage = null;
    // Wild Card's own score still climbs every time it wins a round, even with
    // Wild Card Can Win off - a host wants to see how it's doing, not just a
    // frozen 0 (previously this increment was skipped entirely when Wild Card
    // couldn't win, so the Scoreboard could never show anything but 0 for
    // it). Whether that score counts toward *ending the game* is a
    // separate question, decided at the win-condition check below via the
    // same `!isWildCard || wildCardCanScore` gate `buildFinalResult()` already
    // uses - so Wild Card can happily sail past the target with no effect on
    // anyone else's game. wonBlackCards (the Double Down/Trade-In currency)
    // stays gated off for Wild Card regardless of wildCardCanScore - it has no
    // client to ever spend it, so granting it would be pure dead state,
    // independent of whether its score counts or is merely displayed.
    winner.score += 1;
    if (!winner.isWildCard) {
      winner.wonBlackCards.push(this.currentBlackCard);
    }

    const doubleDownResults: RoundResult["doubleDownResults"] = [];
    for (const [pid, offer] of this.pendingDoubleDown) {
      if (!offer.wagered) continue;
      const player = this.players.get(pid);
      if (!player) continue;
      const won = pid === winner.id;
      const ddEntry = [...this.submissions.values()].find((s) => s.playerId === pid && s.isDoubleDown);
      if (won) {
        if (ddEntry?.stakedBlackCard) player.wonBlackCards.push(ddEntry.stakedBlackCard);
      } else {
        if (ddEntry?.stakedBlackCard) {
          this.blackDiscard.push(ddEntry.stakedBlackCard);
          // Losing the wager costs the point that came with the card, same as
          // spending one on Trade-In (see tradeInCards).
          player.score = Math.max(0, player.score - 1);
        }
      }
      doubleDownResults.push({ playerId: pid, playerName: player.name, won });
    }

    for (const s of this.submissions.values()) {
      this.discardWhite(s.cards);
    }

    this.lastRoundResult = {
      winningSubmissionId: submissionId,
      winningPlayerId: winner.id,
      winningPlayerName: winner.name,
      cards: entry.cards,
      blackCard: this.currentBlackCard,
      doubleDownResults,
    };
    // Most-recent-first, capped so a marathon game can't grow this without bound.
    this.roundHistory.unshift(this.lastRoundResult);
    this.roundsPlayed += 1;
    if (this.roundHistory.length > 100) this.roundHistory.length = 100;
    this.phase = "roundEnd";
    this.notify("winner", { name: winner.name, round: this.roundsPlayed });
    this.broadcast();

    this.clearTimer();
    // Re-check the win condition when the timer actually fires, not at
    // pick-time: a host can raise the target during this roundEnd window
    // (updateWinCondition works in any phase) to keep a game going even
    // after someone already hit the old target.
    this.phaseTimer = this.safeTimeout("roundEnd", ROUND_END_DELAY_MS, () => {
      // "rounds" ends on a fixed number of rounds regardless of who is
      // ahead; buildFinalResult() then ranks by score as usual (and
      // already treats a shared top score as a tie). In "blackCards" mode,
      // a win only counts toward ending the game when this round's winner
      // is actually eligible to win the game - Wild Card's score keeps
      // climbing regardless (see finishRound above) so it can visibly sail
      // past the target, but that alone must never end the game when
      // Wild Card Can Win is off. Same gate buildFinalResult() already uses.
      const winnerCountsTowardEnding = !winner.isWildCard || this.houseRules.wildCardCanScore;
      const reachedEnd =
        this.winCondition.mode === "rounds"
          ? this.roundsPlayed >= this.winCondition.target
          : winnerCountsTowardEnding && winner.score >= this.winCondition.target;
      if (!this.houseRules.noScorekeeping && reachedEnd) {
        this.finalResult = this.buildFinalResult();
        this.phase = "gameEnd";
      } else {
        this.notify("round_ended", { round: this.roundsPlayed });
        this.judgeIndex = (this.judgeIndex + 1) % this.judgeOrder.length;
        this.dealPhase();
        return;
      }
      this.broadcast();
    });
  }

  private buildFinalResult(): GameResult {
    const ranked = [...this.players.values()]
      .filter((p) => p.role === "player" && (!p.isWildCard || this.houseRules.wildCardCanScore))
      .sort((a, b) => b.score - a.score);
    const topScore = ranked[0]?.score ?? 0;
    // Every player sharing the top score is a winner - a shared first place
    // is a tie, not a coin flip decided by array/sort order.
    const winners = ranked.filter((p) => p.score === topScore);
    // Called from exactly the two places a game can end (the host's End Game
    // and the round-end win check), so this doubles as the game-over log
    // without needing the same line in both.
    log.info("game", "ended", {
      code: this.code,
      winners: winners.map((p) => p.name).join(",") || "none",
      topScore,
      rounds: this.roundHistory.length,
    });
    this.notify("game_over", { winners: winners.map((p) => p.name) });
    return {
      winnerPlayerIds: winners.map((p) => p.id),
      winnerNames: winners.map((p) => p.name),
      finalScores: ranked.map((p) => ({ playerId: p.id, name: p.name, score: p.score })),
    };
  }

  private clearTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  /** Every phase timer goes through here rather than raw setTimeout. A
   * throw inside one of these callbacks has no caller to catch it (unlike
   * socket handlers, which withRoom wraps), so without this it would
   * propagate to the process as an uncaughtException and take down every
   * other room too. `label` is just for the log line - it's the only clue
   * available after the fact about which timer broke. */
  private safeTimeout(label: string, ms: number, fn: () => void): NodeJS.Timeout {
    return setTimeout(() => {
      try {
        fn();
      } catch (err) {
        log.error("room", "phase timer threw - closing this room", { code: this.code, timer: label, phase: this.phase, err: String(err) });
        if (err instanceof Error && err.stack) console.error(err.stack);
        this.onFatalError?.(err);
      }
    }, ms);
  }

  // ---------- State broadcasting ----------

  private hostId(): string {
    return [...this.players.values()].find((p) => p.isHost)?.id ?? "";
  }

  private buildStateFor(viewerId: string): RoomStateForClient {
    const viewer = this.players.get(viewerId);
    if (!viewer) throw new RoomError("NOT_IN_ROOM", "You're not in this room.");

    const judgeId = this.currentJudgeId();
    const players: PublicPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      connected: p.connected,
      isHost: p.isHost,
      score: p.score,
      wonBlackCardCount: p.wonBlackCards.length,
      isJudge: p.id === judgeId,
      hasSubmitted: this.hasNormalSubmission(p.id),
      isWildCard: p.isWildCard,
      personalCardsCount: p.personalCards.length,
    }));

    const state: RoomStateForClient = {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId(),
      houseRules: this.houseRules,
      winCondition: this.winCondition,
      deckOptions: this.deckOptions,
      handSize: this.handSize,
      doubleDownWindowSeconds: this.doubleDownWindowSeconds,
      doubleDownWindowEndsAt: this.doubleDownDeadline,
      personalCardsWindowMinutes: this.personalCardsWindowMinutes,
      personalCardsMaxCount: this.personalCardsMaxCount,
      personalCardsWindowEndsAt: this.personalCardsDeadline,
      actionCardDensity: this.actionCardDensity,
      dealtAt: this.dealtAt,
      tableScale: this.tableScale,
      blackCardScale: this.blackCardScale,
      spotlightScale: this.spotlightScale,
      scoreboardScale: this.scoreboardScale,
      tableStyle: this.tableStyle,
      roleNames: this.roleNames,
      packs: [...this.cardData.packs, ...getCustomSets().map(customSetToPackSummary)],
      selectedPackIds: this.selectedPackIds,
      excludedCardIds: [...this.excludedCardIds],
      players,
      blackCard: this.currentBlackCard,
      pendingJudgingMessage: this.pendingJudgingMessage,
      votingThisRound: this.isVotingRound(),
      hostClaimableAt: this.hostClaimableSince(),
      actionCardTiers: resolveTiers(this.actionCardTiers),
      actionCardTierWeights: this.actionCardTierWeights,
      roundHistory: this.roundHistory,
      you: {
        id: viewer.id,
        role: viewer.role,
        isJudge: viewer.id === judgeId,
        isHost: hasHostAuthority(viewer),
      },
    };

    if (viewer.role === "player") {
      state.yourHand = viewer.hand;
      state.youUsedHandRefresh = viewer.usedHandRefresh ?? false;
      const offer = this.pendingDoubleDown.get(viewer.id);
      if (offer) {
        const doubleDownOffer: DoubleDownOffer = {
          replacementCard: offer.replacementCard,
          eligible: isEligibleToWager(viewer),
          isActionCard: !!offer.replacementCard.actionCardId,
          wagered: offer.wagered,
        };
        state.yourDoubleDownOffer = doubleDownOffer;
      }
      // Any voting round, not just Crowd Favorite - a Democracy round needs
      // these too, or the voter can't be shown which card is their own (and
      // so can't be stopped from voting for it) or what they already voted for.
      if (this.isVotingRound()) {
        const ownEntry = [...this.submissions.entries()].find(([, s]) => s.playerId === viewer.id && !s.isDoubleDown);
        state.yourSubmissionId = ownEntry?.[0] ?? null;
        state.yourVote = this.votes.get(viewer.id) ?? null;
      }
      if (this.phase === "personalCards") {
        state.yourPersonalCards = viewer.personalCards;
      }
    }

    if (this.phase === "reveal" || this.phase === "judging") {
      // Everyone gets the board now, not just the Judge/Table - unrevealed
      // slots already come through with cards:null regardless of viewer,
      // so this only ever exposes what's already been flipped face-up for
      // everyone to see (a read-only "Table tab" on any player's phone).
      // Driving the board (reveal/shuffle/pick/spotlight) is still
      // restricted to Judge-or-Table via requireJudgeAuthority - broadening
      // what's sent doesn't broaden who can act on it.
      const board: JudgingCardSlot[] = this.judgingOrder.map((id) => {
        const revealed = this.revealedIds.has(id);
        return {
          submissionId: id,
          revealed,
          cards: revealed ? this.submissions.get(id)?.cards ?? [] : null,
        };
      });
      state.judgingBoard = board;
      state.shuffleLocked = this.phase === "judging";
      state.spotlightSubmissionId = this.spotlightId;
    }

    if (this.phase === "roundEnd" && this.lastRoundResult) {
      state.lastRound = this.lastRoundResult;
    }

    if (this.phase === "gameEnd" && this.finalResult) {
      state.finalResult = this.finalResult;
    }

    return state;
  }

  broadcast(): void {
    this.lastActivityAt = Date.now();
    for (const player of this.players.values()) {
      if (!player.connected || !player.socketId) continue;
      this.io.to(player.socketId).emit("roomState", this.buildStateFor(player.id));
    }
  }
}
