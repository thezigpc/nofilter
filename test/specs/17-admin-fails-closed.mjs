import { makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "With no ADMIN_PASSWORD set, writes fail closed rather than open";

// Explicitly blank: the whole point is what happens when the operator
// forgot to configure one.
export const serverEnv = { ADMIN_PASSWORD: "" };

/**
 * The dangerous failure mode for a gate like this is failing *open* - an
 * unset env var quietly restoring the free-for-all it was added to close,
 * on a server that looks locked down. So an unconfigured password must
 * refuse every write, and must not be bypassable by logging in with an
 * empty password.
 */
export default async function ({ baseUrl }) {
  const client = makeClient(baseUrl, "Nobody");
  await waitFor(() => client.socket.connected, { label: "socket to connect" });

  try {
    const status = await client.ack("adminStatus");
    assertEqual(status.configured, false, "this spec needs a server with no admin password");
    assertEqual(status.isAdmin, false, "nobody should start out as admin");

    // Reads still work - the library isn't secret, just protected from writes.
    const before = await client.ack("listCustomCards");
    assert(Array.isArray(before.white), "reads must still work with no password configured");

    // An empty password must not authenticate, or "unset" would mean "open".
    const emptyLogin = await client.ack("adminLogin", { password: "" });
    assert(!emptyLogin.ok, "an empty password must not grant admin when none is configured");

    // Nor should any other guess.
    const guess = await client.ack("adminLogin", { password: "admin" });
    assert(!guess.ok, "no password should work when none is configured");

    // And writes are refused.
    const errorsBefore = client.errors.length;
    await client.ack("addCustomWhiteCard", { text: "Should never be stored." });
    await waitFor(() => client.errors.length > errorsBefore, { label: "the write to be refused" });
    assert(
      client.errors.slice(errorsBefore).some((e) => e.code === "ADMIN_REQUIRED"),
      "writes must be refused when no admin password is configured"
    );

    const after = await client.ack("listCustomCards");
    assertEqual(after.white.length, before.white.length, "nothing should have been written");
    assert(
      !after.white.some((c) => c.text === "Should never be stored."),
      "the refused card must not be in the library"
    );
  } finally {
    client.close();
  }
}
