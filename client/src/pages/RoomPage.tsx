import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ErrorPayload, Role, RoomStateForClient } from "@tabletop-judge/shared";
import { DEFAULT_TABLE_STYLE, minPlayersToContinue, TABLE_THEME_ACCENTS } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { clearSession, loadSession, saveSession } from "../session.js";
import { fetchPublicConfig } from "../publicConfig.js";
import { themeAttrs } from "../useThemeAttrs.js";
import { blackCardLengthScale, formatBlackCardText } from "../blackCardText.js";
import Lobby from "../components/Lobby.js";
import TableLobbyView from "../components/TableLobbyView.js";
import PlayerHandView from "../components/PlayerHandView.js";
import PersonalCardsView from "../components/PersonalCardsView.js";
import PlayerJudgingView from "../components/PlayerJudgingView.js";
import BufferedNumberInput from "../components/BufferedNumberInput.js";
import CzarBlackCardControls from "../components/CzarBlackCardControls.js";
import JudgingBoard from "../components/JudgingBoard.js";
import TableDenseLayout from "../components/TableDenseLayout.js";
import TableCommandStripLayout from "../components/TableCommandStripLayout.js";
import ThemeScene from "../components/ThemeScene.js";
import RoundEndView from "../components/RoundEndView.js";
import GameEndView from "../components/GameEndView.js";
import Scoreboard from "../components/Scoreboard.js";
import InvitePanel from "../components/InvitePanel.js";
import RoundHistoryPanel from "../components/RoundHistoryPanel.js";
import InGamePlayerPanel from "../components/InGamePlayerPanel.js";
import HostClaimNotice from "../components/HostClaimNotice.js";
import { useTurnNotification, useTurnNotificationsEnabled } from "../useTurnNotification.js";
import { getSubmissionProgress } from "../submissionProgress.js";
import {
  BellIcon,
  BellSlashIcon,
  BoltCardIcon,
  CheckIcon,
  CloseCircleIcon,
  CrownIcon,
  DoorExitIcon,
  HistoryIcon,
  HomeIcon,
  PeopleIcon,
  PencilIcon,
  PersonAddIcon,
  RefreshIcon,
} from "../components/Icons.js";

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const roleParam = search.get("role") === "table" ? "table" : "player";
  const isCreating = code === "new";

  const [state, setState] = useState<RoomStateForClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionCardNotice, setActionCardNotice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(roleParam);
  // Before a room's own state arrives there's no tableStyle to theme with
  // yet - this join/connecting screen uses the server's admin-configured
  // default instead, same as HomePage/Card Management/Admin (which never
  // have a room of their own either).
  const [preJoinTheme, setPreJoinTheme] = useState({ theme: DEFAULT_TABLE_STYLE.theme, accentIndex: DEFAULT_TABLE_STYLE.accentIndex });
  useEffect(() => {
    fetchPublicConfig().then((config) => setPreJoinTheme({ theme: config.defaultTheme, accentIndex: config.defaultAccentIndex }));
  }, []);

  useEffect(() => {
    if (!code) return;
    socket.connect();

    function onState(s: RoomStateForClient) {
      setState(s);
      setError(null);
      setConnecting(false);
    }
    function onError(e: ErrorPayload) {
      setError(e.message);
      setConnecting(false);
    }
    function onKicked(reason: ErrorPayload) {
      clearSession();
      setState(null);
      navigate("/", { replace: true, state: { noticeMessage: reason.message } });
    }
    // Peek's result (and any future Action Card that needs a private,
    // one-off reveal) - a short-lived toast, same idiom as the error toast
    // below but non-error styled.
    function onActionCardResult(payload: { message: string }) {
      setActionCardNotice(payload.message);
    }
    /**
     * Re-joins on EVERY connect, not just the first.
     *
     * socket.io reconnects on its own after a network blip, but the
     * reconnected socket is a brand-new one server-side: its handler
     * closure has no roomCode or playerId, so the server has no idea who
     * it is and never sends it another roomState. Previously the client
     * only sent joinRoom once on mount, so after any dropped connection
     * the phone would sit on stale state indefinitely while the rest of
     * the table moved on - the desync that made a manual refresh the only
     * way back. Re-sending the token on connect is what actually rebinds
     * the seat and pulls fresh state.
     *
     * Safe to repeat: addOrReconnectPlayer treats a known token as a
     * reconnect, keeping the same seat, hand and host status.
     */
    function resumeSession() {
      setConnected(true);
      if (isCreating) return;
      const session = loadSession();
      if (!session || session.roomCode !== code) return;
      setConnecting(true);
      socket.emit(
        "joinRoom",
        { roomCode: code, name: session.name, role: session.role, token: session.token },
        (ack) => {
          setConnecting(false);
          if (!ack.ok) {
            setError(ack.error.message);
            clearSession();
          } else {
            saveSession({ roomCode: ack.roomCode, token: ack.token, name: session.name, role: session.role });
          }
        }
      );
    }

    function onDisconnect() {
      // Surfaced in the UI: staring at a frozen board with no explanation
      // is what made this look like the game itself had broken.
      setConnected(false);
    }

    socket.on("roomState", onState);
    socket.on("errorMessage", onError);
    socket.on("kicked", onKicked);
    socket.on("actionCardResult", onActionCardResult);
    socket.on("connect", resumeSession);
    socket.on("disconnect", onDisconnect);

    // socket.io only notices a black-holed connection when a ping goes
    // unanswered (~15s here). The browser usually knows the moment the
    // device itself drops off, so use that purely as an early warning.
    // Never used to mark us connected again - navigator.onLine reports
    // true for a wifi network with no working internet behind it, so only
    // an actual socket connect event can clear this.
    window.addEventListener("offline", onDisconnect);

    // Clearing it needs its own handler: if the network returns before
    // socket.io ever noticed the drop, the socket was live the whole time
    // and no connect event is coming - so the banner would stay up
    // forever. Trust the socket's own view here rather than
    // navigator.onLine, which lies about wifi with no internet behind it.
    function onOnline() {
      setConnected(socket.connected);
    }
    window.addEventListener("online", onOnline);

    // Already connected when this mounted (e.g. navigating from /room/new
    // to the real code), so no connect event is coming - resume by hand.
    if (socket.connected) resumeSession();

    return () => {
      socket.off("roomState", onState);
      socket.off("errorMessage", onError);
      socket.off("kicked", onKicked);
      socket.off("actionCardResult", onActionCardResult);
      socket.off("connect", resumeSession);
      socket.off("disconnect", onDisconnect);
      window.removeEventListener("offline", onDisconnect);
      window.removeEventListener("online", onOnline);
      socket.disconnect();
    };
  }, [code, isCreating, navigate]);

  const isCreatingTable = isCreating && roleParam === "table";

  // The Shared Screen needs no input from whoever's setting it up - no name
  // to type (hardcoded to "Shared Screen" below, same as handleSubmitJoin's
  // own isCreatingTable branch), no role to pick. Making them tap a second,
  // otherwise-empty confirmation screen just to reach a plain "yes, do the
  // thing I already asked for" button was pure friction - this fires the
  // instant the socket connects instead. `code` (not just isCreatingTable)
  // is in the guard because it flips to the real room code the moment
  // createRoom's ack lands and navigate() below swaps the route, which is
  // what actually stops this from firing again on that same mount.
  useEffect(() => {
    if (!connected || !isCreatingTable || code !== "new" || connecting) return;
    setConnecting(true);
    setError(null);
    socket.emit("createRoom", { name: "Shared Screen", role: "table" }, (ack) => {
      setConnecting(false);
      if (!ack.ok) {
        setError(ack.error.message);
        return;
      }
      saveSession({ roomCode: ack.roomCode, token: ack.token, name: "Shared Screen", role: "table" });
      navigate(`/room/${ack.roomCode}`, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, isCreatingTable, code]);

  // isCreatingTable never reaches here - that case auto-creates via the
  // effect above and never renders the form this handles.
  function handleSubmitJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !code) return;
    setConnecting(true);
    setError(null);

    if (isCreating) {
      socket.emit("createRoom", { name, role: roleParam }, (ack) => {
        setConnecting(false);
        if (!ack.ok) {
          setError(ack.error.message);
          return;
        }
        saveSession({ roomCode: ack.roomCode, token: ack.token, name, role: roleParam });
        navigate(`/room/${ack.roomCode}`, { replace: true });
      });
    } else {
      socket.emit("joinRoom", { roomCode: code, name, role, token: undefined }, (ack) => {
        setConnecting(false);
        if (!ack.ok) {
          setError(ack.error.message);
          return;
        }
        saveSession({ roomCode: ack.roomCode, token: ack.token, name, role });
      });
    }
  }

  const isTable = state?.you.role === "table";
  const pageRef = useRef<HTMLDivElement>(null);
  const [autoFitZoom, setAutoFitZoom] = useState<number | null>(null);
  const [tableMaxWidth, setTableMaxWidth] = useState<number | null>(null);
  const [showMidGameInvite, setShowMidGameInvite] = useState(false);
  const [showRoundHistory, setShowRoundHistory] = useState(false);
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [turnNotifsEnabled, setTurnNotifsEnabled] = useTurnNotificationsEnabled();
  useTurnNotification(state, turnNotifsEnabled);

  useEffect(() => {
    if (!actionCardNotice) return;
    const t = setTimeout(() => setActionCardNotice(null), 4000);
    return () => clearTimeout(t);
  }, [actionCardNotice]);

  // Long black card text or a full lobby of players can grow the page
  // taller than the actual screen and push the scoreboard out of view -
  // not acceptable on a glanceable shared display. Re-measure against the
  // manual "Text size" baseline after every state change and shrink just
  // enough to keep everything on screen. Hooks must run unconditionally on
  // every render (before the "not joined yet" early return below), so the
  // null/non-table cases are handled inside the effect instead of by
  // skipping the hook call.
  useLayoutEffect(() => {
    if (!isTable || !pageRef.current || !state) return;
    const el = pageRef.current;
    const manualScale = state.tableScale;
    const phase = state.phase;

    // CSS zoom is a post-layout visual scale - it does NOT change the
    // logical CSS-pixel width elements reflow against, so shrinking zoom
    // for height's sake shrinks the RENDERED width right along with it even
    // though the reflow itself never needed less room. On a 1920px screen
    // capped at the 1800px baseline, a modest 0.97 shrink alone throws away
    // ~175px of real screen width doing nothing; a busier round that needs
    // more shrink wastes proportionally more. BASE_MAX_WIDTH mirrors the
    // CSS's own baseline cap (index.css's .page.role-table) so the two stay
    // in sync.
    const BASE_MAX_WIDTH = 1800;

    function measureHeight(): number {
      el.style.zoom = "1";
      return document.documentElement.scrollHeight;
    }

    function fit() {
      // The Lobby is a scrollable settings form someone stands at and
      // configures up close, not a glance-at-a-distance board - forcing
      // every open panel to cram into one screen at a shrunk size (the
      // more settings visible, the smaller it'd get) is the wrong call
      // here. Only auto-shrink during actual gameplay.
      if (phase === "lobby") {
        el.style.removeProperty("--table-max-width");
        el.style.zoom = String(manualScale);
        setAutoFitZoom(manualScale);
        setTableMaxWidth(null);
        return;
      }

      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Pass 1: measure at a neutral 1x baseline and the CSS's own default
      // width cap, not at manualScale - measuring post-zoom makes
      // contentHeight grow proportionally with whatever scale is being
      // tested, which is exactly what the fit ratio below exists to avoid
      // conflating with the "how tall is the content, shape-wise" question.
      el.style.removeProperty("--table-max-width");
      const baseHeight = measureHeight();
      // The largest zoom the content's natural (1x) height can take without
      // overflowing the viewport. Was previously a "does raw unzoomedHeight
      // clear a threshold, and if so shrink by this ratio" check - that
      // compared content height directly against the viewport while
      // completely ignoring that manualScale (1.35x by default) still gets
      // multiplied back in afterward, so content that "passed" the raw
      // check could still overflow once scaled up - exactly what was
      // happening with the Dense/Command Strip judging grid (see
      // useFillGrid.ts) and the bigger default black-card scale, which
      // routinely need real shrinking that this never applied. Clamping
      // directly to this ceiling is self-consistently correct at any
      // manualScale, not just past some arbitrary multiplier.
      const naiveZoom = Math.max(0.55, Math.min(manualScale, (viewportHeight / baseHeight) * 0.97));

      let finalZoom = naiveZoom;
      let finalMaxWidth: number | null = null;

      // Only worth a second measurement pass when we're actually shrinking
      // for height's sake - the baseline cap is already correct otherwise,
      // and re-measuring would be pure overhead for no benefit.
      if (naiveZoom < manualScale - 0.01) {
        // Widen the logical layout box in inverse proportion to the shrink
        // we're about to apply, so the RENDERED width (this cap × zoom)
        // lands back near the baseline's own rendered width instead of
        // shrinking along with height. A wider box also very often lets
        // auto-fill grids (the judging board, the hand) pack more columns
        // per row on their own, which can shorten the content and reduce
        // how much shrink is even needed - pass 2 measures whatever that
        // turns out to be rather than assuming it. Capped near the true
        // viewport width so this can never render wider than the actual
        // screen even at an extreme shrink factor.
        const boosted = Math.min(BASE_MAX_WIDTH / naiveZoom, (viewportWidth / naiveZoom) * 0.97);
        el.style.setProperty("--table-max-width", `${boosted}px`);
        const boostedHeight = measureHeight();
        finalZoom = Math.max(0.55, Math.min(manualScale, (viewportHeight / boostedHeight) * 0.97));
        finalMaxWidth = boosted;
      }

      // min(), not a ratio multiplied in - stays monotonic as manualScale
      // moves: below the ceiling, +/- is fully responsive 1:1; at/above it,
      // + has no further effect (correctly, you're already at the largest
      // safe size) but - immediately starts working again once manualScale
      // drops back under the ceiling. A ratio-based formula could net
      // *smaller* after pressing + while already capped - this can't.
      el.style.zoom = String(finalZoom);
      setAutoFitZoom(finalZoom);
      setTableMaxWidth(finalMaxWidth);
    }

    fit();
    // Display fonts load async (see index.html) — if they swap in after this
    // measurement, the layout can grow past the already-applied zoom and push
    // content off-screen. Re-measure once they're actually ready.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fit);
    }
    // The judging grid's own dynamic sizing (useFillGrid's ResizeObserver)
    // settles asynchronously, after this layout effect's own measurement -
    // it isn't done yet on the very first fit() above. Catch its settled
    // size with one more pass shortly after mount/state-change.
    const settleTimer = window.setTimeout(fit, 150);
    window.addEventListener("resize", fit);
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", fit);
    };
  }, [isTable, state]);

  if (!state) {
    const theming = themeAttrs(preJoinTheme.theme, preJoinTheme.accentIndex);
    return (
      <div className="page center" data-table-theme={theming["data-table-theme"]} style={theming.style}>
        <h1>{isCreatingTable ? "Set up the Shared Screen" : isCreating ? "Host a game" : `Join ${code}`}</h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label="Refresh"
          title="Stuck connecting? Tap to reload."
        >
          <RefreshIcon /> Refresh
        </button>
        {error && <p className="error">{error}</p>}
        {isCreatingTable ? (
          <p className="muted panel">Setting up the Shared Screen…</p>
        ) : (
          <form onSubmit={handleSubmitJoin} className="stack panel">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={32}
              autoFocus
            />
            {!isCreating && (
              <div className="role-picker">
                <label>
                  <input
                    type="radio"
                    checked={role === "player"}
                    onChange={() => setRole("player")}
                  />
                  Player (phone)
                </label>
                <label>
                  <input
                    type="radio"
                    checked={role === "table"}
                    onChange={() => setRole("table")}
                  />
                  Shared Screen
                </label>
              </div>
            )}
            {!isCreating && role === "player" && (
              <p className="muted">If you're the first player to join, you'll become the host with control over settings.</p>
            )}
            <button type="submit" disabled={!name.trim() || connecting}>
              {connecting ? "Connecting…" : isCreating ? "Create Room" : "Join"}
            </button>
          </form>
        )}
      </div>
    );
  }

  // The host keeps this always (including in Lobby, before any Czar
  // rotation exists, since that's exactly when you're sizing up the Table
  // before starting) - the current Czar also gets it during a round, since
  // they're the one actively driving the shared judging display.
  const canControlTableScale = isTable || state.you.isHost || state.you.isCzar;
  const canInviteMidGame = (state.you.isHost || isTable) && state.phase !== "lobby";

  function adjustTableScale(delta: number) {
    socket.emit("adjustTableScale", { delta });
  }

  function leaveGame() {
    if (!state) return;
    const realPlayerCount = state.players.filter((p) => p.role === "player" && !p.isRando).length;
    const wouldEndGame = realPlayerCount - 1 < minPlayersToContinue(state.houseRules);
    const warning = wouldEndGame
      ? "Leaving now drops below the minimum to keep playing, so the game will end immediately on current standings. Leave anyway?"
      : "Leave the game? Your hand and cards go back into the piles — you can't resume this seat.";
    if (!window.confirm(warning)) return;
    socket.emit("leaveRoom");
    clearSession();
    navigate("/", { replace: true });
  }

  function closeRoomAsHost() {
    if (!window.confirm("Close this room? Everyone still connected — including you — gets sent back to the main menu.")) return;
    // No manual navigate/clearSession here - the server kicks every
    // connected player (host included), and the existing onKicked handler
    // already does both, same path as being kicked or an idle-timeout close.
    socket.emit("closeRoom");
  }

  const tableAccent = TABLE_THEME_ACCENTS[state.tableStyle.theme][state.tableStyle.accentIndex]?.color;
  // Glow/scene backgrounds were designed for the Shared Screen's own empty
  // space - a phone's hand view is far more content-dense, so they only
  // apply there when the room has explicitly opted in.
  const bgActive = isTable || state.tableStyle.mobileBackgroundEnabled;

  return (
    <div
      ref={pageRef}
      className={`page${isTable ? " role-table" : ""}`}
      data-table-theme={state.tableStyle.theme}
      data-background-style={state.tableStyle.backgroundStyle}
      data-bg-active={bgActive ? "true" : "false"}
      style={
        {
          "--black-card-scale": state.blackCardScale,
          // Shared-Screen-only, like tableScale itself - a phone's own
          // footer Scoreboard should never inherit the Table's chosen size.
          "--scoreboard-scale": isTable ? state.scoreboardScale : 1,
          "--facedown-opacity": state.tableStyle.facedownOpacity / 100,
          ...(tableAccent ? { "--accent": tableAccent } : {}),
          ...(isTable ? { zoom: autoFitZoom ?? state.tableScale } : {}),
          ...(isTable && tableMaxWidth ? { "--table-max-width": `${tableMaxWidth}px` } : {}),
        } as React.CSSProperties
      }
    >
      {bgActive && state.tableStyle.backgroundStyle === "scene" && tableAccent && (
        <ThemeScene theme={state.tableStyle.theme} accent={tableAccent} animated={state.tableStyle.backgroundAnimated} />
      )}
      <header className="room-header">
        <span className="room-code">{state.code}</span>
        <span className="header-right">
          <span className="phase-badge">{state.phase}</span>
          {state.phase !== "lobby" && state.phase !== "gameEnd" && state.phase !== "personalCards" && (
            <span className="tag" title="Whoever's turn it is to judge this round">
              <CrownIcon className="icon" /> Czar: {state.players.find((p) => p.isCzar)?.name ?? "—"}
            </span>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="Refresh"
            title="Screen stuck? Tap to reconnect."
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Main Menu"
            title="Back to the main menu — your seat is kept, you can rejoin with the room code."
          >
            <HomeIcon /> Menu
          </button>
          <button
            type="button"
            onClick={() => setTurnNotifsEnabled(!turnNotifsEnabled)}
            aria-label={turnNotifsEnabled ? "Mute turn notifications" : "Unmute turn notifications"}
            title="Chime + vibrate when it's your turn to act"
          >
            {turnNotifsEnabled ? <BellIcon /> : <BellSlashIcon />}
          </button>
          {state.phase !== "lobby" && (
            <button type="button" onClick={() => setShowRoundHistory((v) => !v)}>
              <HistoryIcon /> {showRoundHistory ? "Hide history" : "History"}
            </button>
          )}
          {canInviteMidGame && (
            <button type="button" onClick={() => setShowMidGameInvite((v) => !v)}>
              <PersonAddIcon /> {showMidGameInvite ? "Hide invite" : "Add player"}
            </button>
          )}
          {state.you.isHost && state.phase !== "lobby" && (
            <button type="button" onClick={() => setShowPlayerPanel((v) => !v)}>
              <PeopleIcon /> {showPlayerPanel ? "Hide players" : "Players"}
            </button>
          )}
          {state.you.role === "player" && state.phase !== "lobby" && (
            <button type="button" onClick={leaveGame}>
              <DoorExitIcon /> Leave
            </button>
          )}
          {state.you.isHost && (
            <button type="button" onClick={closeRoomAsHost}>
              <CloseCircleIcon /> Close Room
            </button>
          )}
          {canControlTableScale && (
            <span className="table-scale-controls">
              {!isTable && <span className="table-scale-label">Shared Screen size</span>}
              <button type="button" onClick={() => adjustTableScale(-0.1)} aria-label="Decrease Shared Screen size">
                −
              </button>
              <button type="button" onClick={() => adjustTableScale(0.1)} aria-label="Increase Shared Screen size">
                +
              </button>
            </span>
          )}
        </span>
      </header>

      {canInviteMidGame && showMidGameInvite && <InvitePanel roomCode={state.code} />}
      {!connected && (
        <p className="center-text connection-banner">
          Reconnecting… you may be seeing an out-of-date board.
        </p>
      )}
      <HostClaimNotice state={state} />
      {showRoundHistory && <RoundHistoryPanel state={state} />}
      {showPlayerPanel && <InGamePlayerPanel state={state} />}

      {state.you.isHost && state.phase !== "lobby" && state.phase !== "gameEnd" && (
        <div className="host-game-bar">
          <label>
            Win at
            <BufferedNumberInput
              value={state.winCondition.target}
              min={1}
              disabled={false}
              onCommit={(n) => socket.emit("updateWinCondition", { target: n })}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("End the game now? Current scores will decide the winner.")) {
                socket.emit("endGame");
              }
            }}
          >
            End Game
          </button>
        </div>
      )}

      {error && <p className="error toast">{error}</p>}
      {actionCardNotice && (
        <p className="toast action-card-toast">
          <BoltCardIcon /> {actionCardNotice}
        </p>
      )}

      <RoomBody state={state} />

      {!(
        isTable &&
        state.tableStyle.layout === "dense" &&
        (state.phase === "reveal" || state.phase === "judging")
      ) && <Scoreboard state={state} />}
    </div>
  );
}

