import { makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Admin setup wizard: first-run password, then behaves like normal login";

/**
 * A fresh deploy has no ADMIN_PASSWORD env var and nothing persisted yet -
 * previously that meant the admin surfaces were just permanently locked,
 * with no way to unlock them short of an operator already knowing to set
 * an env var. Now the client's /admin page shows a setup wizard instead of
 * a login form in that state (driven by adminStatus's setupNeeded flag);
 * whoever completes it becomes admin, and it closes permanently afterward.
 *
 * Uses the runner's normal per-spec server - no ADMIN_PASSWORD is set in
 * serverEnv, so this boots in the genuine "needs setup" state.
 */
export default async function ({ server }) {
  const client = makeClient(server.baseUrl, "Setup");
  await waitFor(() => client.socket.connected, { label: "socket to connect" });

  // --- Fresh install: setup needed, nobody is admin yet.
  const fresh = await client.ack("adminStatus");
  assertEqual(fresh.setupNeeded, true, "an unconfigured server should report setupNeeded");
  assertEqual(fresh.configured, false, "nothing should be configured yet");
  assertEqual(fresh.isAdmin, false, "a fresh connection should not be admin");

  // --- Too-short password rejected.
  const tooShort = await client.ack("adminCompleteSetup", { password: "short", confirm: "short" });
  assertEqual(tooShort.ok, false, "a password under 8 characters should be refused");
  assert(tooShort.error?.includes("at least 8"), "the error should explain the minimum length");

  // --- Mismatched confirmation rejected.
  const mismatch = await client.ack("adminCompleteSetup", { password: "correcthorsebattery", confirm: "somethingelse" });
  assertEqual(mismatch.ok, false, "mismatched password/confirm should be refused");
  assert(mismatch.error?.includes("match"), "the error should mention the mismatch");

  // --- Setup should still be needed - neither bad attempt configured anything.
  const stillNeeded = await client.ack("adminStatus");
  assertEqual(stillNeeded.setupNeeded, true, "a rejected setup attempt must not configure anything");

  // --- A real setup succeeds and logs the completer in immediately on the same connection.
  const goodSetup = await client.ack("adminCompleteSetup", { password: "correcthorsebattery", confirm: "correcthorsebattery" });
  assert(goodSetup.ok && goodSetup.token, "a valid setup should succeed and issue a token");

  const afterOwnSetup = await client.ack("adminStatus");
  assertEqual(afterOwnSetup.isAdmin, true, "the connection that completed setup should already be admin");

  // --- A fresh connection now sees setupNeeded: false, and no admin session of its own.
  const other = makeClient(server.baseUrl, "Fresh");
  await waitFor(() => other.socket.connected, { label: "second socket to connect" });
  const afterSetup = await other.ack("adminStatus");
  assertEqual(afterSetup.setupNeeded, false, "the wizard must not still be offered after setup");
  assertEqual(afterSetup.configured, true, "the server should now report itself configured");
  assertEqual(afterSetup.isAdmin, false, "a brand new connection is not automatically admin");

  // --- The wizard can't be run again to silently overwrite the password.
  const secondSetup = await other.ack("adminCompleteSetup", { password: "totallydifferentpassword", confirm: "totallydifferentpassword" });
  assertEqual(secondSetup.ok, false, "setup should refuse to run a second time");

  // --- The original password chosen still works; a made-up one doesn't.
  const loginOriginal = await other.ack("adminLogin", { password: "correcthorsebattery" });
  assert(loginOriginal.ok && loginOriginal.token, "the password chosen during setup should keep working");

  const loginFakeSecond = makeClient(server.baseUrl, "Fake");
  await waitFor(() => loginFakeSecond.socket.connected, { label: "third socket to connect" });
  const loginFake = await loginFakeSecond.ack("adminLogin", { password: "totallydifferentpassword" });
  assertEqual(loginFake.ok, false, "the password from the refused second setup must not have taken effect");

  client.close();
  other.close();
  loginFakeSecond.close();
}
