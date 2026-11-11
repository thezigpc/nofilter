import type { BlackCard, PackSummary, WhiteCard } from "./cards.js";
import type { ActionCardTier, ActionCardTierWeights } from "./actionCards.js";
import type { GameSetup, GameSetupPreset } from "./gameSetups.js";
import type { RoleNames } from "./roleNames.js";

export type Role = "player" | "table";

export type Phase =
  | "lobby"
  | "personalCards"
  | "dealing"
  | "submission"
  | "reveal"
  | "judging"
  | "roundEnd"
  | "gameEnd";

export interface HouseRules {
  wildCard: boolean;
  /** Off by default: Wild Card's own submission winning a round is normally a
   * no-op (no score, no won black card) so it can never win or end the
   * game on an inflated score. Turning this on makes Wild Card a real
   * competitor - it scores and can win/tie like anyone else. Meaningless
   * without wildCard also on. */
  wildCardCanScore: boolean;
  doubleDown: boolean;
  tradeIn: boolean;
  /** Once per game, discard your whole hand and draw a fresh one for free. */
  handRefresh: boolean;
  /** Hides the Scoreboard and disables the score-based auto game-end — only the host's End Game button ends it. */
  noScorekeeping: boolean;
  /** Lets the Judge write their own black card for the round instead of drawing one. */
  customPrompts: boolean;
  /** No Judge — every player submits, then everyone votes (excluding their own card) for the winner. */
  crowdFavorite: boolean;
  /** Automatically redraws your hand back to full (one card at a time) right after you submit, instead of requiring a manual Draw click. */
  autoDraw: boolean;
  /** When a new player joins mid-game, give them enough won black cards to match the lowest current player. */
  catchUpNewPlayers: boolean;
  /** After Start Game, everyone gets a timed window to write their own white cards before the first round - those cards get drawn before the shared deck for the rest of the game. */
  personalCards: boolean;
  /** On a pick-2+ round, every real player is auto-dealt one extra white card at Dealing (always auto-drawn, regardless of the Auto Draw setting) - compensation for the round costing more cards to submit. */
  pickBonus: boolean;
  /** Restricts the deck to pick-1 black cards only - no pick-2/3 prompts get dealt at all. */
  singleAnswerOnly: boolean;
  /** Mixes a small pool of special-effect Action Cards into the white-card draw pool (see shared/src/actionCards.ts). */
  actionCards: boolean;
}

/** "blackCards": first to `target` won black cards wins (the classic
 * game). "rounds": play exactly `target` rounds, then whoever is ahead
 * wins - a natural fit for a party where you want a known end time
 * rather than an open-ended race. */
export type WinConditionMode = "blackCards" | "rounds";

export interface WinCondition {
  mode: WinConditionMode;
  target: number; // black cards to win, or rounds to play
}

export interface DeckOptions {
  /** Drop cards whose text duplicates another selected pack's card (common across third-party packs). */
  excludeDuplicates: boolean;
  /** Drop cards matching a crude-language keyword filter (profanity/explicit sexual terms) - heuristic, not perfect. */
  excludeVulgar: boolean;
  /** Inverse of excludeVulgar, scoped to white cards only - keeps ONLY white cards matching the vulgar filter. Mutually exclusive with excludeVulgar (server-enforced). */
  vulgarOnly: boolean;
  /** Adds the server's shared custom-card pool (see CustomCardsData) on top of whatever packs are selected. */
  useCustomCards: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  wildCard: false,
  wildCardCanScore: false,
  doubleDown: false,
  tradeIn: false,
  handRefresh: false,
  noScorekeeping: false,
  customPrompts: false,
  crowdFavorite: false,
  autoDraw: true,
  catchUpNewPlayers: true,
  personalCards: false,
  pickBonus: false,
  singleAnswerOnly: false,
  actionCards: false,
};

export const DEFAULT_WIN_CONDITION: WinCondition = { mode: "blackCards", target: 7 };
export const DEFAULT_DECK_OPTIONS: DeckOptions = { excludeDuplicates: false, excludeVulgar: false, vulgarOnly: false, useCustomCards: false };
export const DEFAULT_HAND_SIZE = 10;

// How long the round pauses after everyone's submitted (with at least one
// live, unwagered Double Down offer on the table) before locking in and
// moving to Reveal — 0 skips the pause entirely (old instant behavior).
export const DEFAULT_DOUBLE_DOWN_WINDOW_SECONDS = 7;
export const MIN_DOUBLE_DOWN_WINDOW_SECONDS = 0;
export const MAX_DOUBLE_DOWN_WINDOW_SECONDS = 10;
export const MIN_HAND_SIZE = 4;
export const MAX_HAND_SIZE = 20;

// The Personal Cards window: after Start Game, everyone gets this long to
// write up to this many of their own white cards before the first round.
export const DEFAULT_PERSONAL_CARDS_WINDOW_MINUTES = 3;
export const MIN_PERSONAL_CARDS_WINDOW_MINUTES = 1;
export const MAX_PERSONAL_CARDS_WINDOW_MINUTES = 10;
export const DEFAULT_PERSONAL_CARDS_MAX_COUNT = 5;
export const MIN_PERSONAL_CARDS_MAX_COUNT = 1;
export const MAX_PERSONAL_CARDS_MAX_COUNT = 20;
// Once everybody has written their full allowance there is nothing left to
// wait for, but cutting straight to the first round is jarring and leaves
// no room to fix a typo - so the window collapses to this instead of
// running out the full timer.
export const PERSONAL_CARDS_GRACE_SECONDS = 10;

