import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer, makeClient, makeRoom, selectOfficialPacks, waitForDeal, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Judge / Wild Card names are renameable, and pre-rename presets migrate";

/**
 * Three things, each guarding a different failure:
 *
 * 1. A host can rename both roles; the bot's seat and the server's own
 *    error messages follow, and a non-host cannot.
 * 2. The admin default seeds new rooms only (forward-looking, like the
 *    default theme), and survives a restart.
 * 3. A game-setup preset file written before the rename (randoCardrissian,
 *    randoCanScore, czar_accent) is migrated on load and rewritten on disk -
 *    the whole point being that existing deployments need no hand edits.
 */
export default async function () {
  const sharedDir = mkdtempSync(path.join(tmpdir(), "nofilter-rolenames-test-"));
  const presetsPath = path.join(sharedDir, "game-setup-presets.json");
  const roleNamesPath = path.join(sharedDir, "role-names.json");
  writeFileSync(
    presetsPath,
    JSON.stringify([
      {
        name: "Old Chaos",
        houseRules: { randoCardrissian: true, randoCanScore: true, doubleDown: true },
        actionCardTiers: { czar_accent: "rare", tax: "common" },
      },
    ])
  );
  const env = { GAME_SETUP_PRESETS_PATH: presetsPath, ROLE_NAMES_PATH: roleNamesPath, ADMIN_PASSWORD: "role-names-spec" };

  let server;
  try {
    server = await startServer({ port: 3429, env });

    // --- 3. The legacy preset loads under the new keys...
    const room = await makeRoom(server.baseUrl);
    const host = room.host;
    const presets = await host.ack("listGameSetupPresets");
    const old = presets.find((p) => p.name === "Old Chaos");
    assert(old, "the legacy preset should still be listed");
    assertEqual(old.houseRules.wildCard, true, "randoCardrissian should become wildCard");
    assertEqual(old.houseRules.wildCardCanScore, true, "randoCanScore should become wildCardCanScore");
    assert(!("randoCardrissian" in old.houseRules), "the legacy key should be gone");
    assertEqual(old.actionCardTiers.judge_accent, "rare", "czar_accent tier should become judge_accent");
    // ...and the file on disk was rewritten, so the migration is one-off.
    const onDisk = readFileSync(presetsPath, "utf8");
    assert(!onDisk.includes("rando") && !onDisk.includes("czar"), `the presets file should be rewritten: ${onDisk}`);

    // Applying a setup that still uses the old keys (an old client tab
    // open across a deploy) must still turn Wild Card on, not be ignored.
    host.emit("applyGameSetup", { setup: { houseRules: { randoCardrissian: true }, actionCardTiers: { czar_accent: "off" } } });
    await waitFor(() => host.state.houseRules.wildCard === true, { label: "a legacy-keyed setup to enable Wild Card" });
    assert(!("randoCardrissian" in host.state.houseRules), "legacy key must not leak into room state");
    assertEqual(host.state.actionCardTiers.judge_accent, "off", "legacy action card id should map on apply");

    // --- 1. Defaults, then a host rename.
    assertEqual(host.state.roleNames.judge, "Judge", "default Judge name");
    assertEqual(host.state.roleNames.wildCard, "Wild Card", "default Wild Card name");
    host.emit("updateRoleNames", { roleNames: { judge: "  Big   Cheese  ", wildCard: "Al Gorithm" } });
    await waitFor(() => host.state.roleNames.judge === "Big Cheese", { label: "the rename to apply (whitespace collapsed)" });
    assertEqual(host.state.roleNames.wildCard, "Al Gorithm", "Wild Card rename");

    // An empty name falls back instead of blanking the role.
    host.emit("updateRoleNames", { roleNames: { judge: "   " } });
    await new Promise((r) => setTimeout(r, 200));
    assertEqual(host.state.roleNames.judge, "Big Cheese", "an empty name must not blank the role");

    // Non-hosts can't rename.
    const bob = room.clients[1];
    const before = bob.errors.length;
    bob.emit("updateRoleNames", { roleNames: { judge: "Bob's Choice" } });
    await waitFor(() => bob.errors.length > before, { label: "the non-host rejection" });
    assertEqual(host.state.roleNames.judge, "Big Cheese", "a non-host must not rename roles");

    // Start the game: the bot sits in with the room's name, and the
    // server's own messages use the room's Judge name.
    await selectOfficialPacks(host);
    host.emit("startGame");
    await waitFor(() => host.state.phase === "submission", { label: "the game to start" });
    await waitForDeal(room);
    const bot = host.state.players.find((p) => p.isWildCard);
    assert(bot, "the Wild Card bot should be seated");
    assertEqual(bot.name, "Al Gorithm", "the bot should carry the room's Wild Card name");

    const judge = room.clients.find((c) => c.state.you.isJudge);
    assert(judge, "someone should be Judge");
    const errs = judge.errors.length;
    judge.emit("submitCards", { cardIds: [judge.state.yourHand[0].id] });
    await waitFor(() => judge.errors.length > errs, { label: "the Judge's submit to be refused" });
    const msg = JSON.stringify(judge.errors[judge.errors.length - 1]);
    assert(msg.includes("Big Cheese"), `error should use the room's Judge name: ${msg}`);
    room.clients.forEach((c) => c.close());

    // --- 2. Admin default: seeds new rooms, leaves existing ones alone, persists.
    const admin = makeClient(server.baseUrl, "Admin");
    await waitFor(() => admin.socket.connected, { label: "admin socket" });
    const login = await admin.ack("adminLogin", { password: "role-names-spec" });
    assert(login.ok, "admin login");
    const set = await admin.ack("setDefaultRoleNames", { roleNames: { judge: "Tastemaker", wildCard: "" } });
    assert(set.ok, "setDefaultRoleNames should succeed");
    assertEqual(set.roleNames.wildCard, "Wild Card", "an empty default falls back to the built-in name");
    const cfg = await (await fetch(`${server.baseUrl}/api/config`)).json();
    assertEqual(cfg.defaultRoleNames.judge, "Tastemaker", "/api/config exposes the default");
    const room2 = await makeRoom(server.baseUrl);
    assertEqual(room2.host.state.roleNames.judge, "Tastemaker", "a new room is seeded from the admin default");
    room2.clients.forEach((c) => c.close());

    // A non-admin can't set the default.
    const anon = makeClient(server.baseUrl, "Nobody");
    await waitFor(() => anon.socket.connected, { label: "anon socket" });
    const denied = await anon.ack("setDefaultRoleNames", { roleNames: { judge: "Hacker", wildCard: "X" } });
    assertEqual(denied.ok, false, "a non-admin must not set the default");
    anon.close();
    admin.close();
    await server.stop();

    server = await startServer({ port: 3439, env });
    const cfg2 = await (await fetch(`${server.baseUrl}/api/config`)).json();
    assertEqual(cfg2.defaultRoleNames.judge, "Tastemaker", "the admin default survives a restart");
  } finally {
    await server?.stop().catch(() => {});
    rmSync(sharedDir, { recursive: true, force: true });
  }
}
