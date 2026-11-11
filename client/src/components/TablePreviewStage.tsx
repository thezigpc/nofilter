import { useEffect, useState } from "react";
import type { BlackCard, JudgingCardSlot, PublicPlayer, RoomStateForClient, RoundResult, TableStyle, WhiteCard } from "@tabletop-judge/shared";
import {
  DEFAULT_ROLE_NAMES,
  DEFAULT_ACTION_CARD_DENSITY,
  DEFAULT_DECK_OPTIONS,
  DEFAULT_DOUBLE_DOWN_WINDOW_SECONDS,
  DEFAULT_HAND_SIZE,
  DEFAULT_HOUSE_RULES,
  DEFAULT_PERSONAL_CARDS_MAX_COUNT,
  DEFAULT_PERSONAL_CARDS_WINDOW_MINUTES,
  DEFAULT_WIN_CONDITION,
  TABLE_THEME_ACCENTS,
} from "@tabletop-judge/shared";
import Scoreboard from "./Scoreboard.js";
import ThemeScene from "./ThemeScene.js";
import TableDenseLayout from "./TableDenseLayout.js";
import TableCommandStripLayout from "./TableCommandStripLayout.js";
import { BackArrowIcon, RulerIcon, SearchIcon, TrophyIcon } from "./Icons.js";
import RoundEndView from "./RoundEndView.js";

const SAMPLE_WHITE_TEXTS = [
  "A tiny horse in a big hat.",
  "Winning the lottery, then immediately losing the ticket.",
  "My inability to read the room.",
  "A well-timed dad joke.",
  "The sound a printer makes at 2am.",
  "Committing fully to a bit nobody asked for.",
  "An extremely aggressive game of Uno.",
  "Three raccoons in a trench coat, applying for a mortgage.",
  "A haunted Roomba.",
  "Accidentally replying-all to the entire company with a meme.",
  "A motivational poster that's secretly just a threat.",
  "The unbearable weight of a group chat that won't die.",
  "A wizard who only knows one spell, and it's mediocre.",
  "An interpretive dance about capitalism.",
  "A goose with a grudge.",
];

// Deliberately long, to stress-test dynamic font sizing/wrapping — the
// last slot always gets this, and "Test a long card" reveals it directly.
const LONG_SAMPLE_TEXT =
  "Explaining cryptocurrency to your grandmother for the third time this week, complete with hand-drawn diagrams, a whiteboard, and a strongly-worded follow-up email nobody asked for.";

const LONG_PROMPT_TEXT =
  "A prompt so overwrought and needlessly specific that it makes you question who actually writes these cards, featuring at least three subordinate clauses and a semicolon nobody asked for: _.";

const BLACK_PROMPTS: Record<1 | 2 | 3, string> = {
  1: "A totally reasonable request: please pass the _.",
  2: "The secret to a happy life: _ and _.",
  3: "Grandma's famous recipe calls for _, _, and _.",
};

const PREVIEW_PLAYER_NAMES = [
  "Marcus", "Priya", "Jonah", "Dee", "Sam", "Alex", "Robin", "Kai", "Frankie", "Blair",
  "Noor", "Theo", "Wren", "Milo", "Zadie", "Ash", "Reese", "Jules", "Nova", "Percy",
];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface DeckEntry {
  submissionId: string;
  cards: WhiteCard[];
}

function buildDeck(playerCount: number, pickCount: 1 | 2 | 3): DeckEntry[] {
  const slotCount = Math.max(1, playerCount - 1);
  return Array.from({ length: slotCount }, (_, i) => {
    const isLongSlot = i === slotCount - 1;
    const cards: WhiteCard[] = Array.from({ length: pickCount }, (_, j) => ({
      id: `preview-${i}-${j}`,
      text: isLongSlot ? LONG_SAMPLE_TEXT : SAMPLE_WHITE_TEXTS[(i * pickCount + j) % SAMPLE_WHITE_TEXTS.length],
      pack: "preview",
    }));
    return { submissionId: `preview-slot-${i}`, cards };
  });
}

/**
 * A working miniature of a real Table screen — same header/black-card/
 * judging-grid/scoreboard chrome as the live app, driven by fabricated
 * data and local (not server) state. Reuses the real JudgingBoard and
 * Scoreboard components directly rather than re-describing their markup,
 * so there's exactly one implementation of what a themed Table looks like.
 * JudgingBoard's onShuffle/onReveal/onPick let this drive a genuine
 * face-down -> shuffle -> reveal -> spotlight flow without a socket.
 */
