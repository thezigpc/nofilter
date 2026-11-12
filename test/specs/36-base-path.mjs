import { startServer, makeClient, waitFor, assert, assertEqual } from "../harness.mjs";

export const name = "Path prefix: index.html carries the prefix only when one is set";

/**
 * The game can be served under a path (https://venue/nofilter/) by a proxy
 * that strips the prefix. The server's routes never change; the only thing
 * that does is index.html, which tells the client where it lives.
 *
 * The client is built with relative asset URLs, and its pages sit at nested
 * routes (/room/ABCD), so index.html must always have a <base>: its own "/"
 * at the root, and the injected prefix (placed first, so it wins) under one.
 */
export default async function ({ baseUrl }) {
  const html = { headers: { accept: "text/html" } };

  // --- At the root (the default server): untouched apart from its own base.
  for (const page of ["/", "/room/ABCDE", "/editor/preview", "/admin"]) {
    const res = await fetch(baseUrl + page, html);
    assertEqual(res.status, 200, `${page} serves the client`);
    const body = await res.text();
    assert(!body.includes("bargames-base"), `${page}: no prefix meta at the root`);
    assertEqual((body.match(/<base /g) ?? []).length, 1, `${page}: exactly one <base> at the root`);
    assert(body.includes('<base href="/"'), `${page}: the root base`);
    assert(/src="\.\/assets\//.test(body), `${page}: assets are relative`);
  }
  // A deep page's assets resolve from the root, and are real files.
  const rootHtml = await (await fetch(baseUrl + "/room/ABCDE", html)).text();
  const asset = /src="\.(\/assets\/[^"]+\.js)"/.exec(rootHtml)[1];
  const js = await fetch(baseUrl + asset);
  assertEqual(js.status, 200, "the script is served");
  assert((js.headers.get("content-type") ?? "").includes("javascript"), "as JavaScript, not the HTML fallback");
  // Not swallowed by the page fallback:
  assertEqual((await fetch(baseUrl + "/health")).status, 200, "/health still answers");
  assertEqual((await fetch(baseUrl + "/api/nope", html)).status, 404, "an unknown API path is a 404, not a page");
  assertEqual((await fetch(baseUrl + "/__bargames/nope", html)).status, 404, "an unknown reserved path is a 404");

  // --- Under a prefix. The proxy strips it, so requests arrive unprefixed.
  const prefixed = await startServer({ port: Number(new URL(baseUrl).port) + 500, env: { BASE_PATH: "/nofilter" } });
  const clients = [];
  try {
    for (const page of ["/", "/room/ABCDE", "/admin"]) {
      const body = await (await fetch(prefixed.baseUrl + page, html)).text();
      assert(body.includes('<meta name="bargames-base" content="/nofilter">'), `${page}: the prefix meta`);
      const first = /<base [^>]*>/.exec(body)[0];
      assertEqual(first, '<base href="/nofilter/">', `${page}: the prefix's <base> comes first, so it wins`);
    }
    // Server routes are unchanged under a prefix: the API and a socket work.
    const cfg = await (await fetch(prefixed.baseUrl + "/api/config")).json();
    assertEqual(cfg.gameName, "No Filter", "the API is where it always was");
    const c = makeClient(prefixed.baseUrl, "Pat");
    clients.push(c);
    await waitFor(() => c.socket.connected, { label: "socket under a prefix" });
    const ack = await c.ack("createRoom", { name: "Pat", role: "player" });
    assert(ack.ok, "a room can be created");
  } finally {
    for (const c of clients) c.close();
    await prefixed.stop();
  }
}
