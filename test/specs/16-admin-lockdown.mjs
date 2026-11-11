import { makeClient, waitFor, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Shared card library is read-public, write-admin";

export const serverEnv = { ADMIN_PASSWORD: "spec-password" };

/**
 * The shared content stores (custom cards, sets, presets) are global to the
 * whole server, not scoped to a room - so before this, anyone who found the
 * public URL could add cards to everyone's games or delete the entire
 * library. There was no auth on any of it.
 *
 * Reads must stay open: a host has to be able to browse packs to build a
 * deck. So this asserts the split, not a blanket lock.
 */
export default async function ({ baseUrl }) {
  const stranger = makeClient(baseUrl, "Stranger");
  const admin = makeClient(baseUrl, "Admin");
  await waitFor(() => stranger.socket.connected && admin.socket.connected, { label: "sockets to connect" });

  try {
    // --- Reads are public, with no login at all.
    const cards = await stranger.ack("listCustomCards");
    assert(cards && Array.isArray(cards.white), "listing custom cards must work without admin");
    const sets = await stranger.ack("listCustomSets");
    assert(Array.isArray(sets), "listing custom sets must work without admin");

    // --- Writes from a stranger are refused, and change nothing.
    const beforeWhite = cards.white.length;
    const errorsBefore = stranger.errors.length;

    await stranger.ack("addCustomWhiteCard", { text: "Injected by a stranger." });
    await waitFor(() => stranger.errors.length > errorsBefore, { label: "the write to be refused" });
    assert(
      stranger.errors.slice(errorsBefore).some((e) => e.code === "ADMIN_REQUIRED"),
      `expected ADMIN_REQUIRED, got ${JSON.stringify(stranger.errors.slice(errorsBefore))}`
    );

    const afterAttempt = await stranger.ack("listCustomCards");
    assertEqual(afterAttempt.white.length, beforeWhite, "a refused write must not change the library");

    // --- The destructive ones are refused too.
    for (const [event, payload] of [
      ["deleteCustomCard", { id: "anything" }],
      ["createCustomSet", { name: "Stranger Set", white: ["x"], black: [] }],
      ["deleteCustomSet", { setId: "anything" }],
      ["uploadCustomCards", { customCards: { white: [], black: [] }, customSets: [] }],
    ]) {
      const before = stranger.errors.length;
      await stranger.ack(event, payload);
      await waitFor(() => stranger.errors.length > before, { label: `${event} to be refused` });
      assert(
        stranger.errors.slice(before).some((e) => e.code === "ADMIN_REQUIRED"),
        `${event} should require admin`
      );
    }

    // --- Presets are deliberately NOT gated. They are configuration a host
    // saves in-flow while setting a game up, not authored content, and a
    // lost one is seconds to recreate - gating them would mean typing the
    // admin password at a party to save a table style.
    const presetErrorsBefore = stranger.errors.length;
    const presets = await stranger.ack("savePackSelectionPreset", {
      preset: { name: "Guest Preset", packIds: [], excludedCardIds: [] },
    });
    assert(
      presets.some((p) => p.name === "Guest Preset"),
      "a guest should still be able to save a pack-selection preset"
    );
    assertEqual(stranger.errors.length, presetErrorsBefore, "saving a preset must not be refused");
    await stranger.ack("deletePackSelectionPreset", { name: "Guest Preset" });

    // --- A wrong password does not grant access.
    const bad = await stranger.ack("adminLogin", { password: "not-the-password" });
    assert(!bad.ok, "a wrong password must be refused");
    const stillBlocked = stranger.errors.length;
    await stranger.ack("addCustomWhiteCard", { text: "Still blocked." });
    await waitFor(() => stranger.errors.length > stillBlocked, { label: "still refused after a failed login" });

    // --- The right password works, and unlocks writes.
    const good = await admin.ack("adminLogin", { password: "spec-password" });
    assert(good.ok && good.token, "the correct password should return a token");

    const adminErrorsBefore = admin.errors.length;
    const added = await admin.ack("addCustomWhiteCard", { text: "Added by admin." });
    assertEqual(admin.errors.length, adminErrorsBefore, "an admin write must not be refused");
    assert(
      added.white.some((c) => c.text === "Added by admin."),
      "the admin's card should be in the returned library"
    );

    // --- Admin is per-connection: the stranger is still locked out.
    const strangerAfter = stranger.errors.length;
    await stranger.ack("addCustomWhiteCard", { text: "Sneaking in." });
    await waitFor(() => stranger.errors.length > strangerAfter, { label: "the stranger to remain locked out" });

    // --- A token resumes admin on a fresh connection, so a reconnect
    // doesn't force the password to be typed again.
    const reconnected = makeClient(baseUrl, "AdminAgain");
    await waitFor(() => reconnected.socket.connected, { label: "second admin socket" });
    const resumed = await reconnected.ack("adminResume", { token: good.token });
    assert(resumed.ok, "a valid token should restore admin on a new connection");
    const resumedErrors = reconnected.errors.length;
    await reconnected.ack("addCustomWhiteCard", { text: "Added after resuming." });
    assertEqual(reconnected.errors.length, resumedErrors, "a resumed admin should be able to write");

    // A junk token must not.
    const junk = makeClient(baseUrl, "Junk");
    await waitFor(() => junk.socket.connected, { label: "junk socket" });
    const junkResume = await junk.ack("adminResume", { token: "not-a-real-token" });
    assert(!junkResume.ok, "a bogus token must not grant admin");
    junk.close();
    reconnected.close();

    // --- Clean up what this spec added, so the store doesn't accumulate.
    const finalList = await admin.ack("listCustomCards");
    for (const c of finalList.white.filter((x) => /Added by admin|Added after resuming/.test(x.text))) {
      await admin.ack("deleteCustomCard", { id: c.id });
    }
    await wait(100);
  } finally {
    stranger.close();
    admin.close();
  }
}