export default function TablePreviewStage({
  tableStyle,
  tableScale,
  blackCardScale,
  spotlightScale,
  scoreboardScale,
  playerCount,
  pickCount,
  fullscreen = false,
}: {
  tableStyle: TableStyle;
  tableScale: number;
  blackCardScale: number;
  spotlightScale: number;
  scoreboardScale: number;
  playerCount: number;
  pickCount: 1 | 2 | 3;
  /** Fill the real window instead of the editor's bounded frame — used by
   * the "Open in a real window" popout for genuine full-screen testing. */
  fullscreen?: boolean;
}) {
  const [deck, setDeck] = useState(() => buildDeck(playerCount, pickCount));
  const [order, setOrder] = useState<string[]>(() => deck.map((d) => d.submissionId));
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  // Mirrors Room.spotlightId server-side: whoever "reveals" opens it for
  // everyone, since there's no separate Table/Judge client in a preview.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [longPrompt, setLongPrompt] = useState(false);
  const [round, setRound] = useState(4);
  // Lets a host preview the RoundEnd winner-announcement screen (see
  // CLAUDE.md's Table-prominent winner display) without leaving the editor -
  // the judging board alone doesn't show everything a real game puts on
  // this screen.
  const [showRoundEnd, setShowRoundEnd] = useState(false);

  useEffect(() => {
    const nextDeck = buildDeck(playerCount, pickCount);
    setDeck(nextDeck);
    setOrder(nextDeck.map((d) => d.submissionId));
    setRevealedIds(new Set());
    setSpotlightId(null);
  }, [playerCount, pickCount]);

  const shuffleLocked = revealedIds.size > 0;

  function handleShuffle() {
    if (shuffleLocked) return;
    setOrder((o) => shuffleArray(o));
  }
  function handleReveal(id: string) {
    setRevealedIds((prev) => new Set(prev).add(id));
    if (tableStyle.spotlightEnabled) setSpotlightId(id);
  }
  function handleSpotlight(id: string) {
    setSpotlightId(id);
  }
  function handleCloseSpotlight() {
    setSpotlightId(null);
  }
  function handlePick() {
    // Loop back to a fresh face-down board so the interaction can be
    // replayed without leaving the editor.
    setRevealedIds(new Set());
    setSpotlightId(null);
    setOrder((o) => shuffleArray(o));
    setRound((r) => r + 1);
  }
  function testLongCard() {
    const longSlot = deck[deck.length - 1];
    if (!longSlot) return;
    handleReveal(longSlot.submissionId);
  }

  const judgingBoard: JudgingCardSlot[] = order.map((id) => {
    const entry = deck.find((d) => d.submissionId === id)!;
    const revealed = revealedIds.has(id);
    return { submissionId: id, revealed, cards: revealed ? entry.cards : null };
  });

  const blackCard: BlackCard = {
    id: "preview-black",
    text: longPrompt ? LONG_PROMPT_TEXT : BLACK_PROMPTS[pickCount],
    pick: pickCount,
    pack: "preview",
  };

  const players: PublicPlayer[] = Array.from(
    { length: Math.min(playerCount, PREVIEW_PLAYER_NAMES.length) },
    (_, i) => ({
      id: `preview-player-${i}`,
      name: PREVIEW_PLAYER_NAMES[i % PREVIEW_PLAYER_NAMES.length],
      role: "player",
      connected: true,
      isHost: false,
      score: (i * 2) % 5,
      wonBlackCardCount: 0,
      isJudge: i === 0,
      hasSubmitted: true,
    })
  );

  const mockRoundResult: RoundResult = {
    winningSubmissionId: deck[0]?.submissionId ?? "preview-slot-0",
    winningPlayerId: players[0]?.id ?? "preview-player-0",
    winningPlayerName: players[0]?.name ?? PREVIEW_PLAYER_NAMES[0],
    cards: deck[0]?.cards ?? [],
    blackCard,
    doubleDownResults: [],
  };

  const mockState: RoomStateForClient = {
    code: "PREVW",
    phase: showRoundEnd ? "roundEnd" : "judging",
    hostId: "",
    houseRules: DEFAULT_HOUSE_RULES,
    winCondition: DEFAULT_WIN_CONDITION,
    deckOptions: DEFAULT_DECK_OPTIONS,
    handSize: DEFAULT_HAND_SIZE,
    doubleDownWindowSeconds: DEFAULT_DOUBLE_DOWN_WINDOW_SECONDS,
    personalCardsWindowMinutes: DEFAULT_PERSONAL_CARDS_WINDOW_MINUTES,
    personalCardsMaxCount: DEFAULT_PERSONAL_CARDS_MAX_COUNT,
    actionCardDensity: DEFAULT_ACTION_CARD_DENSITY,
    dealtAt: Date.now(),
    tableScale,
    blackCardScale,
    spotlightScale,
    scoreboardScale,
    tableStyle,
    roleNames: DEFAULT_ROLE_NAMES,
    packs: [],
    selectedPackIds: [],
    excludedCardIds: [],
    players,
    blackCard,
    pendingJudgingMessage: null,
    votingThisRound: false,
    hostClaimableAt: null,
    actionCardTiers: {},
    actionCardTierWeights: { rare: 0.4, normal: 1, common: 2.2 },
    lastRound: mockRoundResult,
    roundHistory: [],
    judgingBoard,
    shuffleLocked,
    spotlightSubmissionId: spotlightId,
    // A real Table's own `you` record is never isJudge/isHost - those are
    // real-player flags, and the Table's judge authority comes from its
    // role alone (see JudgingBoard's canJudge). isJudge: true here was a
    // preview-only fabrication that leaked "Skip my turn" (gated on
    // isHost || isJudge) into the preview even though it can never actually
    // show on a real Shared Screen.
    you: { id: "preview", role: "table", isJudge: false, isHost: false },
  };

  const accent = TABLE_THEME_ACCENTS[tableStyle.theme][tableStyle.accentIndex]?.color;

  return (
    <div className={fullscreen ? "editor-preview-fullscreen" : "editor-preview-frame"}>
      <div
        className="page role-table"
        data-table-theme={tableStyle.theme}
        data-background-style={tableStyle.backgroundStyle}
        data-bg-active="true"
        style={
          {
            zoom: tableScale,
            "--black-card-scale": blackCardScale,
            "--scoreboard-scale": scoreboardScale,
            "--facedown-opacity": tableStyle.facedownOpacity / 100,
            ...(accent ? { "--accent": accent } : {}),
          } as React.CSSProperties
        }
      >
        {tableStyle.backgroundStyle === "scene" && accent && (
          <ThemeScene theme={tableStyle.theme} accent={accent} animated={tableStyle.backgroundAnimated} />
        )}
        <header className="room-header">
          <span>
            <span className="room-code">{mockState.code}</span>
            <span className="tag">Shared Screen</span>
            <span className="tag muted">Round {round}</span>
          </span>
          <span className="header-right">
            <span className="phase-badge">{mockState.phase}</span>
          </span>
        </header>

        <div className="row">
          <button type="button" onClick={testLongCard} disabled={showRoundEnd}>
            <SearchIcon /> Test a long card
          </button>
          <button type="button" onClick={() => setLongPrompt((v) => !v)} disabled={showRoundEnd}>
            {longPrompt ? (
              <>
                <BackArrowIcon /> Normal prompt
              </>
            ) : (
              <>
                <RulerIcon /> Test a long prompt
              </>
            )}
          </button>
          <button type="button" onClick={() => setShowRoundEnd((v) => !v)}>
            {showRoundEnd ? (
              <>
                <BackArrowIcon /> Back to judging
              </>
            ) : (
              <>
                <TrophyIcon /> Preview winner announcement
              </>
            )}
          </button>
        </div>

        {showRoundEnd ? (
          <>
            <RoundEndView state={mockState} />
            <Scoreboard state={mockState} />
          </>
        ) : tableStyle.layout === "dense" ? (
          <TableDenseLayout
            state={mockState}
            onShuffle={handleShuffle}
            onReveal={handleReveal}
            onPick={handlePick}
            onSpotlight={handleSpotlight}
            onCloseSpotlight={handleCloseSpotlight}
          />
        ) : (
          <>
            <TableCommandStripLayout
              state={mockState}
              onShuffle={handleShuffle}
              onReveal={handleReveal}
              onPick={handlePick}
              onSpotlight={handleSpotlight}
              onCloseSpotlight={handleCloseSpotlight}
            />
            <Scoreboard state={mockState} />
          </>
        )}
      </div>
    </div>
  );
}
