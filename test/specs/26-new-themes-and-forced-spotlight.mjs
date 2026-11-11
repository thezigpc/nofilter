import { makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "New Table themes apply, and Parlour forces Spotlight on and keeps it on";

/**
 * Covers two things added alongside Neon/Techno/Beach/Parlour:
 *  - the four new theme names are accepted by updateTableStyle (a plain
 *    reskin, easy to get right structurally but easy to typo the name of).
 *  - Parlour's fanned/overlapping cards only read correctly through
 *    Spotlight (see index.css's .judging-grid.parlour-fan), so
 *    Room.updateTableStyle forces spotlightEnabled on for it and refuses to
 *    let it be turned off - checked here from both directions: switching
 *    theme to Parlour while spotlight is off, and trying to turn spotlight
 *    off while Parlour is already selected. Also covers the second place
 *    the same rule has to be duplicated: RoomManager.createRoom seeds a
 *    room's tableStyle directly from the admin's deployment-wide default,
 *    bypassing updateTableStyle entirely.
 */
export const serverEnv = { ADMIN_PASSWORD: "theme-forcing-spec-password" };

export default async function ({ server }) {
  const client = makeClient(server.baseUrl, "Host");
  await waitFor(() => client.socket.connected, { label: "socket to connect" });
  const ack = await client.ack("createRoom", { name: "Host", role: "player" });
  assert(ack.ok, `createRoom failed: ${JSON.stringify(ack)}`);
  await waitFor(() => client.state?.tableStyle, { label: "room state with tableStyle" });

  // --- Each new theme is accepted and actually applied. Spotlight starts
  // on by default (DEFAULT_TABLE_STYLE) for every room regardless of theme,
  // so turn it off first to prove neon/techno/beach - unlike Parlour below
  // - don't force it back on.
  client.emit("updateTableStyle", { tableStyle: { spotlightEnabled: false } });
  await waitFor(() => client.state.tableStyle.spotlightEnabled === false, { label: "spotlight to turn off" });
  for (const theme of ["neon", "site", "techno", "beach", "synthwave", "windward"]) {
    client.emit("updateTableStyle", { tableStyle: { theme, accentIndex: 0 } });
    await waitFor(() => client.state.tableStyle.theme === theme, { label: `theme to become ${theme}` });
    assertEqual(
      client.state.tableStyle.spotlightEnabled,
      false,
      `${theme} shouldn't force spotlight on the way Parlour does`
    );
  }

  // --- Switching to Parlour with spotlight off forces it on.
  client.emit("updateTableStyle", { tableStyle: { theme: "parlour", accentIndex: 0 } });
  await waitFor(() => client.state.tableStyle.theme === "parlour", { label: "theme to become parlour" });
  assertEqual(client.state.tableStyle.spotlightEnabled, true, "selecting Parlour must force spotlight on");

  // --- Trying to turn it back off while Parlour is selected is refused.
  client.emit("updateTableStyle", { tableStyle: { spotlightEnabled: false } });
  // No ack on this event, so give the (non-)change a moment to (not) land.
  await new Promise((r) => setTimeout(r, 200));
  assertEqual(client.state.tableStyle.spotlightEnabled, true, "spotlight can't be turned off while Parlour is selected");

  // --- Switching away from Parlour releases the lock - spotlight can be
  // turned off again (it isn't retroactively forced off, just no longer
  // forced on).
  client.emit("updateTableStyle", { tableStyle: { theme: "felt", accentIndex: 0 } });
  await waitFor(() => client.state.tableStyle.theme === "felt", { label: "theme to become felt" });
  client.emit("updateTableStyle", { tableStyle: { spotlightEnabled: false } });
  await waitFor(() => client.state.tableStyle.spotlightEnabled === false, {
    label: "spotlight to turn off once Parlour is no longer selected",
  });

  // --- The same enforcement applies when a room is SEEDED from the admin's
  // deployment-wide default theme (RoomManager.createRoom), which sets
  // tableStyle directly rather than going through updateTableStyle.
  const loginAck = await client.ack("adminLogin", { password: "theme-forcing-spec-password" });
  assert(loginAck.ok, "admin login should succeed");
  const defaultAck = await client.ack("setDefaultTheme", {
    theme: "parlour",
    accentIndex: 0,
    backgroundStyle: "flat",
    backgroundAnimated: false,
    mobileBackgroundEnabled: false,
    facedownOpacity: 100,
  });
  assert(defaultAck.ok, `setDefaultTheme failed: ${JSON.stringify(defaultAck)}`);

  const client2 = makeClient(server.baseUrl, "LateHost");
  await waitFor(() => client2.socket.connected, { label: "second socket to connect" });
  const lateAck = await client2.ack("createRoom", { name: "LateHost", role: "player" });
  assert(lateAck.ok, `second createRoom failed: ${JSON.stringify(lateAck)}`);
  await waitFor(() => client2.state?.tableStyle, { label: "second room state with tableStyle" });
  assertEqual(client2.state.tableStyle.theme, "parlour", "a room created after the default change should get Parlour");
  assertEqual(
    client2.state.tableStyle.spotlightEnabled,
    true,
    "a room seeded with Parlour as the deployment default must also start with spotlight forced on"
  );

  client.close();
  client2.close();
}
