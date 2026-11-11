import { createServer } from "http";
import { existsSync } from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@tabletop-judge/shared";
import { BUNDLED_SAMPLE_CARD_DATA_PATH, CLIENT_DIST_PATH, CLIENT_ORIGIN, MOCKUPS_DIR_PATH, PORT } from "./config.js";
import { deleteCoreSetPack, getCoreSetInfo, loadInitialCardData, uploadCoreSet } from "./cards/coreSet.js";
import { isValidToken, setupNeeded } from "./admin/auth.js";
import { initCustomCards } from "./customCards/store.js";
import { initCustomSets } from "./customSets/store.js";
import { getGameName, initGameName } from "./gameName/store.js";
import { getDefaultTheme, initDefaultTheme } from "./tableStyle/store.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { registerSocketHandlers } from "./socket/index.js";
import { log } from "./util/logger.js";

const cardData = await loadInitialCardData();
log.info("boot", "card data loaded", { packs: cardData.packs.length });

// Room.ts's buildDecks()/buildStateFor() read custom cards/sets
// synchronously (via the cached getCustomCards()/getCustomSets() getters),
// so both files have to be loaded before any room can be created.
await initCustomCards();
await initCustomSets();
await initGameName();
await initDefaultTheme();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => {
  res.json({ ok: true, packs: cardData.packs.length });
});

// Public, unauthenticated - the browser tab title and HomePage heading
// need this before any socket connection exists (see
// client/src/publicConfig.ts). Writes go through the admin-gated
// "setGameName" socket event instead, same trust model as Core Set/Custom
// Cards - this route is read-only.
app.get("/api/config", async (_req, res) => {
  // setupNeeded is included so the home page can warn, unmissably, that
  // this server has no admin password yet. That window is a land grab -
  // whoever completes setup first becomes admin - and the app is reachable
  // wherever it's deployed, tunnel included. Surfacing it is not a leak:
  // anyone can already observe it by loading /admin. Set ADMIN_PASSWORD in
  // the environment to close the window before the server ever starts.
  const defaultTheme = getDefaultTheme();
  res.json({
    gameName: getGameName(),
    setupNeeded: await setupNeeded(),
    // What HomePage, Card Management and /admin render with - those pages
    // have no room of their own to inherit a look from, so they use
    // whatever an admin picked as the deployment's default (see
    // server/src/tableStyle/store.ts). New rooms are also seeded with this.
    defaultTheme: defaultTheme.theme,
    defaultAccentIndex: defaultTheme.accentIndex,
    defaultBackgroundStyle: defaultTheme.backgroundStyle,
    defaultBackgroundAnimated: defaultTheme.backgroundAnimated,
    defaultMobileBackgroundEnabled: defaultTheme.mobileBackgroundEnabled,
    defaultFacedownOpacity: defaultTheme.facedownOpacity,
  });
});

// Public, unauthenticated - a concrete, always-available example of the
// pack-array JSON shape a Core Set upload expects (client/src/components/
// CoreSetPanel.tsx links to this instead of pointing at a repo doc file
// that won't exist for every deployment). Always the bundled file itself,
// not whatever the server is currently running on - the point is showing
// the *format*, not the live data.
app.get("/sample-cards.json", (_req, res) => {
  res.sendFile(BUNDLED_SAMPLE_CARD_DATA_PATH);
});

// Core Set upload is HTTP, not a Socket.io event, purely because of size:
// socket.io caps a single message at maxHttpBufferSize (1 MB by default),
// and a real card set is far bigger than that - the corpus this project
// was originally built against is ~5 MB. Worse, exceeding that cap doesn't
// produce an error: the transport closes mid-send, socket.io replays the
// buffered emit on reconnect, and the upload retries forever while the
// client's ack never fires. Raising the global socket limit instead would
// let *any* unauthenticated client push multi-MB frames at every event, so
// the size allowance is scoped to this one admin-gated route instead.
//
// Auth is the same token pool as the socket-side admin session (see
// admin/auth.ts) - the client already holds a token from adminLogin, and
// sends it here as a header.
const CORE_SET_UPLOAD_LIMIT = "32mb";
app.post("/api/core-set", express.json({ limit: CORE_SET_UPLOAD_LIMIT }), async (req, res) => {
  const token = req.get("x-admin-token") ?? undefined;
  if (!isValidToken(token)) {
    log.warn("admin", "blocked unauthenticated Core Set upload");
    res.status(401).json({ ok: false, error: "ADMIN_REQUIRED" });
    return;
  }
  const mode = req.body?.mode === "replace" ? "replace" : "add";
  const packs = Array.isArray(req.body?.packs) ? req.body.packs : null;
  if (!packs) {
    res.status(400).json({ ok: false, error: "Expected a packs array." });
    return;
  }
  try {
    const { cardData: next, report } = await uploadCoreSet(mode, packs);
    roomManager.setCardData(next);
    res.json({ ok: true, report, info: getCoreSetInfo(next) });
  } catch (err) {
    log.error("admin", "Core Set upload failed", { err: String(err) });
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Upload failed." });
  }
});

