import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer, makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Admin passwords from before the game kit still work; a damaged file fails closed";

/**
 * Every live deployment's admin-password.json was written by this game's own
 * auth code, which derived the scrypt key from the salt's hex STRING. The
 * game kit defaults to the salt's raw bytes - adopting it without the
 * "string" salt format would lock every existing admin out. This writes a
 * file exactly the old way and logs in with it.
 */
export default async function () {
  const dir = mkdtempSync(path.join(tmpdir(), "nofilter-authcompat-"));
  const hashPath = path.join(dir, "admin-password.json");
  let server;
  try {
    // --- An old-format file (no "format" field), as the pre-kit code wrote it.
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync("old-deployment-pw", salt, 64).toString("hex");
    writeFileSync(hashPath, JSON.stringify({ hash, salt }, null, 2));

    server = await startServer({ port: 3459, env: { ADMIN_PASSWORD_HASH_PATH: hashPath } });
    const c = makeClient(server.baseUrl, "Admin");
    await waitFor(() => c.socket.connected, { label: "connect" });
    const status = await c.ack("adminStatus");
    assertEqual(status.setupNeeded, false, "an existing password file means no setup wizard");
    assertEqual(status.configured, true, "configured");
    const ok = await c.ack("adminLogin", { password: "old-deployment-pw" });
    assert(ok.ok && ok.token, `the pre-kit password must still work: ${JSON.stringify(ok)}`);
    assertEqual((await c.ack("adminLogin", { password: "nope" })).ok, false, "a wrong password is still refused");
    const resumed = await c.ack("adminResume", { token: ok.token });
    assertEqual(resumed.ok, true, "the issued token resumes a session");
    c.close();
    await server.stop();
    server = null;

    // --- A damaged file: no wizard (a land grab), no login, file untouched.
    writeFileSync(hashPath, "{ this is not json");
    server = await startServer({ port: 3469, env: { ADMIN_PASSWORD_HASH_PATH: hashPath } });
    const d = makeClient(server.baseUrl, "Admin2");
    await waitFor(() => d.socket.connected, { label: "connect 2" });
    const s2 = await d.ack("adminStatus");
    assertEqual(s2.setupNeeded, false, "a damaged file must not reopen the setup wizard");
    const setup = await d.ack("adminCompleteSetup", { password: "attacker-pw!", confirm: "attacker-pw!" });
    assertEqual(setup.ok, false, "setup is refused over a damaged file");
    const bad = await d.ack("adminLogin", { password: "old-deployment-pw" });
    assertEqual(bad.ok, false, "no login against a damaged file");
    assert(/damaged/i.test(bad.error ?? ""), `the error says why: ${JSON.stringify(bad)}`);
    assertEqual(readFileSync(hashPath, "utf8"), "{ this is not json", "the damaged file is left untouched");
    d.close();
  } finally {
    await server?.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}
