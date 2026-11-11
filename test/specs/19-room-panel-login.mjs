import { makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Room admin panel: login-gated, not just network-gated";

/**
 * Room management (list/close active rooms) used to be its own Express app
 * on a separate, non-tunneled port - "you can't reach this port from
 * outside the host" was its only protection. It's since moved to the
 * client's /admin route, using the same Socket.io admin session (password,
 * token pool - server/src/admin/auth.ts) as the card library. Unlike the
 * card library, there's no legitimate anonymous-read case for "what rooms
 * are active right now", so every one of these events requires login, not
 * just the writes.
 */
export const serverEnv = { ADMIN_PASSWORD: "panel-spec-password" };

export default async function ({ server }) {
  const client = makeClient(server.baseUrl, "Checker");
  await waitFor(() => client.socket.connected, { label: "socket to connect" });

  // --- Every room-management event needs login, reads included.
  const anonList = await client.ack("adminListRooms");
  assertEqual(anonList.ok, false, "adminListRooms must require login");

  const anonClose = await client.ack("adminCloseRoom", { code: "ABCD" });
  assertEqual(anonClose.ok, false, "adminCloseRoom must require login");

  const anonCloseAll = await client.ack("adminCloseAllRooms");
  assertEqual(anonCloseAll.ok, false, "adminCloseAllRooms must require login");

  // --- Wrong password: refused, no token granted.
  const wrongLogin = await client.ack("adminLogin", { password: "not-it" });
  assertEqual(wrongLogin.ok, false, "a wrong password must be refused");
  assert(!wrongLogin.token, "a refused login must not issue a token");

  // --- Right password: succeeds, unlocks room management.
  const goodLogin = await client.ack("adminLogin", { password: "panel-spec-password" });
  assert(goodLogin.ok && goodLogin.token, "a correct login should succeed and issue a token");

  const authedList = await client.ack("adminListRooms");
  assertEqual(authedList.ok, true, "the same connection should now be allowed to list rooms");
  assert(Array.isArray(authedList.rooms), "adminListRooms should return a rooms array once authenticated");

  // --- The same token pool as the card-library admin: a token issued here
  // must also satisfy adminResume (used by both the /admin page and Card
  // Management's AdminBar) on a completely different connection - one
  // login, one set of valid tokens (server/src/admin/auth.ts).
  const other = makeClient(server.baseUrl, "OtherTab");
  await waitFor(() => other.socket.connected, { label: "second socket to connect" });
  const resume = await other.ack("adminResume", { token: goodLogin.token });
  assertEqual(resume.ok, true, "the token from adminLogin should also satisfy adminResume elsewhere");
  const otherList = await other.ack("adminListRooms");
  assertEqual(otherList.ok, true, "resuming with the token should unlock room management on that connection too");

  // --- Logout invalidates the token in the shared pool, so a *new*
  // connection resuming with it is rejected - it does not retroactively
  // log out a connection that already has isAdmin cached from an earlier
  // successful login/resume (same session model as the card library).
  other.emit("adminLogout", { token: goodLogin.token });
  await new Promise((r) => setTimeout(r, 100));
  const stillCached = await client.ack("adminStatus");
  assertEqual(stillCached.isAdmin, true, "a connection's own cached session isn't revoked by another socket's logout");

  const thirdResume = makeClient(server.baseUrl, "ThirdTab");
  await waitFor(() => thirdResume.socket.connected, { label: "third socket to connect" });
  const resumeAfterLogout = await thirdResume.ack("adminResume", { token: goodLogin.token });
  assertEqual(resumeAfterLogout.ok, false, "the token must be rejected everywhere after logout");

  client.close();
  other.close();
  thirdResume.close();
}