// How long a host has to be disconnected before any other connected player
// can take over. Mid-game disconnects deliberately keep your seat (and your
// host status) so a flaky phone does not cost you the room - but past this
// point a dead battery would otherwise leave nobody able to end the game,
// kick anyone, or hit Play Again.
export const HOST_CLAIM_AFTER_SECONDS = 120;

// The Table's shared-screen zoom level is room-level state (not per-device
// localStorage) so the active Judge can adjust it remotely from their own
// phone and the Table reflects it immediately.
export const DEFAULT_TABLE_SCALE = 1.35;
export const MIN_TABLE_SCALE = 0.8;
export const MAX_TABLE_SCALE = 2.2;

// The black card's own text size, independent of the overall Table zoom -
// lets the prompt read big and clear from across a room without also
// blowing up the judging grid/scoreboard around it.
export const DEFAULT_BLACK_CARD_SCALE = 2;
export const MIN_BLACK_CARD_SCALE = 0.7;
export const MAX_BLACK_CARD_SCALE = 2.5;

// The spotlight overlay's size (the big face-up card shown when a slot is
// tapped during Reveal/Judging), independent of tableScale/blackCardScale -
// same "usable in any phase, not just Lobby" model as blackCardScale.
export const DEFAULT_SPOTLIGHT_SCALE = 1;
export const MIN_SPOTLIGHT_SCALE = 0.6;
export const MAX_SPOTLIGHT_SCALE = 1.8;

// The bottom/sidebar Scoreboard's text size, independent of overall Table
// zoom - lets it read clearly from across a room without resizing anything
// else.
export const DEFAULT_SCOREBOARD_SCALE = 1;
export const MIN_SCOREBOARD_SCALE = 0.6;
export const MAX_SCOREBOARD_SCALE = 2;

export type TableTheme = "felt" | "bulletin" | "neon" | "site" | "techno" | "beach" | "parlour" | "synthwave" | "windward";

/** Themes whose visual identity depends on the reader always seeing a card
 * at full, spotlighted size - Parlour's fanned/overlapping hand hides each
 * card's covered edge in the ambient grid, so it only works if the room
 * can't be left in a state where that's the only view. Enforced server-side
 * in Room.updateTableStyle (spotlightEnabled is forced on and can't be
 * turned off while one of these is selected), not just a client hint. */
export const THEMES_REQUIRING_SPOTLIGHT: TableTheme[] = ["parlour"];

/** Every theme now has three background looks: a flat color (the plain
 * `--bg`), a gradient glow, and a fully drawn animated-capable scene (see
 * index.css's per-theme [data-table-theme] rules and
 * client/src/themeScenes.ts). Unlike the old backgroundGlow boolean this
 * doesn't need a per-theme "is this even defined" allowlist - every theme
 * has all three. */
export type BackgroundStyle = "flat" | "glow" | "scene";
export const BACKGROUND_STYLES: BackgroundStyle[] = ["flat", "glow", "scene"];

export type TableLayout = "dense" | "strip";

export const TABLE_LAYOUTS: TableLayout[] = ["dense", "strip"];

export const TABLE_LAYOUT_LABELS: Record<TableLayout, { name: string; desc: string }> = {
  dense: {
    name: "A · Dense Grid",
    desc: "Persistent sidebar scoreboard + pinned black-card banner + a submissions area that fills whatever space is left.",
  },
  strip: {
    name: "B · Command Strip",
    desc: "A persistent top strip showing round pacing — who's submitted, who hasn't — so the shared screen itself communicates status, not just the host's phone.",
  },
};

// The judging-grid's per-card size cap on the Shared Screen - null means
// uncapped (old fill-everything behavior).
export const MIN_MAX_CARD_SIZE = 160;
export const MAX_MAX_CARD_SIZE = 420;
export const MAX_CARD_SIZE_STEP = 10;
export const DEFAULT_MAX_CARD_SIZE = 330;

export const MIN_FACEDOWN_OPACITY = 20;
export const MAX_FACEDOWN_OPACITY = 100;
export const FACEDOWN_OPACITY_STEP = 5;
export const DEFAULT_FACEDOWN_OPACITY = 100;

export interface TableStyle {
  theme: TableTheme;
  accentIndex: number;
  spotlightEnabled: boolean;
  layout: TableLayout;
  maxCardSize: number | null;
  /** Taller, portrait-proportioned judging-grid cards with top-aligned
   * text, closer to a real card face than a squarish tile - see
   * client/src/useFillGrid.ts's CARD_MODE_ASPECT. Only reads as intended
   * with room to breathe, so the client auto-disables it (not the server -
   * this is a rendering choice, nothing to enforce) once the round has
   * more than MAX_CARD_MODE_SUBMISSIONS submissions. */
  cardMode: boolean;
  /** Which of the three background looks (see BackgroundStyle) this
   * theme renders as, on the Shared Screen always and on phones too when
   * mobileBackgroundEnabled is on. */
  backgroundStyle: BackgroundStyle;
  /** Only meaningful when backgroundStyle is "scene" - plays that scene's
   * CSS animations (see index.css's per-effect classes, all gated behind
   * this plus a `prefers-reduced-motion: no-preference` check so it's
   * never forced on a viewer who's asked their OS for less motion). Off
   * by default - a continuously-animating background is a bigger ask on
   * a screen people are staring at all game than the Shared Screen alone
   * ever was. */
  backgroundAnimated: boolean;
  /** The scene/glow backgrounds were designed for the Shared Screen, which
   * has real empty space around its fixed layout. A phone's hand view is
   * far more content-dense, so this is opt-in and off by default rather
   * than inheriting backgroundStyle automatically - see index.css's
   * `[data-mobile-bg="on"]` gate. */
  mobileBackgroundEnabled: boolean;
  /** 20-100 (percent). Lets a theme's background show through a
   * not-yet-revealed submission instead of being fully hidden behind it -
   * see index.css's `.flip-card-back`. 100 (fully opaque, today's look)
   * is the default; lower values only make a visible difference once
   * backgroundStyle is "glow" or "scene", but the setting itself is
   * independent of that choice. */
  facedownOpacity: number;
}