function RoomBody({ state }: { state: RoomStateForClient }) {
  // Crowd Favorite / Democracy: "No Card Czar in this mode" (see Room.ts)
  // - whoever the czar rotation still happens to point at is just another
  // voter, not a judge, so they get the same read-only board + Vote button
  // everyone else does (PlayerJudgingView below). Only the Table (the
  // room's neutral shared screen) keeps driver controls, for spotlighting
  // already-revealed cards - nothing is gated behind it since every card
  // is auto-revealed for a vote (see Room.moveToReveal).
  const canJudge = state.you.role === "table" || (state.you.isCzar && !state.votingThisRound);

  switch (state.phase) {
    case "lobby":
      return state.you.role === "table" ? <TableLobbyView state={state} /> : <Lobby state={state} />;
    case "personalCards":
      return state.you.role === "player" ? (
        <PersonalCardsView state={state} />
      ) : (
        <PersonalCardsWaitingPanel state={state} />
      );
    case "dealing":
      return <p className="center-text">Dealing…</p>;
    case "submission":
      if (state.you.role === "table") {
        return <WaitingPanel state={state} message="Waiting for players to submit…" />;
      }
      // Crowd Favorite: no exemption for whoever czarOrder currently points
      // at - they submit a card like everyone else, so they need the real
      // hand view, not the passive "sit tight" wait.
      if (state.you.isCzar && !state.votingThisRound) {
        return (
          <WaitingPanel state={state} message="You're the Card Czar this round — sit tight while everyone submits." />
        );
      }
      return <PlayerHandView state={state} />;
    case "reveal":
    case "judging":
      if (state.you.role === "table") {
        const LayoutComponent = state.tableStyle.layout === "dense" ? TableDenseLayout : TableCommandStripLayout;
        return (
          <LayoutComponent
            state={state}
            voteMode={state.votingThisRound}
            yourSubmissionId={state.yourSubmissionId}
            yourVote={state.yourVote}
          />
        );
      }
      if (canJudge) {
        return (
          <JudgingBoard
            state={state}
            voteMode={state.votingThisRound}
            yourSubmissionId={state.yourSubmissionId}
            yourVote={state.yourVote}
          />
        );
      }
      // Everyone else gets a read-only mirror of the same board (a "Shared
      // Screen" tab) plus their own hand, rather than just a generic wait
      // message.
      return <PlayerJudgingView state={state} />;
    case "roundEnd":
      return <RoundEndView state={state} />;
    case "gameEnd":
      return <GameEndView state={state} />;
    default:
      return null;
  }
}

