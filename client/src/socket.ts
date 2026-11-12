import { io, type Socket } from "socket.io-client";
import { serverBase, serverOrigin, socketPath, SOCKET_OPTIONS } from "@bargames/gamekit/client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tabletop-judge/shared";

// In dev, Vite serves the client on :5173 while the API/socket server runs on
// :3001, so phones on the LAN hitting the dev machine's IP still need that
// port called out. In production the server serves the built client itself,
// so client and API share one origin - including behind a single Cloudflare
// Tunnel hostname. VITE_SERVER_URL overrides both.
const dev = {
  vitePort: 5173,
  serverPort: 3001,
  override: import.meta.env.VITE_SERVER_URL as string | undefined,
};

/** The server's origin alone ("https://host"): socket.io and the SDK's venue
 * calls, which add the path prefix themselves. */
export const serverOriginUrl = serverOrigin(dev);

/** The base for plain HTTP calls to this game's server (`${serverUrl}/api/config`).
 * It carries the path prefix when the game is served under one
 * (https://venue/nofilter), so never fetch a bare "/api/...". */
export const serverUrl = serverBase(dev);

// WebSocket first, polling as the fallback (the game kit's settled options):
// with socket.io's default polling-then-upgrade, events emitted right after
// page load rode polling and were intermittently lost through the tunnel.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverOriginUrl, {
  ...SOCKET_OPTIONS,
  // The prefix goes in `path`, never in the URL: socket.io reads a URL's
  // path as a namespace.
  path: socketPath(),
  transports: [...SOCKET_OPTIONS.transports],
});