/** Above this many submissions in the judging grid, card-like sizing stops
 * being offered regardless of the room's own cardMode setting - portrait
 * cards lose their whole point once there isn't room to show them at a
 * real card's proportions. A rendering threshold, not a rule, so it lives
 * here as a plain constant rather than validated server-side. */
export const MAX_CARD_MODE_SUBMISSIONS = 8;

export interface TableAccent {
  color: string;
  name: string;
}

export const TABLE_THEME_ACCENTS: Record<TableTheme, TableAccent[]> = {
  felt: [
    { color: "#4c6fff", name: "Signal Blue" },
    { color: "#8b5cf6", name: "Violet" },
    { color: "#2dd4bf", name: "Teal" },
    { color: "#fb7185", name: "Rose" },
  ],
  bulletin: [
    { color: "#35c2c1", name: "Cool Teal" },
    { color: "#4d8dff", name: "Cool Blue" },
    { color: "#ffb020", name: "Amber" },
    { color: "#e0708a", name: "Muted Rose" },
  ],
  neon: [
    { color: "#ff2fb0", name: "Hot Pink" },
    { color: "#2af0ff", name: "Cyan" },
    { color: "#c6ff2a", name: "Acid Green" },
    { color: "#a855f7", name: "Ultraviolet" },
  ],
  site: [
    { color: "#d7ff2b", name: "Laser Yellow" },
    { color: "#ff7a1a", name: "Hazard Orange" },
    { color: "#ff3b1f", name: "Warning Red" },
    { color: "#35c7ff", name: "Toxic Cyan" },
  ],
  techno: [
    { color: "#00ffa3", name: "Laser Green" },
    { color: "#00d4ff", name: "Electric Blue" },
    { color: "#ff00e5", name: "Strobe Magenta" },
    { color: "#f4ff00", name: "Volt Yellow" },
  ],
  beach: [
    { color: "#ff6b4a", name: "Coral" },
    { color: "#ffb238", name: "Sun Gold" },
    { color: "#1f8f8a", name: "Turquoise" },
    { color: "#ff5c8a", name: "Hibiscus" },
  ],
  parlour: [
    { color: "#d98a3d", name: "Amber" },
    { color: "#7ea08a", name: "Sage" },
    { color: "#9c3d4a", name: "Claret" },
    { color: "#c9a253", name: "Brass" },
  ],
  synthwave: [
    { color: "#ff3ea5", name: "Sunset Pink" },
    { color: "#8b2fd9", name: "Laser Purple" },
    { color: "#22e0ff", name: "Chrome Cyan" },
    { color: "#ff8a3d", name: "Sunset Orange" },
  ],
  windward: [
    { color: "#c9a227", name: "Brass" },
    { color: "#b8433a", name: "Signal Red" },
    { color: "#4f9c94", name: "Sea Glass" },
    { color: "#ecdfc0", name: "Rope Tan" },
  ],
};

export const TABLE_THEME_LABELS: Record<TableTheme, { name: string; desc: string }> = {
  felt: { name: "Felt & Ink", desc: "Cool, on-brand, condensed type" },
  bulletin: { name: "Bulletin", desc: "Bold jumbotron, highest contrast" },
  neon: { name: "Neon", desc: "Black-light glow, hot pink & cyan" },
  site: { name: "Construction Zone", desc: "Hazard stripes, warehouse rig, sharp corners" },
  techno: { name: "Techno", desc: "Minimal digital club, laser accents" },
  beach: { name: "Beach", desc: "Sun-bleached and bright, not dark like the rest" },
  parlour: { name: "Parlour", desc: "Lamp-lit fanned hand — requires Spotlight" },
  synthwave: { name: "Synthwave", desc: "80s sunset gradient, chrome accents" },
  windward: { name: "Windward", desc: "Brass and rope, a moonlit sea" },
};

export const DEFAULT_TABLE_STYLE: TableStyle = {
  theme: "bulletin",
  accentIndex: 0,
  spotlightEnabled: true,
  layout: "strip",
  maxCardSize: DEFAULT_MAX_CARD_SIZE,
  cardMode: false,
  backgroundStyle: "glow",
  backgroundAnimated: false,
  mobileBackgroundEnabled: false,
  facedownOpacity: DEFAULT_FACEDOWN_OPACITY,
};

/** A saved Table look, shared server-side (not per-browser) so it's the
 * same list whether you're on the host's phone, the Table, or the
 * standalone Template Editor on any device. */
export interface TableStylePreset {
  name: string;
  tableStyle: TableStyle;
  tableScale?: number;
  blackCardScale?: number;
  spotlightScale?: number;
  scoreboardScale?: number;
}

/** Host-submitted card content, stored server-side (not per-room) like
 * Table Style presets — the same list on any device, opted into per-room
 * via DeckOptions.useCustomCards. */
export interface CustomWhiteCard {
  id: string;
  text: string;
}

export interface CustomBlackCard {
  id: string;
  text: string;
  pick: number;
}

