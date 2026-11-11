import { makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Background style/facedown opacity validate and persist, mobile background stays off by default";

/**
 * Covers the three fields added alongside every theme getting a glow AND
 * a drawn-scene background option (see client/src/themeScenes.ts):
 *  - backgroundStyle only accepts "flat" | "glow" | "scene" - anything
 *    else is rejected rather than silently accepted (unlike theme/
 *    accentIndex, which still only have TypeScript-level safety).
 *  - facedownOpacity clamps into [MIN_FACEDOWN_OPACITY, MAX_FACEDOWN_OPACITY]
 *    the same way maxCardSize already does, rather than rejecting or
 *    accepting an out-of-range value verbatim.
 *  - mobileBackgroundEnabled and backgroundAnimated are plain booleans
 *    that persist through updateTableStyle, and both default to false -
 *    a continuously-animating/always-on background on every phone in the
 *    room is a bigger ask than the Shared Screen alone ever was.
 */
export default async function ({ server }) {
  const client = makeClient(server.baseUrl, "Host");
  await waitFor(() => client.socket.connected, { label: "socket to connect" });
  const ack = await client.ack("createRoom", { name: "Host", role: "player" });
  assert(ack.ok, `createRoom failed: ${JSON.stringify(ack)}`);
  await waitFor(() => client.state?.tableStyle, { label: "room state with tableStyle" });

  // --- Defaults: glow background, animation off, mobile off, full opacity.
  assertEqual(client.state.tableStyle.backgroundStyle, "glow", "default backgroundStyle should be glow");
  assertEqual(client.state.tableStyle.backgroundAnimated, false, "backgroundAnimated should default off");
  assertEqual(client.state.tableStyle.mobileBackgroundEnabled, false, "mobileBackgroundEnabled should default off");
  assertEqual(client.state.tableStyle.facedownOpacity, 100, "facedownOpacity should default to fully opaque");

  // --- Each valid backgroundStyle is accepted.
  for (const style of ["flat", "scene", "glow"]) {
    client.emit("updateTableStyle", { tableStyle: { backgroundStyle: style } });
    await waitFor(() => client.state.tableStyle.backgroundStyle === style, { label: `backgroundStyle to become ${style}` });
  }

  // --- An invalid backgroundStyle is rejected, not silently accepted.
  // updateTableStyle is fire-and-forget (no ack) - the guard we're
  // checking is that state never changes, same pattern other rejected-
  // fire-and-forget cases use elsewhere in this suite.
  const before = client.state.tableStyle.backgroundStyle;
  client.emit("updateTableStyle", { tableStyle: { backgroundStyle: "sparkle" } });
  await new Promise((r) => setTimeout(r, 200));
  assertEqual(client.state.tableStyle.backgroundStyle, before, "an invalid backgroundStyle must be rejected, not applied");

  // --- facedownOpacity clamps into range rather than rejecting or passing
  // an out-of-range value through verbatim.
  client.emit("updateTableStyle", { tableStyle: { facedownOpacity: 1000 } });
  await waitFor(() => client.state.tableStyle.facedownOpacity === 100, { label: "facedownOpacity to clamp to max" });
  client.emit("updateTableStyle", { tableStyle: { facedownOpacity: -50 } });
  await waitFor(() => client.state.tableStyle.facedownOpacity === 20, { label: "facedownOpacity to clamp to min" });
  client.emit("updateTableStyle", { tableStyle: { facedownOpacity: 55 } });
  await waitFor(() => client.state.tableStyle.facedownOpacity === 55, { label: "facedownOpacity to accept an in-range value" });

  // --- backgroundAnimated and mobileBackgroundEnabled persist as set.
  client.emit("updateTableStyle", { tableStyle: { backgroundAnimated: true, mobileBackgroundEnabled: true } });
  await waitFor(
    () => client.state.tableStyle.backgroundAnimated === true && client.state.tableStyle.mobileBackgroundEnabled === true,
    { label: "backgroundAnimated and mobileBackgroundEnabled to both turn on" }
  );

  // --- The renamed hazard-stripe theme ("site") and the new digital-club
  // "techno" are both accepted, distinct theme names - neither forces
  // Spotlight the way Parlour does.
  for (const theme of ["site", "techno"]) {
    client.emit("updateTableStyle", { tableStyle: { theme, spotlightEnabled: false } });
    await waitFor(() => client.state.tableStyle.theme === theme, { label: `theme to become ${theme}` });
    assertEqual(client.state.tableStyle.spotlightEnabled, false, `${theme} shouldn't force spotlight on`);
  }

  client.close();
}