// Same auth model as the upload route above, but a plain small JSON body
// (no need for the 32mb allowance) - lets an admin take back just one pack
// ("uploaded an extra category, want to remove that one") without
// re-uploading the whole Core Set in "replace" mode with it manually cut
// out. See deleteCoreSetPack's own comment for why this deletes by name
// rather than PackSummary.id (index-derived, not stable across a delete).
app.post("/api/core-set/delete-pack", express.json(), async (req, res) => {
  const token = req.get("x-admin-token") ?? undefined;
  if (!isValidToken(token)) {
    log.warn("admin", "blocked unauthenticated Core Set pack delete");
    res.status(401).json({ ok: false, error: "ADMIN_REQUIRED" });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  try {
    const { cardData: next, removedCount } = await deleteCoreSetPack(name);
    roomManager.setCardData(next);
    res.json({ ok: true, removedCount, info: getCoreSetInfo(next) });
  } catch (err) {
    log.error("admin", "Core Set pack delete failed", { err: String(err) });
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : "Delete failed." });
  }
});

// A payload over the limit above reaches here as an express body-parser
// error rather than a route handler, so without this it would surface to
// the client as an opaque 500 (or a hung request) instead of something
// actionable.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ ok: false, error: `That file is too large - the limit is ${CORE_SET_UPLOAD_LIMIT}.` });
    return;
  }
  next(err);
});

// Registered before the client's SPA fallback below so /mockups/* is served
// as plain static files instead of falling through to index.html.
if (existsSync(MOCKUPS_DIR_PATH)) {
  app.use("/mockups", express.static(MOCKUPS_DIR_PATH));
  log.info("boot", "serving design mockups at /mockups", { path: MOCKUPS_DIR_PATH });
}

const clientIndexPath = path.join(CLIENT_DIST_PATH, "index.html");
const hasClientBuild = existsSync(clientIndexPath);
if (hasClientBuild) {
  app.use(express.static(CLIENT_DIST_PATH));
  // SPA fallback: any non-API route (e.g. /room/ABCD) renders the client
  // shell, which then does its own client-side routing.
  app.get(/^(?!\/health).*/, (_req, res) => {
    res.sendFile(clientIndexPath);
  });
  log.info("boot", "serving built client", { path: CLIENT_DIST_PATH });
} else {
  log.warn("boot", "no client build found - run \"npm run build -w client\" to serve it from here", { path: CLIENT_DIST_PATH });
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
  // Phones on flaky wifi routinely leave a socket that looks open but
  // carries nothing (a half-open connection). socket.io only notices when
  // a ping goes unanswered, and the defaults (25s interval, 20s timeout)
  // can leave a player staring at a frozen board for the best part of a
  // minute. Tighter values trade a little idle traffic for spotting a dead
  // link in ~15s, at which point the client reconnects and re-syncs.
  pingInterval: 10000,
  pingTimeout: 5000,
});

const roomManager = new RoomManager(io, cardData, getDefaultTheme());
registerSocketHandlers(io, roomManager);

httpServer.listen(PORT, () => {
  log.info("boot", "server listening", { port: PORT });
});

// A deploy restarts this process (NSSM stop/start) without warning -
// anyone mid-game would otherwise just silently disconnect and have no
// idea why. NSSM's default stop sequence sends SIGINT first (mapped from a
// console control event), escalating to a hard kill after ~1.5s per stage
// if the process hasn't exited - the delay below stays well under that so
// the graceful path always wins over the hard kill.
let shuttingDown = false;
function shutdown(logLine: string, playerMessage: string, exitCode: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  const closed = roomManager.closeAllRooms(playerMessage);
  log.info("shutdown", logLine, { roomsClosed: closed });
  // Give the "kicked" emits a moment to actually reach clients before the
  // process (and its open sockets) go away.
  setTimeout(() => {
    httpServer.close(() => process.exit(exitCode));
    setTimeout(() => process.exit(exitCode), 500).unref();
  }, 400);
}

function gracefulShutdown(signal: string): void {
  shutdown(
    `${signal} received`,
    "The server is restarting to apply an update — sorry for the interruption! This app is a work in progress. Rejoin with your room code in a few seconds.",
    0
  );
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Last line of defence. Room phase timers (Room.safeTimeout) and the idle
// sweep already contain their own failures to a single room, so reaching
// here means something threw outside all of that. Node's default for an
// uncaught throw is to print the stack and exit immediately, which would
// drop every connected player mid-round with no explanation at all - so
// even though the process state is no longer trustworthy and we must still
// exit, it's worth the few hundred ms to tell people why first.
process.on("uncaughtException", (err) => {
  log.error("crash", "uncaught exception - shutting down", { err: String(err) });
  if (err instanceof Error && err.stack) console.error(err.stack);
  shutdown(
    "uncaughtException",
    "The server hit an unexpected error and had to restart — sorry! This app is a work in progress. Rejoin with your room code in a few seconds.",
    1
  );
});
process.on("unhandledRejection", (reason) => {
  log.error("crash", "unhandled promise rejection - shutting down", { reason: String(reason) });
  if (reason instanceof Error && reason.stack) console.error(reason.stack);
  shutdown(
    "unhandledRejection",
    "The server hit an unexpected error and had to restart — sorry! This app is a work in progress. Rejoin with your room code in a few seconds.",
    1
  );
});
