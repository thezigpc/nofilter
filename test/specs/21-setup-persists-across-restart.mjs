import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer, makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "A password chosen through setup survives a real process restart";

/**
 * The entire point of persisting the setup-wizard password to disk instead
 * of keeping it only in memory is that it has to survive a restart - unlike
 * the token pool, which is deliberately wiped on every restart
 * (server/src/admin/auth.ts). Proving that needs a genuine second process
 * reading the file fresh, not just a re-read within one still-running
 * server - the module-level cache in auth.ts only exists per-process, so a
 * same-process check wouldn't actually exercise the disk read at all.
 *
 * startServer()'s own dataDir (table styles, custom cards, etc.) is
 * per-instance and thrown away by stop() as usual - only
 * ADMIN_PASSWORD_HASH_PATH is pinned to a directory this spec owns and
 * shares across both instances, so instance B reads the exact file instance
 * A wrote.
 */
export default async function () {
  const sharedDir = mkdtempSync(path.join(tmpdir(), "nofilter-restart-test-"));
  const hashPath = path.join(sharedDir, "admin-password.json");

  let first;
  let second;
  try {
    // --- Instance A: complete setup, then shut down normally.
    first = await startServer({ port: 3399, env: { ADMIN_PASSWORD_HASH_PATH: hashPath } });
    const firstClient = makeClient(first.baseUrl, "First");
    await waitFor(() => firstClient.socket.connected, { label: "first socket to connect" });
    const setupRes = await firstClient.ack("adminCompleteSetup", {
      password: "survives-a-restart",
      confirm: "survives-a-restart",
    });
    assert(setupRes.ok, `setup should succeed on the first instance: ${JSON.stringify(setupRes)}`);
    firstClient.close();
    await first.stop();
    first = null;

    // --- Instance B: a genuinely fresh process, same hash file.
    second = await startServer({ port: 3409, env: { ADMIN_PASSWORD_HASH_PATH: hashPath } });
    const secondClient = makeClient(second.baseUrl, "Second");
    await waitFor(() => secondClient.socket.connected, { label: "second socket to connect" });

    const status = await secondClient.ack("adminStatus");
    assertEqual(status.setupNeeded, false, "a fresh process reading the same hash file must not re-offer setup");
    assertEqual(status.configured, true, "it should report itself already configured");

    const login = await secondClient.ack("adminLogin", { password: "survives-a-restart" });
    assert(login.ok, "the password chosen on the first instance should still work on the second");

    const wrongPassword = await secondClient.ack("adminLogin", { password: "not-it" });
    assertEqual(wrongPassword.ok, false, "an unrelated password should still be refused after the restart");

    secondClient.close();
  } finally {
    await first?.stop().catch(() => {});
    await second?.stop().catch(() => {});
    rmSync(sharedDir, { recursive: true, force: true });
  }
}
