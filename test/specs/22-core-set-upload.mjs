import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer, makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Core Set: bundled sample by default, admin add/replace with repair, only new rooms see it";

/**
 * Covers the fresh-deploy story: no CARD_DATA_PATH env var set, nothing
 * uploaded yet, so the server boots on the small bundled sample-cards.json.
 * An admin can then upload a Core Set (add or replace), which is validated
 * and repaired through the same pass Custom Cards/Sets uploads use (see
 * server/src/cards/validate.ts) - this spec deliberately includes one card
 * with a pick/blank-count mismatch, the exact class of bug the "hercules"
 * card was found with (CLAUDE.md), to prove the repair actually runs.
 *
 * Also proves the "only new rooms" swap semantics: a room created before
 * the upload must never see the new pack, even after further broadcasts;
 * only a room created after does. This is RoomManager.setCardData() and
 * each Room's own captured cardData reference, exercised end to end rather
 * than just unit-checked.
 */
export default async function ({ server: lockedServer }) {
  // --- A normally-booted spec server (harness always sets CARD_DATA_PATH)
  // is "locked": an env override is active, so uploads must be refused.
  const lockedClient = makeClient(lockedServer.baseUrl, "LockedChecker");
  await waitFor(() => lockedClient.socket.connected, { label: "socket to connect" });
  const lockedInfo = await lockedClient.ack("getCoreSetInfo");
  assertEqual(lockedInfo.source, "env_override", "the harness's default server always has CARD_DATA_PATH set");
  assertEqual(lockedInfo.locked, true, "an env override should lock out Core Set uploads");
  lockedClient.close();

  // --- A dedicated instance with CARD_DATA_PATH unset, so it falls
  // through to the bundled sample / an uploaded Core Set instead.
  const dataDir = mkdtempSync(path.join(tmpdir(), "nofilter-coreset-test-"));
  let unlocked;
  try {
    unlocked = await startServer({
      port: 3419,
      env: { CARD_DATA_PATH: "", ADMIN_PASSWORD: "coreset-admin-pass", CORE_SET_PATH: path.join(dataDir, "core-set.json") },
    });

    const client = makeClient(unlocked.baseUrl, "Host");
    await waitFor(() => client.socket.connected, { label: "socket to connect" });

    // --- Boots on the bundled sample, unlocked.
    const initialInfo = await client.ack("getCoreSetInfo");
    assertEqual(initialInfo.source, "bundled_sample", "with no override and nothing uploaded, it should use the bundled sample");
    assertEqual(initialInfo.locked, false, "no env override active - uploads should be allowed");
    assertEqual(initialInfo.totalPacks, 1, "the bundled sample ships as a single pack");
    assert(initialInfo.totalWhite > 0 && initialInfo.totalBlack > 0, "the bundled sample should have real cards");
    assert(initialInfo.categories.includes("Starter"), "the bundled sample's own category should be reported");

    // --- A room created now captures the sample-only pack list.
    const createAck = await client.ack("createRoom", { name: "Host", role: "player" });
    assert(createAck.ok, `createRoom failed: ${JSON.stringify(createAck)}`);
    await waitFor(() => client.state?.packs?.length > 0, { label: "room state with packs" });
    const packsBeforeUpload = client.state.packs.length;
    assertEqual(packsBeforeUpload, 1, "the pre-upload room should only see the one bundled pack");

    // Uploading is an HTTP POST, not a socket event - a real card set is
    // far bigger than socket.io's per-message cap. See server/src/index.ts.
    const upload = (token, body) =>
      fetch(`${unlocked.baseUrl}/api/core-set`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token ?? "" },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    // --- Not logged in: upload should be refused.
    const anonAttempt = await upload(undefined, {
      mode: "add",
      packs: [{ name: "Nope", white: [{ text: "x" }], black: [] }],
    });
    assertEqual(anonAttempt.status, 401, "an unauthenticated upload must be refused");

    // --- Log in, then upload a pack with a deliberate pick/blank mismatch.
    const loginAck = await client.ack("adminLogin", { password: "coreset-admin-pass" });
    assert(loginAck.ok, "admin login should succeed with the right password");
    const token = loginAck.token;

    const uploadRes = await upload(token, {
      mode: "add",
      packs: [
        {
          name: "Uploaded Pack",
          category: "Community",
          white: [{ text: "A repaired card" }, { text: "  " }, { text: "Another one" }],
          black: [
            // 3 blanks but claims pick 1 - the "hercules" bug pattern.
            { text: "_ and _ and _.", pick: 1 },
            { text: "A normal open question with no blanks.", pick: 1 },
          ],
        },
      ],
    });
    const uploadAck = uploadRes.body;
    assertEqual(uploadRes.status, 200, `uploadCoreSet failed: ${JSON.stringify(uploadRes)}`);
    assertEqual(uploadAck.report.packsAdded, 1, "one valid pack should have been added");
    assertEqual(uploadAck.report.whiteAdded, 2, "the blank-text card should have been dropped, not counted");
    assertEqual(uploadAck.report.blackAdded, 2, "both black cards should have been kept");
    assertEqual(uploadAck.report.cardsRepaired, 1, "the pick-1/3-blanks card should have been corrected");
    assertEqual(uploadAck.report.cardsDropped, 1, "the blank-text white card should have been dropped");
    assertEqual(uploadAck.info.source, "uploaded_core_set", "the source should now reflect the upload");
    assertEqual(uploadAck.info.totalPacks, 2, "add mode should append, not replace");
    assert(uploadAck.info.categories.includes("Community"), "the uploaded pack's category should be reported");
    assert(uploadAck.info.categories.includes("Starter"), "the pre-existing category should still be reported");

    // --- The repaired card's pick actually landed as 3, not 1. Read from a
    // socket that isn't in a room, so it resolves against the current
    // (post-upload) card data - see the room-scoping assertions below.
    const onlooker = makeClient(unlocked.baseUrl, "Onlooker");
    await waitFor(() => onlooker.socket.connected, { label: "onlooker socket to connect" });
    const previewAck = await onlooker.ack("previewPack", { packId: "1" });
    assert(previewAck, "the newly uploaded pack should be previewable");
    const repairedCard = previewAck.black.find((c) => c.text === "_ and _ and _.");
    assert(repairedCard, "the repaired card should be present");
    assertEqual(repairedCard.pick, 3, "pick should have been corrected to match the 3 blanks in its text");

    // --- The room created BEFORE the upload must not see the new pack,
    // even after another broadcast.
    client.emit("updateHandSize", { value: 8 });
    await waitFor(() => client.state?.handSize === 8, { label: "handSize update to land" });
    assertEqual(client.state.packs.length, packsBeforeUpload, "a room created before the upload must not gain the new pack");

    // --- ...and previewing from inside that room must resolve against the
    // room's OWN card data, not the manager's newer copy. Pack ids are
    // array indices, so reading the wrong one silently returned a
    // different pack's cards entirely.
    const stalePreview = await client.ack("previewPack", { packId: "0" });
    assert(stalePreview, "the room's own pack 0 should still preview");
    assert(
      stalePreview.white.some((c) => c.text === "A haunted vending machine"),
      "a room created before the upload must still preview its ORIGINAL pack 0, not the new set's"
    );
    const outOfRangeForRoom = await client.ack("previewPack", { packId: "1" });
    assertEqual(outOfRangeForRoom, null, "a pack that only exists post-upload must not be previewable from an older room");
    onlooker.close();

    // --- A room created AFTER the upload sees both packs.
    const client2 = makeClient(unlocked.baseUrl, "LateHost");
    await waitFor(() => client2.socket.connected, { label: "second socket to connect" });
    const createAck2 = await client2.ack("createRoom", { name: "LateHost", role: "player" });
    assert(createAck2.ok, `second createRoom failed: ${JSON.stringify(createAck2)}`);
    await waitFor(() => client2.state?.packs?.length > 0, { label: "second room state with packs" });
    assertEqual(client2.state.packs.length, 2, "a room created after the upload should see both packs");

    // --- Deleting one pack by name keeps the rest - "upload an extra
    // category, take back just that one" without a full replace.
    const deletePack = (token, name) =>
      fetch(`${unlocked.baseUrl}/api/core-set/delete-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token ?? "" },
        body: JSON.stringify({ name }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    const anonDelete = await deletePack(undefined, "Uploaded Pack");
    assertEqual(anonDelete.status, 401, "an unauthenticated delete must be refused");

    const missingDelete = await deletePack(token, "Not A Real Pack Name");
    assertEqual(missingDelete.status, 400, "deleting a pack that doesn't exist should fail cleanly, not silently no-op");

    const deleteRes = await deletePack(token, "Uploaded Pack");
    assertEqual(deleteRes.status, 200, `delete failed: ${JSON.stringify(deleteRes)}`);
    assertEqual(deleteRes.body.removedCount, 1, "exactly one pack should have been removed");
    assertEqual(deleteRes.body.info.totalPacks, 1, "only the bundled pack should remain after deleting the uploaded one");
    assert(
      deleteRes.body.info.categories.includes("Starter") && !deleteRes.body.info.categories.includes("Community"),
      "the bundled pack's category should remain and the deleted pack's category should be gone"
    );

    // --- The room created before the delete still has its own captured
    // (2-pack) view - same "forward-looking only" guarantee uploads get.
    assertEqual(client.state.packs.length, packsBeforeUpload, "an existing room's captured packs must be untouched by the delete");

    // --- A room created AFTER the delete only sees what's left.
    const client3 = makeClient(unlocked.baseUrl, "PostDeleteHost");
    await waitFor(() => client3.socket.connected, { label: "third socket to connect" });
    const createAck3 = await client3.ack("createRoom", { name: "PostDeleteHost", role: "player" });
    assert(createAck3.ok, `third createRoom failed: ${JSON.stringify(createAck3)}`);
    await waitFor(() => client3.state?.packs?.length > 0, { label: "third room state with packs" });
    assertEqual(client3.state.packs.length, 1, "a room created after the delete should only see the remaining pack");
    client3.close();

    // --- Replace mode swaps the whole Core Set rather than appending.
    const replaceRes = await upload(token, {
      mode: "replace",
      packs: [
        {
          name: "Replacement Pack",
          category: "Fresh Start",
          white: [{ text: "Only this remains" }],
          black: [{ text: "Open question?", pick: 1 }],
        },
      ],
    });
    assertEqual(replaceRes.status, 200, `replace upload failed: ${JSON.stringify(replaceRes)}`);
    const replaceAck = replaceRes.body;
    assertEqual(replaceAck.info.totalPacks, 1, "replace mode should discard the previous packs, not append");
    assertEqual(replaceAck.info.categories.length, 1, "replace mode should discard the previous categories too");
    assertEqual(replaceAck.info.categories[0], "Fresh Start", "only the replacement pack's category should remain");

    // --- A card set far larger than socket.io's 1 MB per-message cap must
    // upload cleanly. This is why the route is HTTP and not a socket event:
    // over the socket the transport closed mid-send, the emit was replayed
    // on every reconnect, and the ack never fired - an invisible infinite
    // retry loop rather than an error.
    const bigWhite = [];
    for (let i = 0; i < 60000; i++) bigWhite.push({ text: `Bulk white card number ${i} with realistic length` });
    const bigBody = { mode: "add", packs: [{ name: "Bulk Pack", category: "Bulk", white: bigWhite, black: [] }] };
    const bigBytes = Buffer.byteLength(JSON.stringify(bigBody));
    assert(bigBytes > 2_000_000, `the size test needs to exceed the socket cap by a clear margin (was ${bigBytes})`);
    const bigRes = await upload(token, bigBody);
    assertEqual(bigRes.status, 200, `a ${(bigBytes / 1024 / 1024).toFixed(1)} MB upload should succeed over HTTP`);
    assertEqual(bigRes.body.report.whiteAdded, 60000, "every card in a large upload should be kept");

    client.close();
    client2.close();
  } finally {
    await unlocked?.stop().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
  }
}
