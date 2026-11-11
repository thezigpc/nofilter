export interface WhiteCard {
  id: string;
  text: string;
  pack: string;
  /** Set only for Action Card instances (see shared/src/actionCards.ts) - references an ActionCardDef.id. Everything else treats these as ordinary WhiteCards (hand size, discard, Auto Draw, etc.) except the two places that need to know the difference: Room.playActionCard and the client's hand renderer. */
  actionCardId?: string;
}

export interface BlackCard {
  id: string;
  text: string;
  pick: number;
  pack: string;
}

export interface PackSummary {
  id: string;
  name: string;
  /** Freeform, admin-chosen at upload time (see server/src/cards/coreSet.ts
   * and CoreSetPanel's section mapper) - not a fixed enum, since a Core Set
   * can carry whatever sections its uploader gave it ("Community",
   * "Homebrew", a legacy "Official" fallback for old-schema files, etc.).
   * Always non-empty; falls back to "Uncategorized". */
  category: string;
  whiteCount: number;
  blackCount: number;
  /** True only for synthetic Custom Set entries (see server/src/customSets/store.ts) - lets the client group them separately from category-based sections without guessing from id shape. */
  isCustomSet?: boolean;
}