// Only ever rendered for the Czar/Table during Submission now (Reveal/
// Judging uses PlayerJudgingView instead) - dead time worth making a
// feature of: the prompt fills the screen, big and centered, readable
// from across a room while everyone else is heads-down on their phones.
function WaitingPanel({ state, message }: { state: RoomStateForClient; message: string }) {
  // Ambient, low-detail progress - who specifically and how long is the
  // host's Players panel's job; this is just "is anything even happening."
  const { requiredPlayers, submittedCount } = getSubmissionProgress(state);
  // Same component/markup for the Table (a big shared screen, read from
  // across a room - wants the large 2.2rem treatment) and the Czar's own
  // phone (which doesn't - the large size was overflowing the card on a
  // narrow screen). A role class lets the CSS size each appropriately
  // instead of one font-size trying to serve both.
  const isTable = state.you.role === "table";

  return (
    <div className={isTable ? "waiting-hero" : "waiting-hero waiting-hero-phone"}>
      {state.blackCard && (
        <div
          className="card card-black"
          style={{ "--black-card-length-scale": blackCardLengthScale(formatBlackCardText(state.blackCard.text)) } as React.CSSProperties}
        >
          <p>{formatBlackCardText(state.blackCard.text)}</p>
        </div>
      )}
      <p className="muted">{message}</p>
      {requiredPlayers.length > 0 && (
        <p className="muted">
          {submittedCount} of {requiredPlayers.length} submitted
        </p>
      )}
      <CzarBlackCardControls state={state} />
    </div>
  );
}

