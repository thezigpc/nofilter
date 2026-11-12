import { makeRoom, makeClient, waitFor, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Bar Games: standalone (no BG_* env) behaves exactly as before";

/**
 * Rule 1 of the Bar Games integration: with no BG_* environment variables,
 * nothing about the game changes. This spec runs on the default server
 * (the harness never sets BG_*) and checks every place the integration
 * touched: the public config, the SDK's reserved paths, the room flow's
 * host rules, and that the box-only key/actor paths don't exist.
 */
export default async function ({ baseUrl }) {
  // --- /api/config: the game's own name, not a venue's.
  const cfg = await (await fetch(`${baseUrl}/api/config`)).json();
  assertEqual(cfg.gameName, "No Filter", "standalone game name is the game's own default");

  // --- The SDK middleware serves a standalone venue context...
  const venue = await (await fetch(`${baseUrl}/__bargames/venue.json`)).json();
  assertEqual(venue.standalone, true, "venue.json must say standalone");
  assertEqual(venue.game.displayName, "No Filter", "standalone venue context uses the game's name");
  // ...and refuses the box-only endpoints outright.
  assertEqual((await fetch(`${baseUrl}/__bargames/status`)).status, 401, "status needs the box token");
  const cmd = await fetch(`${baseUrl}/__bargames/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer guess" },
    body: JSON.stringify({ command: "end", roomCode: "ABCDE" }),
  });
  assertEqual(cmd.status, 401, "commands need the box token");
  // The SPA catch-all must not swallow other paths under the reserved prefix.
  assertEqual((await fetch(`${baseUrl}/__bargames/nope`)).status, 404, "unknown reserved path is a 404");

  // --- Room flow is unchanged: the first player is host, a Table still has
  // lobby authority, and a venue key means nothing on a normal room.
  const room = await makeRoom(baseUrl, ["Alice", "Bob"]);
  try {
    assertEqual(room.host.state.you.isHost, true, "first player is host");
    const table = makeClient(baseUrl, "Screen");
    await waitFor(() => table.socket.connected, { label: "table connect" });
    const ack = await table.ack("joinRoom", { roomCode: room.code, name: "Screen", role: "table", venueKey: "anything" });
    assert(ack.ok, "table joins a normal room");
    await waitFor(() => table.state, { label: "table state" });
    assertEqual(table.state.you.isHost, false, "a venue key gives nothing on a normal room");

    table.emit("updateHouseRules", { houseRules: { tradeIn: true } });
    await waitFor(() => room.host.state.houseRules.tradeIn === true, { label: "table's lobby authority still works" });

    // A socket can't impersonate the box's venue actor: its player id is
    // always the server-assigned one, so the actor id is unreachable.
    const bob = room.clients[1];
    const before = bob.errors.length;
    bob.emit("startGame");
    await waitFor(() => bob.errors.length > before, { label: "non-host start refused" });
    assertEqual(bob.errors.at(-1).code, "NOT_HOST", "non-host can't start");

    // Staff sign-in is box-only: off a box nobody is vouched for, even when
    // a request forges the gateway's headers.
    const forged = { "x-bargames-via": "1", "x-bargames-staff": "1" };
    const st = await (await fetch(`${baseUrl}/api/admin/status`, { headers: forged })).json();
    assertEqual(st.trusted, false, "standalone never trusts a staff header");
    const tr = await fetch(`${baseUrl}/api/admin/trusted`, { method: "POST", headers: forged });
    assertEqual(tr.status, 403, "no passwordless admin session standalone");

    // First-run setup is untouched off a box: open to whoever gets there.
    const soStatus = await room.host.ack("adminStatus");
    assertEqual(soStatus.venueLogin, false, "no venue login standalone");
    assertEqual(soStatus.setupAllowed, soStatus.setupNeeded, "standalone, setup is allowed whenever it's needed");

    // The venue box's password means nothing off a box: with no password
    // set, no password at all signs in.
    assertEqual((await room.host.ack("adminLogin", { password: "box-password" })).ok, false, "no box password standalone");

    // Casting is box-only: off a box the host gets enabled:false, no network.
    const tvs = await room.host.ack("listTvs");
    assertEqual(tvs.enabled, false, "casting is disabled standalone");
    const cast = await room.host.ack("castToTvs", { ids: ["roku:x"] });
    assertEqual(cast.ok, false, "cast refuses standalone");
    table.close();
  } finally {
    room.clients.forEach((c) => c.close());
  }
  await wait(50);
}
