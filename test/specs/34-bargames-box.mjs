import http from "node:http";
import { startServer, makeClient, makeRoom, selectOfficialPacks, waitFor, wait, assert, assertEqual } from "../harness.mjs";

export const name = "Bar Games: on a box - events, commands, status, venue rooms, every close path";

const TOKEN = "spec-token";

/** A stand-in for the box's core: serves a venue context and records the
 * events the game posts. That's the whole core<->game protocol the SDK uses
 * (GET /internal/venue, POST /internal/events, both Bearer-authenticated). */
async function fakeCore() {
  const events = [];
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === "GET" && req.url === "/internal/venue") {
      const theme = { colors: { background: "#003333", surface: "#004444", text: "#ffffff", primary: "#ff3399", accent: "#ffcc00" } };
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          protocol: 1,
          venue: { name: "Spec Bar", theme },
          game: { id: "nofilter", displayName: "No Filter (Spec Bar)", theme },
          standalone: false,
          generatedAt: new Date().toISOString(),
        })
      );
      return;
    }
    if (req.method === "POST" && req.url === "/internal/events") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        events.push(JSON.parse(body));
        res.writeHead(200, { "content-type": "application/json" }).end("{}");
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, events, close: () => server.close() };
}

export default async function () {
  const core = await fakeCore();
  let game;
  const clients = [];
  try {
    game = await startServer({
      port: 3449,
      env: {
        BG_GAME_ID: "nofilter",
        BG_CORE_URL: core.url,
        BG_GAME_TOKEN: TOKEN,
        // Fast idle sweep, so the venue-room exemption is testable.
        ROOM_INACTIVITY_TTL_MS: "1500",
        ROOM_SWEEP_INTERVAL_MS: "300",
      },
    });
    const base = game.baseUrl;
    const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    const command = async (command, roomCode, args) =>
      (await fetch(`${base}/__bargames/command`, { method: "POST", headers: auth, body: JSON.stringify({ command, roomCode, args }) })).json();
    const status = async () => (await (await fetch(`${base}/__bargames/status`, { headers: auth })).json()).rooms;
    const eventsFor = (code, type) => core.events.filter((e) => e.roomCode === code && (!type || e.type === type));

    // --- Branding: /api/config carries the venue's name.
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assertEqual(cfg.gameName, "No Filter (Spec Bar)", "the venue's rename wins on a box");

    // --- create_room: a venue room with no host phone.
    const created = await command("create_room", undefined, { kind: "venue", title: "Friday Night" });
    assert(created.ok, `create_room should succeed: ${JSON.stringify(created)}`);
    const code = created.data.roomCode;
    const hostUrl = created.data.hostUrl;
    assert(/^\/room\/[A-Z0-9]+\?role=table&display=1&key=/.test(hostUrl), `hostUrl shape: ${hostUrl}`);
    const key = decodeURIComponent(hostUrl.split("key=")[1]);
    let rooms = await status();
    const v = rooms.find((r) => r.code === code);
    assert(v, "status lists the venue room");
    assertEqual(v.kind, "venue", "kind venue");
    assertEqual(v.title, "Friday Night", "title carried through");
    assertEqual(v.players, 0, "no players yet");
    assert(!Number.isNaN(Date.parse(v.createdAt)) && !Number.isNaN(Date.parse(v.lastActivityAt)), "ISO times");
    await waitFor(() => eventsFor(code, "room_created").length === 1, { label: "room_created event" });
    assertEqual(eventsFor(code, "room_created")[0].sessionKind, "venue", "event carries sessionKind");

    // A cast TV (no key) joins display-only...
    const tv = makeClient(base, "TV");
    clients.push(tv);
    await waitFor(() => tv.socket.connected, { label: "tv connect" });
    assert((await tv.ack("joinRoom", { roomCode: code, name: "Shared Screen", role: "table" })).ok, "TV joins");
    await waitFor(() => tv.state, { label: "tv state" });
    assertEqual(tv.state.you.isHost, false, "a TV is not a controller");
    let before = tv.errors.length;
    tv.emit("updateHouseRules", { houseRules: { tradeIn: true } });
    await waitFor(() => tv.errors.length > before, { label: "TV settings refused" });
    assertEqual(tv.errors.at(-1).code, "NOT_HOST", "a plain Table can't change a venue room's settings");

    // ...the staff controller (with the key) has host authority...
    const ipad = makeClient(base, "iPad");
    clients.push(ipad);
    await waitFor(() => ipad.socket.connected, { label: "ipad connect" });
    assert((await ipad.ack("joinRoom", { roomCode: code, name: "Shared Screen", role: "table", venueKey: key })).ok, "controller joins");
    await waitFor(() => ipad.state, { label: "ipad state" });
    assertEqual(ipad.state.you.isHost, true, "the keyed Table is the room's controller");
    ipad.emit("updateHouseRules", { houseRules: { tradeIn: true } });
    await waitFor(() => ipad.state.houseRules.tradeIn === true, { label: "controller changes settings" });

    // ...and patrons who join never become host.
    for (const n of ["Ann", "Ben", "Cat"]) {
      const c = makeClient(base, n);
      clients.push(c);
      await waitFor(() => c.socket.connected, { label: `${n} connect` });
      assert((await c.ack("joinRoom", { roomCode: code, name: n, role: "player" })).ok, `${n} joins`);
    }
    const [ann] = clients.slice(2);
    await waitFor(() => ann.state?.players.length >= 5, { label: "everyone seated" });
    assert(clients.slice(2).every((c) => !c.state.you.isHost), "no patron is host of a venue room");
    before = ann.errors.length;
    ann.emit("closeRoom");
    await waitFor(() => ann.errors.length > before, { label: "patron close refused" });
    assertEqual((await status()).find((r) => r.code === code)?.players, 3, "status counts players only (not Tables)");
    // players_changed is debounced: three quick joins -> one event, final count.
    await waitFor(() => eventsFor(code, "players_changed").length >= 1, { timeout: 5000, label: "players_changed" });
    await wait(2200);
    const pc = eventsFor(code, "players_changed");
    assertEqual(pc.length, 1, "joins within 2 s coalesce into one players_changed");
    assertEqual(pc[0].data.players, 3, "players_changed carries the count");

    // --- Commands: unknown room, wrong state, good path.
    assertEqual((await command("start", "ZZZZZ")).ok, false, "start on an unknown room refuses");
    const noPacks = await command("start", code);
    assertEqual(noPacks.ok, false, "start refuses with no packs selected");
    assert(/pack/i.test(noPacks.message), `the host's own refusal message comes through: ${noPacks.message}`);
    await selectOfficialPacks(ipad);
    assertEqual((await command("next_round", code)).ok, false, "next_round refuses before a game has ended");
    const started = await command("start", code);
    assert(started.ok, `start should succeed: ${JSON.stringify(started)}`);
    await waitFor(() => ann.state.phase === "submission", { label: "game started by the box" });
    assertEqual((await command("start", code)).ok, false, "start refuses mid-game");
    assertEqual((await command("next_round", code)).ok, false, "next_round refuses mid-round");
    await waitFor(() => eventsFor(code, "round_started").length === 1, { label: "round_started" });
    assertEqual(eventsFor(code, "round_started")[0].data.round, 1, "round 1");

    // Players can't claim host of a venue room even once nobody is "host".
    before = ann.errors.length;
    ann.emit("claimHost");
    await waitFor(() => ann.errors.length > before, { label: "claim refused" });

    // --- Idle: the venue room has a TV, so a quiet spell doesn't close it,
    // while an idle patron room with no TV does (reason idle).
    const patron = await makeRoom(base, ["Pat"]);
    patron.clients.forEach((c) => clients.push(c));
    await waitFor(() => eventsFor(patron.code, "room_closed").length === 1, { timeout: 8000, label: "idle patron room closed" });
    assertEqual(eventsFor(patron.code, "room_closed")[0].data.reason, "idle", "idle close reason");
    assert(!(await status()).some((r) => r.code === patron.code), "an idle-closed room leaves status");
    assert((await status()).some((r) => r.code === code), "the venue room on a TV survives the sweep");

    // --- end: closes like an admin close, emits room_closed, leaves status.
    assertEqual((await command("end", "ZZZZZ")).ok, false, "end on an unknown room refuses");
    assert((await command("end", code)).ok, "end closes the room");
    await waitFor(() => ann.kicked.length === 1, { label: "players told the room closed" });
    assertEqual(ann.kicked[0].code, "ROOM_CLOSED", "kicked with ROOM_CLOSED");
    assert(!(await status()).some((r) => r.code === code), "an ended room leaves status at once");
    await waitFor(() => eventsFor(code, "room_closed").length === 1, { label: "room_closed after end" });
    assertEqual(eventsFor(code, "room_closed")[0].data.reason, "admin", "end's close reason");

    // --- Host close of a phone room: room_created (patron) and room_closed (host).
    const phone = await makeRoom(base, ["Hank", "Ivy"]);
    phone.clients.forEach((c) => clients.push(c));
    await waitFor(() => eventsFor(phone.code, "room_created").length === 1, { label: "patron room_created" });
    assertEqual(eventsFor(phone.code, "room_created")[0].sessionKind, "patron", "phone rooms are patron rooms");
    assertEqual((await status()).find((r) => r.code === phone.code)?.hostName, "Hank", "hostName in status");
    phone.host.emit("closeRoom");
    await waitFor(() => eventsFor(phone.code, "room_closed").length === 1, { label: "room_closed after host close" });
    assertEqual(eventsFor(phone.code, "room_closed")[0].data.reason, "host", "host close reason");

    // (Shutdown also goes through closeRoom with cause "shutdown"; a test
    // can't observe it portably - on Windows stopping the child is a hard
    // kill - so BARGAMES.md records that check against the mock box.)
  } finally {
    clients.forEach((c) => c.close());
    await game?.stop().catch(() => {});
    core.close();
  }
}