// Shown to the Table and any non-writing viewer during the Personal Cards
// window - ambient progress only (a count per player, never card text),
// same idiom as WaitingPanel's submission-progress line.
function PersonalCardsWaitingPanel({ state }: { state: RoomStateForClient }) {
  const endsAt = state.personalCardsWindowEndsAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const secondsLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const writers = state.players.filter((p) => p.role === "player" && !p.isRando);

  return (
    <div className="waiting-hero">
      <h2 className="personal-cards-wait-title">
        <PencilIcon /> Writing Personal Cards
      </h2>
      {secondsLeft != null && <p className="personal-cards-wait-timer">{secondsLeft}s</p>}
      <div className="personal-cards-wait-list">
        {writers.map((p) => {
          const count = p.personalCardsCount ?? 0;
          const max = state.personalCardsMaxCount;
          const done = count >= max;
          const pct = max > 0 ? Math.min(100, (count / max) * 100) : 0;
          return (
            <div key={p.id} className={`personal-cards-wait-row${done ? " done" : ""}`}>
              <span className="personal-cards-wait-name">
                {p.name}
                {done && <CheckIcon className="icon" />}
              </span>
              <div className="personal-cards-wait-bar">
                <div className="personal-cards-wait-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="personal-cards-wait-count">
                {count}/{max}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
