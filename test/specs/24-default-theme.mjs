import { makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Admin can set the deployment's default theme; only new rooms pick it up";

/**
 * The default theme is what HomePage/Card Management/the admin page render
 * with (they have no room of their own to inherit a look from) and what a
 * brand new room's tableStyle starts as. Mirrors the same "only forward-
 * looking" semantics already proven for Core Set (RoomManager.setCardData)
 * and reuses the admin login/token pool - no new auth mechanism.
 */
export const serverEnv = { ADMIN_PASSWORD: "theme-spec-password" };

export default async function ({ server }) {
  const client = makeClient(server.baseUrl, "Host");
  await waitFor(() => client.socket.connected, { label: "socket to connect" });

  // --- Default before any admin change.
  const before = await fetch(`${server.baseUrl}/api/config`).then((r) => r.json());
  assertEqual(before.defaultTheme, "bulletin", "the out-of-the-box default should match DEFAULT_TABLE_STYLE");
  assertEqual(before.defaultAccentIndex, 0, "the out-of-the-box default accent should match DEFAULT_TABLE_STYLE");

  // --- A room created before any change gets that same default.
  const earlyAck = await client.ack("createRoom", { name: "Host", role: "player" });
  assert(earlyAck.ok, `createRoom failed: ${JSON.stringify(earlyAck)}`);
  await waitFor(() => client.state?.tableStyle, { label: "room state with tableStyle" });
  assertEqual(client.state.tableStyle.theme, "bulletin", "a room created before any admin change should get the current default");

  // --- Unauthenticated write refused.
  const anon = await client.ack("setDefaultTheme", { theme: "felt", accentIndex: 1 });
  assertEqual(anon.ok, false, "setDefaultTheme must require admin");

  // --- Invalid theme rejected even when authenticated.
  const loginAck = await client.ack("adminLogin", { password: "theme-spec-password" });
  assert(loginAck.ok, "admin login should succeed");
  const badTheme = await client.ack("setDefaultTheme", { theme: "not-a-real-theme", accentIndex: 0 });
  assertEqual(badTheme.ok, false, "an unknown theme name must be refused");

  // --- A real change succeeds and is reflected in /api/config immediately.
  // Background fields ride along with theme/accent now (see
  // server/src/tableStyle/store.ts) - an admin-set default with an
  // animated scene background used to only ever reach a room via a
  // manually-applied Lobby preset, never via the deployment default itself.
  const changed = await client.ack("setDefaultTheme", {
    theme: "felt",
    accentIndex: 2,
    backgroundStyle: "scene",
    backgroundAnimated: true,
    mobileBackgroundEnabled: true,
    facedownOpacity: 40,
  });
  assert(changed.ok, `setDefaultTheme failed: ${JSON.stringify(changed)}`);
  assertEqual(changed.theme, "felt", "the ack should echo the new theme");
  assertEqual(changed.accentIndex, 2, "the ack should echo the new accent index");
  assertEqual(changed.backgroundStyle, "scene", "the ack should echo the new background style");
  assertEqual(changed.backgroundAnimated, true, "the ack should echo the new animated flag");

  const after = await fetch(`${server.baseUrl}/api/config`).then((r) => r.json());
  assertEqual(after.defaultTheme, "felt", "/api/config should reflect the new default immediately");
  assertEqual(after.defaultAccentIndex, 2, "/api/config should reflect the new default accent immediately");
  assertEqual(after.defaultBackgroundStyle, "scene", "/api/config should reflect the new default background style");
  assertEqual(after.defaultBackgroundAnimated, true, "/api/config should reflect the new default animated flag");

  // --- An invalid background style is refused even when theme/accent are fine.
  const badBackground = await client.ack("setDefaultTheme", {
    theme: "felt",
    accentIndex: 2,
    backgroundStyle: "not-a-real-style",
    backgroundAnimated: false,
    mobileBackgroundEnabled: false,
    facedownOpacity: 100,
  });
  assertEqual(badBackground.ok, false, "an unknown background style must be refused");

  // --- Out-of-range accent index clamps rather than producing an invalid state.
  const outOfRange = await client.ack("setDefaultTheme", {
    theme: "felt",
    accentIndex: 999,
    backgroundStyle: "scene",
    backgroundAnimated: true,
    mobileBackgroundEnabled: true,
    facedownOpacity: 40,
  });
  assert(outOfRange.ok, "an out-of-range accent index should be clamped, not refused");
  assert(outOfRange.accentIndex < 999, "the stored accent index should have been clamped to a real swatch");

  // --- The room created BEFORE the change keeps its own look, unaffected.
  client.emit("updateHandSize", { value: 8 });
  await waitFor(() => client.state?.handSize === 8, { label: "handSize update to land" });
  assertEqual(client.state.tableStyle.theme, "bulletin", "an existing room's theme must not change retroactively");

  // --- A room created AFTER the change gets the new default.
  const client2 = makeClient(server.baseUrl, "LateHost");
  await waitFor(() => client2.socket.connected, { label: "second socket to connect" });
  const lateAck = await client2.ack("createRoom", { name: "LateHost", role: "player" });
  assert(lateAck.ok, `second createRoom failed: ${JSON.stringify(lateAck)}`);
  await waitFor(() => client2.state?.tableStyle, { label: "second room state with tableStyle" });
  assertEqual(client2.state.tableStyle.theme, "felt", "a room created after the change should get the new default");
  assertEqual(client2.state.tableStyle.backgroundStyle, "scene", "a room created after the change should get the new default background style");
  assertEqual(client2.state.tableStyle.backgroundAnimated, true, "a room created after the change should get the new default animated flag");
  assertEqual(client2.state.tableStyle.mobileBackgroundEnabled, true, "a room created after the change should get the new default mobile toggle");
  assertEqual(client2.state.tableStyle.facedownOpacity, 40, "a room created after the change should get the new default face-down opacity");

  client.close();
  client2.close();
}