export interface CustomCardsData {
  white: CustomWhiteCard[];
  black: CustomBlackCard[];
}

/** A named, individually-selectable pack of host-submitted cards - unlike
 * CustomCardsData's one loose pool (opted into whole via
 * DeckOptions.useCustomCards), a room picks specific Custom Sets the same
 * way it picks any real pack, via selectedPackIds (see
 * server/src/customSets/store.ts and Room.buildDecks()). */
export interface CustomSet {
  id: string;
  name: string;
  white: CustomWhiteCard[];
  black: CustomBlackCard[];
}

/** The bundled sample pack ships in the repo so a fresh deploy has
 * something playable; "uploaded_core_set" means an admin has since
 * replaced/added to it through the admin panel; "env_override" means the
 * deployment pins CARD_DATA_PATH itself (e.g. today's Windows production
 * pointing at a full third-party corpus that isn't checked into git) - in
 * that case `locked` is true and uploads are refused, since the env var
 * always wins on the next restart anyway. */
export interface CoreSetInfo {
  source: "bundled_sample" | "uploaded_core_set" | "env_override";
  totalPacks: number;
  totalWhite: number;
  totalBlack: number;
  locked: boolean;
  /** Distinct categories currently in play, sorted - lets the client offer
   * them as merge targets in the section mapper (CoreSetPanel) without a
   * separate round-trip, and seeds the dynamic pack-browser/Lobby filter
   * chips (client/src/packGrouping.ts). Never includes Custom Sets - those
   * stay their own always-separate section regardless of category. */
  categories: string[];
}

export interface CoreSetUploadReport {
  packsAdded: number;
  totalPacks: number;
  whiteAdded: number;
  blackAdded: number;
  cardsRepaired: number;
  cardsDropped: number;
}

export interface UploadCoreSetPack {
  name: string;
  /** Resolved client-side before upload (CoreSetPanel's section mapper
   * assigns every pack a category, merging near-duplicate raw labels under
   * admin review) - so by the time this reaches the server, no further
   * inference is needed. Still trimmed/defaulted server-side as a safety
   * net for direct API use. */
  category?: string;
  white?: { text: string }[];
  black?: { text: string; pick?: number }[];
}

export interface UploadCoreSetRequest {
  mode: "add" | "replace";
  packs: UploadCoreSetPack[];
}

/** A named, saved pack selection (e.g. "Muggles and Childhood only") - the
 * same global/shared-across-devices model as Table Style presets, just
 * saving selectedPackIds instead of a TableStyle. Upserted by name.
 * excludedCardIds is authored only while building/editing a preset (the
 * main-screen preset builder) - a room never exposes its own live
 * exclude-a-card toggle, it just enforces whatever a preset carries once
 * applied. */
export interface PackSelectionPreset {
  name: string;
  packIds: string[];
  excludedCardIds: string[];
}

/** What the /admin room-management page sees about each active room -
 * never sent to a non-admin client. Matches Room.getAdminSummary(). */
export interface RoomAdminSummary {
  code: string;
  phase: Phase;
  playerCount: number;
  connectedCount: number;
  lastActivityAt: number;
}

/** Shown as the browser tab title and the HomePage heading until an admin
 * overrides it (server/src/gameName/store.ts) - deliberately not
 * hardcoded in the client, since a self-hosted deployment shouldn't be
 * stuck with this project's own name. */
export const DEFAULT_GAME_NAME = "No Filter";

export function minPlayersToStart(houseRules: HouseRules): number {
  // Crowd Favorite needs a real contest to vote on - everyone submits, so
  // Wild Card covering "one submitter slot" doesn't shrink the floor the same
  // way it does for a normal Judge-judged round.
  if (houseRules.crowdFavorite) return 3;
  // One Judge plus at least this many submitters (Wild Card covers one submitter slot).
  return houseRules.wildCard ? 2 : 3;
}

/** Once a game is underway, a voluntary leave that drops real (non-Wild Card)
 * players below this floor ends the game immediately on current standings.
 * Mirrors minPlayersToStart's exact logic (Crowd Favorite needs 3 real
 * voters, Wild Card covers one submitter slot down to 2) - this
 * used to be a flat constant of 3 regardless of house rules, which meant a
 * 3-real-player Wild Card game that lost one player to a leave was force-ended
 * even though a brand new room could have started fresh at 2 with the same
 * rules on. Kept as a separate function (not a re-export of
 * minPlayersToStart) since "can this room start" and "can this room keep
 * going" are conceptually different questions that just happen to share a
 * formula today. */
export function minPlayersToContinue(houseRules: HouseRules): number {
  return minPlayersToStart(houseRules);
}

/** What every client sees about every player — never includes hand contents. */
export interface PublicPlayer {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
  isHost: boolean;
  score: number;
  wonBlackCardCount: number;
  isJudge: boolean;
  /** True once this player has a lineup entry in for the current round. */
  hasSubmitted: boolean;
  isWildCard?: boolean;
  /** How many personal cards this player has written so far - a count
   * only, never the text, so other viewers get ambient progress ("3/5")
   * without seeing anyone else's private submissions. Only meaningful
   * during the personalCards phase. */
  personalCardsCount?: number;
}

/**
 * One lineup slot on the judging board, sent only to the Judge and the Table
 * (see CLAUDE.md: everyone else just waits and finds out at RoundEnd).
 * Cards are null until the Judge/Table has actually flipped that slot.
 */
export interface JudgingCardSlot {
  submissionId: string;
  revealed: boolean;
  cards: WhiteCard[] | null;
}

