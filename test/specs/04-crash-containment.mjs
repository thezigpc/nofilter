import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PROJECT_ROOT,
  makeRoom,
  selectOfficialPacks,
  playRound,
  waitFor,
  wait,
  assert,
} from "../harness.mjs";

export const name = "A crashing room closes alone; the server and other rooms survive";

/**
 * The whole point of Room.safeTimeout is behaviour that only appears when
 * something breaks, so this test breaks something on purpose.
 *
 * The fault is injected into the *built* output (server/dist) and reverted
 * afterwards, deliberately rather than adding a test-only hook to the
 * source: a fault-injection switch in production code is a liability, and
 * this way the thing under test is the real shipped logic.
 *
 * Guarded by env var so the injected line is inert unless the harness
 * explicitly arms it.
 */
export const serverEnv = { FAULT_INJECT_ROUNDEND: "1" };

const ROOM_JS = path.join(PROJECT_ROOT, "server", "dist", "rooms", "Room.js");
const ANCHOR = `this.phaseTimer = this.safeTimeout("roundEnd", ROUND_END_DELAY_MS, () => {`;
const FAULT = `\n            if (process.env.FAULT_INJECT_ROUNDEND === "1") throw new Error("test fault: simulated bug in roundEnd timer");`;

export default async function ({ baseUrl, server }) {
  // The harness already started the server, so patch, then let the running
  // process pick it up? No - the module is already loaded. Instead the
  // runner starts the server *after* this module is imported, but to be
  // safe we verify the fault is actually present in the running build.
  assert(
    readFileSync(ROOM_JS, "utf-8").includes("test fault: simulated bug"),
    "fault should have been injected before the server started (see prepare())"
  );

  // Room A will be driven into the faulty timer. Room B is the bystander.
  const roomA = await makeRoom(baseUrl, ["Alice", "Bob", "Carol"]);
  const roomB = await makeRoom(baseUrl, ["Dave", "Erin", "Frank"]);
  try {
    await selectOfficialPacks(roomA.host);
    roomA.host.emit("startGame");
    await roomA.host.waitForPhase("submission");

    // Drive room A to the round-end timer, which will throw.
    await playRound(roomA).catch(() => {
      /* the round never resolves cleanly - that's the point */
    });

    // 1. Every player in the broken room is told, rather than silently frozen.
    await waitFor(() => roomA.clients.every((c) => c.kicked.length > 0), {
      label: "room A players to receive a closure notice",
      timeout: 10000,
    });

    // 2. The process is still alive.
    const health = await fetch(`${baseUrl}/health`).then((r) => r.json());
    assert(health.ok === true, "the server process should still be serving requests");
    assert(!server.exited, "the server process should not have exited");

    // 3. The bystander room was untouched...
    assert(
      roomB.clients.every((c) => c.kicked.length === 0),
      "room B players should not have been kicked by room A's failure"
    );

    // 4. ...and is still fully functional afterwards.
    await selectOfficialPacks(roomB.host);
    roomB.host.emit("startGame");
    await roomB.host.waitForPhase("submission");
    await wait(100);
    assert(
      roomB.clients.every((c) => (c.state.yourHand ?? []).length > 0),
      "room B should still be able to start a game and deal hands"
    );
  } finally {
    roomA.closeAll();
    roomB.closeAll();
  }
}

/** Called by the runner before the server starts. */
export function prepare() {
  const src = readFileSync(ROOM_JS, "utf-8");
  if (src.includes("test fault: simulated bug")) return;
  if (!src.includes(ANCHOR)) {
    throw new Error(
      "Could not find the roundEnd safeTimeout call in server/dist/rooms/Room.js - " +
        "the build is stale or that code moved. Run `npm run build`."
    );
  }
  writeFileSync(ROOM_JS, src.replace(ANCHOR, ANCHOR + FAULT));
}

/** Called by the runner after the spec finishes, pass or fail. */
export function cleanup() {
  const src = readFileSync(ROOM_JS, "utf-8");
  if (!src.includes(FAULT.trim())) return;
  writeFileSync(ROOM_JS, src.replace(FAULT, ""));
}
