// Shared test harness: server lifecycle, socket clients, assertions.
//
// Every bug this file exists to prevent was hit for real while these tests
// lived as throwaway scratch scripts:
//   - state pollution between runs (a room/preset left over from the last
//     run made the next one fail on a "duplicate" it never created)
//   - the 7s production ROUND_END_DELAY_MS making round-based tests either
//     crawl or time out, depending on how patient the script was
//   - silently-swallowed server rejections looking like app bugs, because
//     the client never listened for "errorMessage"
// So: clean data dir per run, fast round delay, and every client records
// errors by default.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = Number(process.env.TEST_PORT ?? 3197);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls until `fn()` is truthy. Returns the value, or throws on timeout -
 * always prefer this over a bare wait(), so a slow machine doesn't turn
 * into a flaky failure and a genuinely stuck state fails loudly. */
export async function waitFor(fn, { timeout = 8000, interval = 50, label = "condition" } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
    await wait(interval);
  }
}

/**
 * Boots the built server against a throwaway data directory.
 * Requires `npm run build` to have been run first (the runner checks).
 */
export async function startServer({ port = DEFAULT_PORT, env = {} } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "nofilter-test-"));
  // The real card file is large; reuse it read-only rather than copying.
  const cardPath = process.env.TEST_CARD_DATA_PATH ?? path.join(PROJECT_ROOT, "cards-full.json");
  if (!existsSync(cardPath)) {
    throw new Error(`Card data not found at ${cardPath}. Set TEST_CARD_DATA_PATH to point at a full card corpus JSON file.`);
  }

  const child = spawn(process.execPath, ["server/dist/index.js"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      // Keep round transitions snappy; the production default is 7s.
      ROUND_END_DELAY_MS: "250",
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "warn",
      CARD_DATA_PATH: cardPath,
      TABLE_STYLE_PRESETS_PATH: path.join(dataDir, "table-style-presets.json"),
      CUSTOM_CARDS_PATH: path.join(dataDir, "custom-cards.json"),
      CUSTOM_SETS_PATH: path.join(dataDir, "custom-sets.json"),
      PACK_SELECTION_PRESETS_PATH: path.join(dataDir, "pack-selection-presets.json"),
      GAME_SETUP_PRESETS_PATH: path.join(dataDir, "game-setup-presets.json"),
      ADMIN_PASSWORD_HASH_PATH: path.join(dataDir, "admin-password.json"),
      CORE_SET_PATH: path.join(dataDir, "core-set.json"),
      GAME_NAME_PATH: path.join(dataDir, "game-name.json"),
      ROLE_NAMES_PATH: path.join(dataDir, "role-names.json"),
      DEFAULT_THEME_PATH: path.join(dataDir, "default-theme.json"),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));
  let exited = false;
  let exitCode = null;
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });

  const baseUrl = `http://localhost:${port}`;
  try {
    await waitFor(
      async () => {
        if (exited) throw new Error(`Server exited early (code ${exitCode}).\n${output}`);
        try {
          const res = await fetch(`${baseUrl}/health`);
          return res.ok;
        } catch {
          return false;
        }
      },
      { timeout: 20000, label: "server /health" }
    );
  } catch (err) {
    try { child.kill(); } catch {}
    rmSync(dataDir, { recursive: true, force: true });
    throw err;
  }

  return {
    baseUrl,
    port,
    dataDir,
    get output() { return output; },
    get exited() { return exited; },
    get exitCode() { return exitCode; },
    async stop() {
      if (!exited) {
        child.kill();
        await waitFor(() => exited, { timeout: 5000, label: "server exit" }).catch(() => {});
      }
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** A socket client that records state, errors and kicks. Errors are always
 * captured - a test that ignores them can't tell a rejection from a no-op. */
export function makeClient(baseUrl, name) {
  const socket = io(baseUrl, { autoConnect: false });
  let state = null;
  // The seat token from createRoom/joinRoom. Reconnect tests need it: the
  // token is what rebinds an existing seat rather than creating a player.
  let token = null;
  const errors = [];
  const kicked = [];
  const actionResults = [];
  socket.on("roomState", (s) => (state = s));
  socket.on("errorMessage", (e) => errors.push(e));
  socket.on("kicked", (k) => kicked.push(k));
  socket.on("actionCardResult", (p) => actionResults.push(p.message));
  socket.connect();

  return {
    name,
    socket,
    get state() { return state; },
    get errors() { return errors; },
    get kicked() { return kicked; },
    get actionResults() { return actionResults; },
    /** This client's own player record in the latest state. */
    get me() { return state?.players?.find((p) => p.id === state.you.id) ?? null; },
    get token() { return token; },
    set token(t) { token = t; },
    emit: (...args) => socket.emit(...args),
    ack: (...args) => new Promise((resolve) => socket.emit(...args, resolve)),
    waitForPhase: (phase, timeout = 8000) =>
      waitFor(() => state?.phase === phase, { timeout, label: `${name} to reach phase "${phase}"` }),
    close: () => socket.close(),
  };
}

/** Creates a room with `names[0]` as host and the rest joined as players. */
export async function makeRoom(baseUrl, names = ["Alice", "Bob", "Carol"]) {
  const clients = [];
  const host = makeClient(baseUrl, names[0]);
  await waitFor(() => host.socket.connected, { label: "host socket connect" });
  const ack = await host.ack("createRoom", { name: names[0], role: "player" });
  if (!ack.ok) throw new Error(`createRoom failed: ${JSON.stringify(ack)}`);
  host.token = ack.token;
  clients.push(host);

  for (const name of names.slice(1)) {
    const c = makeClient(baseUrl, name);
    await waitFor(() => c.socket.connected, { label: `${name} socket connect` });
    const joinAck = await c.ack("joinRoom", { roomCode: ack.roomCode, name, role: "player" });
    if (!joinAck.ok) throw new Error(`joinRoom failed for ${name}: ${JSON.stringify(joinAck)}`);
    c.token = joinAck.token;
    clients.push(c);
  }
  await waitFor(() => clients.every((c) => c.state), { label: "all clients to receive state" });

  return {
    code: ack.roomCode,
    host,
    clients,
    closeAll: () => clients.forEach((c) => c.close()),
  };
}

/**
 * Waits until every real player's hand has actually arrived.
 *
 * A client reaching phase "submission" only proves *that* client's state
 * landed - the others' hands are still in flight. Reading hands without
 * this reads half-dealt state, which shows up as intermittent failures
 * that look like app bugs. Always await this before touching hands.
 */
export function waitForDeal(room, timeout = 8000) {
  // Deliberately "a non-empty hand plus a black card", not "exactly
  // handSize": Action Cards legitimately push a hand above the cap (Triple
  // Boost adds 3) or below it (playing one costs a card, and a Judge never
  // submits so never triggers an Auto Draw top-up mid-round). Requiring an
  // exact size made this hang on perfectly valid states. Specs that care
  // about an exact hand size should assert it themselves.
  return waitFor(
    () =>
      room.clients.every((c) => c.me?.isWildCard || (c.state?.yourHand ?? []).length > 0) &&
      !!room.host.state?.blackCard,
    { timeout, label: "every player to receive their cards" }
  );
}

/**
 * Finds a currently-held Action Card of the given type.
 *
 * Never snapshot the result: playing these cards mutates hands (Steal moves
 * cards, Discard Bomb replaces a whole hand, Hand Refresh redeals), so a
 * card id captured earlier may not exist by the time it's played - which
 * fails silently as CARD_NOT_IN_HAND. Call this immediately before use.
 */
export function findActionCard(room, defId, { excludePlayerId } = {}) {
  for (const c of room.clients) {
    if (c.me?.isWildCard) continue;
    if (excludePlayerId && c.state?.you?.id === excludePlayerId) continue;
    const card = (c.state?.yourHand ?? []).find((x) => x.actionCardId === defId);
    if (card) return { owner: c, cardId: card.id };
  }
  return null;
}

/**
 * Like findActionCard, but churns every hand once via Hand Refresh if the
 * type isn't out yet, roughly doubling the cards seen.
 *
 * Which Action Card you draw is random, so a spec that needs a *specific*
 * type has to plan for it not being in the opening deal. Polling with
 * waitFor is useless here - nothing changes on its own - so this actively
 * redeals instead. Requires the handRefresh house rule to be enabled.
 */
export async function ensureActionCard(room, defId, opts = {}) {
  const found = () => findActionCard(room, defId, opts);
  if (found()) return found();

  // Churn 1: Hand Refresh redeals every hand at once. Only usable once per
  // player per game, so it can't be the only fallback.
  const before = room.clients.map((c) => (c.state?.yourHand ?? []).map((x) => x.id).join(","));
  for (const c of room.clients) {
    if (c.me?.isWildCard) continue;
    c.emit("refreshHand");
  }
  await waitFor(
    () => room.clients.some((c, i) => (c.state?.yourHand ?? []).map((x) => x.id).join(",") !== before[i]),
    { label: "refreshed hands to arrive" }
  ).catch(() => {});
  await wait(200);
  if (found()) return found();

  // Churn 2: play rounds. Every submission is replaced by a fresh draw, so
  // this keeps cycling new cards through hands indefinitely - unlike Hand
  // Refresh, it doesn't run out.
  for (let round = 0; round < 10; round++) {
    await playRound(room);
    await waitFor(() => room.host.state?.phase === "submission", { label: "the next round" }).catch(() => {});
    await waitForDeal(room).catch(() => {});
    if (found()) return found();
  }

  throw new AssertionError(
    `No "${defId}" Action Card turned up after a hand refresh and 10 rounds of churn. ` +
      `Raise the player count, hand size, or density in this spec if it keeps happening.`
  );
}

/** Selects all "Official" packs so Start Game is allowed - the test corpus
 * is an old-schema file (cards-full.json), so its `official: true`
 * packs resolve to category "Official" via loader.ts's legacy fallback. */
export async function selectOfficialPacks(host) {
  host.emit("updatePackSelection", { packIds: host.state.packs.filter((p) => p.category === "Official").map((p) => p.id) });
  await waitFor(() => host.state.selectedPackIds.length > 0, { label: "pack selection to apply" });
}

/**
 * Plays one full round: everyone required submits, the Judge reveals all
 * and picks the first revealed card. Resolves once the round is decided.
 *
 * Returns `{ judge, board }` where `board` is a snapshot of the fully
 * revealed judging board taken *before* the pick - the live board is wiped
 * by the next deal, so anything inspecting the round's cards has to read
 * this snapshot rather than client state after the fact.
 */
export async function playRound(room) {
  await waitFor(() => room.host.state.phase === "submission", { label: "submission phase" });
  // Never submit off a partially-arrived deal - see waitForDeal.
  await waitForDeal(room);
  const pick = room.host.state.blackCard?.pick ?? 1;

  for (const c of room.clients) {
    if (!c.me || c.me.isJudge) continue;
    if (c.state.yourSubmissionId) continue;
    const jokeCards = (c.state.yourHand ?? []).filter((card) => !card.actionCardId);
    const cardIds = jokeCards.slice(0, pick).map((card) => card.id);
    if (cardIds.length === pick) c.emit("submitCards", { cardIds });
  }

  const judge = await waitFor(
    () => room.clients.find((c) => c.me?.isJudge && (c.state.phase === "reveal" || c.state.phase === "judging")),
    { label: "Judge to reach the judging board" }
  );

  for (const slot of judge.state.judgingBoard ?? []) {
    judge.emit("revealSubmission", { submissionId: slot.submissionId });
    await wait(60);
  }
  const revealed = await waitFor(() => judge.state.judgingBoard?.find((s) => s.revealed), { label: "a revealed card" });
  // Snapshot before picking - dealPhase() clears judgingOrder, so reading
  // the board off client state after the round resolves finds nothing.
  const board = JSON.parse(JSON.stringify(judge.state.judgingBoard ?? []));
  judge.emit("judgePick", { submissionId: revealed.submissionId });
  await waitFor(() => ["roundEnd", "gameEnd"].includes(room.host.state.phase), { label: "round to resolve" });
  return { judge, board };
}

// ---------- assertions ----------

export class AssertionError extends Error {}

export function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError(`${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

export { cpSync };