/** Sent only at RoundEnd, once the mystery is over. */
export interface RoundResult {
  winningSubmissionId: string;
  winningPlayerId: string;
  winningPlayerName: string;
  cards: WhiteCard[];
  blackCard: BlackCard;
  doubleDownResults: {
    playerId: string;
    playerName: string;
    won: boolean;
  }[];
}

export interface GameResult {
  /** More than one entry means a tie for first place - every top scorer, not just one. */
  winnerPlayerIds: string[];
  winnerNames: string[];
  finalScores: { playerId: string; name: string; score: number }[];
}

export interface DoubleDownOffer {
  /** The replacement card dealt after the player's normal submission, eligible to be wagered. */
  replacementCard: WhiteCard;
  /** Whether the player currently holds a won black card to spend as the wager. */
  eligible: boolean;
  /** True when the replacement card is an Action Card, not a joke card - it
   * can't be wagered (submitting it would hand the Judge an Action Card's
   * name/description as an "answer"), but it's still a normal hand card
   * otherwise and can be played the usual way. */
  isActionCard: boolean;
  /** Whether they've already wagered this round. */
  wagered: boolean;
}

/** Full room snapshot, tailored per-recipient by the server before sending. */
export interface RoomStateForClient {
  code: string;
  phase: Phase;
  hostId: string;
  houseRules: HouseRules;
  winCondition: WinCondition;
  deckOptions: DeckOptions;
  handSize: number;
  doubleDownWindowSeconds: number;
  /** Epoch ms the current Double Down window closes, while one is running (Submission phase only). */
  doubleDownWindowEndsAt?: number | null;
  personalCardsWindowMinutes: number;
  personalCardsMaxCount: number;
  /** Whole-number percent (3 = 3%) of the white deck seeded as Action Cards when houseRules.actionCards is on. */
  actionCardDensity: number;
  /** Epoch ms the personalCards writing window closes, while one is running. */
  personalCardsWindowEndsAt?: number | null;
  /** Epoch ms the current round was dealt - drives the "waiting Xm" display per un-submitted player. */
  dealtAt: number;
  tableScale: number;
  blackCardScale: number;
  spotlightScale: number;
  scoreboardScale: number;
  tableStyle: TableStyle;
  /** What this room calls the Judge and the Wild Card bot. Every
   * player-visible mention of either role reads from here. */
  roleNames: RoleNames;
  packs: PackSummary[];
  selectedPackIds: string[];
  /** Only ever populated by applying a saved PackSelectionPreset - not a
   * live, room-editable toggle. */
  excludedCardIds: string[];
  players: PublicPlayer[];
  blackCard: BlackCard | null;
  /** Set by a played "flavor"-shape Action Card (see shared/src/actionCards.ts) - a judging-time instruction for the Judge, shown near the black card during reveal/judging. Cleared at finishRound(). */
  pendingJudgingMessage: string | null;
  /** Per-card frequency for Action Cards (see shared/src/actionCards.ts).
   * Always covers every card in ACTION_CARD_DEFS. */
  actionCardTiers: Record<string, ActionCardTier>;
  /** What the tier names are worth, relative to each other. Room-level
   * override of the server defaults; intentionally not shown on the
   * shared screen. */
  actionCardTierWeights: ActionCardTierWeights;
  /** True when this round is decided by a vote rather than by the Judge -
   * either because Crowd Favorite is on for the whole game, or because
   * someone played the Democracy Action Card this round. Clients branch on
   * this (not houseRules.crowdFavorite) for anything judging-related.
   * Who *submits* is unaffected: the Judge still sits the round out. */
  votingThisRound: boolean;
  /** When a disconnected host becomes claimable by anyone else, or null if
   * the host is present. Clients count down to it; the server enforces it. */
  hostClaimableAt: number | null;

  /** Only present for the recipient's own seat, when role === 'player'. */
  yourHand?: WhiteCard[];
  yourDoubleDownOffer?: DoubleDownOffer | null;
  /** Whether this player has used their once-per-game Hand Refresh yet. */
  youUsedHandRefresh?: boolean;
  /** This round's submissionId belonging to the viewer, if any — lets the
   * client disable voting for your own card in Crowd Favorite mode without
   * revealing anyone else's ownership. */
  yourSubmissionId?: string | null;
  /** Who the viewer voted for this round, in Crowd Favorite mode — re-castable until the round resolves. */
  yourVote?: string | null;
  /** Only present for the recipient's own seat during the personalCards phase - the cards they've written so far. */
  yourPersonalCards?: WhiteCard[];

  /** Only present during reveal/judging, and only sent to the Judge or the Table. */
  judgingBoard?: JudgingCardSlot[];
  /** Whether the recipient (Judge or Table) may still shuffle — locked once any card is revealed. */
  shuffleLocked?: boolean;
  /** Server-synced so the spotlight opens/closes together on the Table and
   * the Judge's own phone, whichever one triggers it — not per-client local
   * state. Only present alongside judgingBoard. */
  spotlightSubmissionId?: string | null;

  /** Only present during roundEnd. */
  lastRound?: RoundResult;

  /** Every round decided so far this game, most-recent-first — reset on startGame()/playAgain(). */
  roundHistory: RoundResult[];

  /** Only present during gameEnd. */
  finalResult?: GameResult;

