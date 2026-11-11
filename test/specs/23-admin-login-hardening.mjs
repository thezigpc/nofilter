import { makeClient, waitFor, assert } from "../harness.mjs";

export const name = "Admin login can't be used to freeze the server, and can't lock the admin out";

/**
 * Regression guard for a real, measured vulnerability: adminLogin used
 * scryptSync on the request path with no rate limiting. Each hash blocks
 * the single event loop that runs every active game for ~30ms, so one
 * unauthenticated client looping password guesses degraded normal
 * round-trips by ~65x (0.6ms -> 39ms) - every room in the process freezing
 * while an attacker guessed passwords for free.
 *
 * The fix is async scrypt (work moves to libuv's threadpool, loop stays
 * free) plus a global concurrency cap and escalating delay on repeated
 * failures. Global rather than per-IP on purpose: cloudflared presents all
 * tunnel traffic as localhost, so per-IP limits are meaningless here, and
 * per-socket limits are free to bypass by reconnecting.
 *
 * The thresholds below are deliberately loose - they exist to catch a
 * regression back to synchronous hashing (which is orders of magnitude
 * worse), not to police normal timing jitter on a busy machine.
 */
export default async function ({ server }) {
  // No ADMIN_PASSWORD in serverEnv, so this uses the hashed (scrypt) path -
  // the one every public deploy gets via the setup wizard.
  const setup = makeClient(server.baseUrl, "Setup");
  await waitFor(() => setup.socket.connected, { label: "setup socket to connect" });
  const done = await setup.ack("adminCompleteSetup", {
    password: "a-real-admin-password",
    confirm: "a-real-admin-password",
  });
  assert(done.ok, `setup should succeed: ${JSON.stringify(done)}`);

  // A normal client, standing in for "every player in every active room".
  const player = makeClient(server.baseUrl, "Player");
  await waitFor(() => player.socket.connected, { label: "player socket to connect" });
  const roundTrip = async () => {
    const t0 = Date.now();
    await player.ack("getCoreSetInfo");
    return Date.now() - t0;
  };

  await roundTrip(); // warm up
  let baseline = 0;
  for (let i = 0; i < 10; i++) baseline += await roundTrip();
  baseline /= 10;

  // Several attackers guessing in parallel, with no credentials at all.
  const attackers = [];
  for (let i = 0; i < 6; i++) {
    const a = makeClient(server.baseUrl, `Attacker${i}`);
    await waitFor(() => a.socket.connected, { label: "attacker socket to connect" });
    attackers.push(a);
  }
  let stop = false;
  let attempts = 0;
  const loops = attackers.map(async (a) => {
    while (!stop) {
      await a.ack("adminLogin", { password: `guess-${attempts++}` });
    }
  });

  let underAttack = 0;
  for (let i = 0; i < 10; i++) underAttack += await roundTrip();
  underAttack /= 10;

  stop = true;
  await Promise.all(loops);

  assert(
    underAttack < 100,
    `gameplay round-trips must stay responsive while admin logins are being spammed - ` +
      `baseline ${baseline.toFixed(1)}ms, under attack ${underAttack.toFixed(1)}ms after ${attempts} guesses. ` +
      `A large number here means password hashing is blocking the event loop again (scryptSync instead of scrypt).`
  );

  // The throttle must slow attackers without ever locking the real admin
  // out - a limiter that refuses the correct password is its own outage.
  const admin = makeClient(server.baseUrl, "RealAdmin");
  await waitFor(() => admin.socket.connected, { label: "admin socket to connect" });
  const login = await admin.ack("adminLogin", { password: "a-real-admin-password" });
  assert(login.ok && login.token, `the correct password must still work after an attack: ${JSON.stringify(login)}`);

  // And a wrong password still fails, i.e. the throttle didn't start
  // waving things through under load.
  const wrong = await admin.ack("adminLogin", { password: "still-not-it" });
  assert(!wrong.ok, "a wrong password must still be refused");

  setup.close();
  player.close();
  admin.close();
  for (const a of attackers) a.close();
}
