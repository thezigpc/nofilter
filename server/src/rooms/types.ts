import type { BlackCard, HouseRules, Phase, Role, WhiteCard, WinCondition } from "@tabletop-judge/shared";

export interface ServerPlayer {
  id: string;
  token: string;
  name: string;
  role: Role;
  socketId: string | null;
  connected: boolean;
  /** When this player last dropped, or null while connected. Used to decide
   * when a disconnected host has been gone long enough for someone else to
   * claim host (see Room.claimHost). */
  disconnectedAt?: number | null;
  isHost: boolean;
  /** Venue rooms only (Bar Games): a Table that joined with the room's
   * venue key - the staff iPad opened from the box's "host controls" link.
   * Holds host authority without being a seat (no hand, no Judge turn). */
  isVenueController?: boolean;
  isWildCard?: boolean;
  hand: WhiteCard[];
  score: number;
  /** Currency for Double Down — black cards won in previous rounds. */
  wonBlackCards: BlackCard[];
  /** Once-per-game Hand Refresh, reset at startGame(). */
  usedHandRefresh?: boolean;
  /** As-written record of this player's personal cards (Personal Cards house rule), in submission order. Reset at resetToLobby(). */
  personalCards: WhiteCard[];
  /** Shuffled draw-from stash, populated once when the writing window closes - drawn from before the shared deck until exhausted. */
  personalDeck: WhiteCard[];
}

export interface SubmissionEntry {
  submissionId: string;
  playerId: string;
  cards: WhiteCard[];
  isDoubleDown: boolean;
  /** Only set on the double-down entry; returned to the player if it wins, lost to the box if not. */
  stakedBlackCard?: BlackCard;
}

export interface DoubleDownPendingOffer {
  replacementCard: WhiteCard;
  wagered: boolean;
}

export interface RoomSnapshotInternal {
  code: string;
  phase: Phase;
  houseRules: HouseRules;
  winCondition: WinCondition;
  selectedPackIds: string[];
}