  you: {
    id: string;
    role: Role;
    isJudge: boolean;
    isHost: boolean;
  };
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// ---- Client -> Server ----

export interface CreateRoomRequest {
  name: string;
  role: Role;
}

/** Mirrors @bargames/sdk's CastTargets/CastResult, so shared needn't depend
 * on the SDK. Only meaningful on a Bar Games box. */
export interface CastTargetsLike {
  enabled: boolean;
  pinRequired: boolean;
  displays: { id: string; name: string; group?: string; busy: boolean; showingThisGame: boolean; roomCode?: string }[];
}
export interface CastResultLike {
  ok: boolean;
  message?: string;
  results?: Record<string, { ok: boolean; message?: string; needsCode?: boolean }>;
}

export interface JoinRoomRequest {
  roomCode: string;
  name: string;
  role: Role;
  token?: string;
  /** Bar Games venue rooms only: the key from the box's "host controls"
   * link. A Table joining with it gets host authority (see Room.venueKey). */
  venueKey?: string;
}

export interface JoinAck {
  ok: true;
  token: string;
  roomCode: string;
}

export interface JoinAckError {
  ok: false;
  error: ErrorPayload;
}

export interface UpdatePackSelectionRequest {
  packIds: string[];
}

/** Bulk-replace, same shape as UpdatePackSelectionRequest - set only ever
 * gets written by applying a saved PackSelectionPreset (see Lobby.tsx),
 * never edited live in the room itself. */
export interface UpdateExcludedCardsRequest {
  cardIds: string[];
}

export interface UpdateHouseRulesRequest {
  houseRules: Partial<HouseRules>;
}

export interface SetActionCardTierRequest {
  cardId: string;
  tier: ActionCardTier;
}

export interface SetActionCardTierWeightsRequest {
  rare?: number;
  normal?: number;
  common?: number;
}

export interface UpdateWinConditionRequest {
  target: number;
  /** Omitted leaves the current mode alone, so existing callers that only
   * change the number keep working. */
  mode?: WinConditionMode;
}

export interface UpdateDeckOptionsRequest {
  deckOptions: Partial<DeckOptions>;
}

export interface UpdateHandSizeRequest {
  value: number;
}

export interface UpdateDoubleDownWindowRequest {
  value: number;
}

export interface UpdatePersonalCardsSettingsRequest {
  windowMinutes?: number;
  maxCount?: number;
}

export interface AddPersonalCardRequest {
  text: string;
}

export interface RemovePersonalCardRequest {
  cardId: string;
}

export interface SubmitCustomBlackCardRequest {
  text: string;
  pick: number;
}

export interface VoteForSubmissionRequest {
  submissionId: string;
}

export interface SubmitCardsRequest {
  cardIds: string[];
}

export interface JudgePickRequest {
  submissionId: string;
}

export interface RevealSubmissionRequest {
  submissionId: string;
}

export interface SpotlightSubmissionRequest {
  submissionId: string;
}

export interface TradeInCardsRequest {
  cardIds: string[];
}

export interface PlayActionCardRequest {
  cardId: string;
  /** Required for "target"/"targetAndGive" shape cards. */
  targetPlayerId?: string;
  /** Required for "targetAndGive" shape cards - the actor's own hand card being handed over. */
  giveCardId?: string;
}

export interface SetActionCardDensityRequest {
  value: number;
}

export interface KickPlayerRequest {
  playerId: string;
}

export interface ExcusePlayerThisRoundRequest {
  playerId: string;
}

export interface TransferHostRequest {
  playerId: string;
}

export interface AdjustTableScaleRequest {
  delta: number;
}

export interface UpdateTableStyleRequest {
  tableStyle: Partial<TableStyle>;
}

/** Absolute set, for applying a saved starting size (e.g. a preset) during Lobby — distinct from the delta-based in-round `adjustTableScale`. */
export interface SetTableScaleRequest {
  value: number;
}

export interface SetBlackCardScaleRequest {
  value: number;
}

export interface SetSpotlightScaleRequest {
  value: number;
}

export interface SetScoreboardScaleRequest {
  value: number;
}

export interface SaveTableStylePresetRequest {
  preset: TableStylePreset;
}

export interface DeleteTableStylePresetRequest {
  name: string;
}

export interface SavePackSelectionPresetRequest {
  preset: PackSelectionPreset;
}

export interface DeletePackSelectionPresetRequest {
  name: string;
}

export interface AddCustomWhiteCardRequest {
  text: string;
}

export interface AddCustomBlackCardRequest {
  text: string;
  pick: number;
}

export interface DeleteCustomCardRequest {
  id: string;
}

export interface UploadCustomCardsRequest {
  white?: { text: string }[];
  black?: { text: string; pick?: number }[];
}

export interface CreateCustomSetRequest {
  name: string;
  white?: { text: string }[];
  black?: { text: string; pick?: number }[];
}

export interface AddCustomSetWhiteCardRequest {
  setId: string;
  text: string;
}

export interface AddCustomSetBlackCardRequest {
  setId: string;
  text: string;
  pick: number;
}

export interface DeleteCustomSetCardRequest {
  setId: string;
  cardId: string;
}

export interface DeleteCustomSetRequest {
  setId: string;
}

export interface PreviewPackRequest {
  packId: string;
}

/** Every white/black card in one pack, for the Lobby's pack-preview modal -
 * not sent as part of RoomStateForClient (only PackSummary counts are),
 * fetched on demand since most packs are never previewed in a given room. */
export interface PackContents {
  white: WhiteCard[];
  black: BlackCard[];
}

export interface ClientToServerEvents {
  createRoom: (req: CreateRoomRequest, cb: (res: JoinAck | JoinAckError) => void) => void;
  joinRoom: (req: JoinRoomRequest, cb: (res: JoinAck | JoinAckError) => void) => void;
  updatePackSelection: (req: UpdatePackSelectionRequest) => void;
  updateExcludedCards: (req: UpdateExcludedCardsRequest) => void;
  updateHouseRules: (req: UpdateHouseRulesRequest) => void;
  updateRoleNames: (req: { roleNames: Partial<RoleNames> }) => void;
  /** Bar Games casting, host only. Off a box: enabled false, no network. */
  listTvs: (cb: (targets: CastTargetsLike) => void) => void;
  castToTvs: (req: { ids: string[]; pin?: string }, cb: (res: CastResultLike) => void) => void;
  stopTvs: (req: { ids: string[]; pin?: string }, cb: (res: CastResultLike) => void) => void;
  updateWinCondition: (req: UpdateWinConditionRequest) => void;
  applyGameSetup: (req: { setup: GameSetup }) => void;
  listGameSetupPresets: (cb: (presets: GameSetupPreset[]) => void) => void;
  saveGameSetupPreset: (req: { name: string }, cb: (presets: GameSetupPreset[]) => void) => void;
  deleteGameSetupPreset: (req: { name: string }, cb: (presets: GameSetupPreset[]) => void) => void;
  // Admin session for the shared content library (custom cards, sets,
  // presets, Core Set, game name) AND the /admin room-management page - one
  // login, one token pool, both surfaces (server/src/admin/auth.ts). Card
  // library reads stay open so a host can still browse packs; room
  // management has no anonymous-read case (see adminListRooms below), so
  // every one of its events requires isAdmin already set on the socket.
  adminLogin: (req: { password: string }, cb: (res: { ok: boolean; token?: string; error?: string }) => void) => void;
  adminResume: (req: { token: string }, cb: (res: { ok: boolean }) => void) => void;
  adminLogout: (req: { token: string }) => void;
  adminStatus: (cb: (res: { configured: boolean; isAdmin: boolean; setupNeeded: boolean }) => void) => void;
  /** First-run only - see server/src/admin/auth.ts's completeSetup(). Logs
   * the completer in immediately on success, same as adminLogin. */
  adminCompleteSetup: (
    req: { password: string; confirm: string },
    cb: (res: { ok: boolean; error?: string; token?: string }) => void
  ) => void;
  adminListRooms: (cb: (res: { ok: boolean; error?: string; rooms?: RoomAdminSummary[] }) => void) => void;
  adminCloseRoom: (req: { code: string }, cb: (res: { ok: boolean }) => void) => void;
  adminCloseAllRooms: (cb: (res: { ok: boolean; count: number }) => void) => void;
  claimHost: () => void;
  unsubmitCards: () => void;
  setActionCardTier: (req: SetActionCardTierRequest) => void;
  setActionCardTierWeights: (req: SetActionCardTierWeightsRequest) => void;
  updateDeckOptions: (req: UpdateDeckOptionsRequest) => void;
  updateTableStyle: (req: UpdateTableStyleRequest) => void;
  updateHandSize: (req: UpdateHandSizeRequest) => void;
  updateDoubleDownWindow: (req: UpdateDoubleDownWindowRequest) => void;
  updatePersonalCardsSettings: (req: UpdatePersonalCardsSettingsRequest) => void;
  addPersonalCard: (req: AddPersonalCardRequest) => void;
  removePersonalCard: (req: RemovePersonalCardRequest) => void;
  startGame: () => void;
  endGame: () => void;
  /** Host-only, any phase — closes the room outright, kicking every connected player back to the main menu (same path as the admin "close room" action and the idle-timeout sweep). */
  closeRoom: () => void;
  /** Host-only, gameEnd phase only — resets scores/hands/won black cards and returns to the Lobby with the same players and settings. */
  playAgain: () => void;
  skipBlackCard: () => void;
  /** Host or the current Judge — bows out of judging this round, handing it to the next player in rotation and redealing. */
  skipJudgeTurn: () => void;
  /** Host-only — excuses one slow/AFK player from being required to submit this round only, letting the round advance without them. */
  excusePlayerThisRound: (req: ExcusePlayerThisRoundRequest) => void;
  submitCustomBlackCard: (req: SubmitCustomBlackCardRequest) => void;
  setBlackCardScale: (req: SetBlackCardScaleRequest) => void;
  setSpotlightScale: (req: SetSpotlightScaleRequest) => void;
  setScoreboardScale: (req: SetScoreboardScaleRequest) => void;
  drawCards: () => void;
  refreshHand: () => void;
  submitCards: (req: SubmitCardsRequest) => void;
  wagerDoubleDown: () => void;
  tradeInCards: (req: TradeInCardsRequest) => void;
  playActionCard: (req: PlayActionCardRequest) => void;
  setActionCardDensity: (req: SetActionCardDensityRequest) => void;
  shuffleSubmissions: () => void;
  revealSubmission: (req: RevealSubmissionRequest) => void;
  spotlightSubmission: (req: SpotlightSubmissionRequest) => void;
  clearSpotlight: () => void;
  judgePick: (req: JudgePickRequest) => void;
  voteForSubmission: (req: VoteForSubmissionRequest) => void;
  leaveRoom: () => void;
  kickPlayer: (req: KickPlayerRequest) => void;
  transferHost: (req: TransferHostRequest) => void;
  adjustTableScale: (req: AdjustTableScaleRequest) => void;
  setTableScale: (req: SetTableScaleRequest) => void;
  /** Global, not room-scoped — the same list from any device (host phone, Table, standalone editor). */
  listTableStylePresets: (cb: (presets: TableStylePreset[]) => void) => void;
  saveTableStylePreset: (req: SaveTableStylePresetRequest, cb: (presets: TableStylePreset[]) => void) => void;
  deleteTableStylePreset: (req: DeleteTableStylePresetRequest, cb: (presets: TableStylePreset[]) => void) => void;
  /** Global, not room-scoped — same trust model as presets. */
  listCustomCards: (cb: (data: CustomCardsData) => void) => void;
  addCustomWhiteCard: (req: AddCustomWhiteCardRequest, cb: (data: CustomCardsData) => void) => void;
  addCustomBlackCard: (req: AddCustomBlackCardRequest, cb: (data: CustomCardsData) => void) => void;
  deleteCustomCard: (req: DeleteCustomCardRequest, cb: (data: CustomCardsData) => void) => void;
  uploadCustomCards: (req: UploadCustomCardsRequest, cb: (data: CustomCardsData) => void) => void;
  /** Global, not room-scoped — same trust model as the loose custom-cards
   * pool above, but each set is individually selectable per-room like a
   * real pack (see Room.buildDecks()), not opted into as a whole. */
  listCustomSets: (cb: (sets: CustomSet[]) => void) => void;
  createCustomSet: (req: CreateCustomSetRequest, cb: (sets: CustomSet[]) => void) => void;
  addCustomSetWhiteCard: (req: AddCustomSetWhiteCardRequest, cb: (sets: CustomSet[]) => void) => void;
  addCustomSetBlackCard: (req: AddCustomSetBlackCardRequest, cb: (sets: CustomSet[]) => void) => void;
  deleteCustomSetCard: (req: DeleteCustomSetCardRequest, cb: (sets: CustomSet[]) => void) => void;
  deleteCustomSet: (req: DeleteCustomSetRequest, cb: (sets: CustomSet[]) => void) => void;
  /** Global, not room-scoped — same trust model as Table Style presets.
   * Saved from a room's Lobby (where an active selection exists to save),
   * but listable/deletable from anywhere, e.g. the standalone Custom Cards
   * page. */
  listPackSelectionPresets: (cb: (presets: PackSelectionPreset[]) => void) => void;
  savePackSelectionPreset: (req: SavePackSelectionPresetRequest, cb: (presets: PackSelectionPreset[]) => void) => void;
  deletePackSelectionPreset: (req: DeletePackSelectionPresetRequest, cb: (presets: PackSelectionPreset[]) => void) => void;
  /** Global, not room-scoped — pack contents come from the server's shared
   * card-data singleton (already indexed by pack id for buildDecks()), not
   * per-room state. */
  previewPack: (req: PreviewPackRequest, cb: (data: PackContents | null) => void) => void;
  /** Global, not room-scoped — the full merged pack list (static packs +
   * live Custom Sets), same shape as RoomStateForClient.packs, for the
   * main-screen preset builder which has no room/state of its own. */
  listAllPacks: (cb: (packs: PackSummary[]) => void) => void;
  /** Global, not room-scoped — what card data this deployment is currently
   * running on (bundled sample / an uploaded Core Set / an env override). */
  getCoreSetInfo: (cb: (info: CoreSetInfo) => void) => void;
  /** Note: uploading a Core Set is NOT here — it's `POST /api/core-set`,
   * because a real card set is far larger than socket.io's per-message
   * cap. See server/src/index.ts. UploadCoreSetRequest/CoreSetUploadReport
   * describe that route's body and response. */
  /** Admin-only. The name itself is also readable, unauthenticated, via a
   * plain GET /api/config on the main server - see server/src/index.ts -
   * so the browser tab title and HomePage heading can be set before any
   * socket connection exists. */
  setGameName: (req: { name: string }, cb: (res: { ok: boolean; error?: string; name?: string }) => void) => void;
  /** Admin-only. The Judge/Wild Card names every new room starts with.
   * Readable, unauthenticated, via GET /api/config. */
  setDefaultRoleNames: (
    req: { roleNames: RoleNames },
    cb: (res: { ok: boolean; error?: string; roleNames?: RoleNames }) => void
  ) => void;
  /** Admin-only. Sets the theme/accent/background look a brand new room
   * starts with, and that HomePage/Card Management/the admin page
   * themselves render with - those have no room of their own to inherit a
   * look from. Also readable, unauthenticated, via GET /api/config, for
   * the same before-any-socket-connection reason as the game name. */
  setDefaultTheme: (
    req: {
      theme: TableTheme;
      accentIndex: number;
      backgroundStyle: BackgroundStyle;
      backgroundAnimated: boolean;
      mobileBackgroundEnabled: boolean;
      facedownOpacity: number;
    },
    cb: (
      res: {
        ok: boolean;
        error?: string;
        theme?: TableTheme;
        accentIndex?: number;
        backgroundStyle?: BackgroundStyle;
        backgroundAnimated?: boolean;
        mobileBackgroundEnabled?: boolean;
        facedownOpacity?: number;
      }
    ) => void
  ) => void;
}

// ---- Server -> Client ----

export interface ServerToClientEvents {
  roomState: (state: RoomStateForClient) => void;
  errorMessage: (err: ErrorPayload) => void;
  kicked: (reason: ErrorPayload) => void;
  /** Broadcast to every connected client whenever the shared preset list changes. */
  tableStylePresetsUpdated: (presets: TableStylePreset[]) => void;
  /** Broadcast to every connected client whenever the shared pack-selection preset list changes. */
  packSelectionPresetsUpdated: (presets: PackSelectionPreset[]) => void;
  /** Private, one-off result from playing an Action Card (e.g. Peek's reveal) - sent only to the player who played it. */
  actionCardResult: (payload: { message: string }) => void;
}
