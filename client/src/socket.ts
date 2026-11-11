import { io, type Socket } from "socket.io-client";
import { serverOrigin, SOCKET_OPTIONS } from "@bargames/gamekit/client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tabletop-judge/shared";

// In dev, Vite serves the client on :5173 while the API/socket server runs on
// :3001, so phones on the LAN hitting the dev machine's IP still need that
// port called out. In production the server serves the built client itself,
// so client and API share one origin - including behind a single Cloudflare
// Tunnel hostname. VITE_SERVER_URL overrides both. Exported for plain HTTP
// calls to the API too (e.g. publicConfig.ts's /api/config).
export const serverUrl = serverOrigin({
  vitePort: 5173,
  serverPort: 3001,
  override: import.meta.env.VITE_SERVER_URL as string | undefined,
});

// WebSocket first, polling as the fallback (the game kit's settled options):
// with socket.io's default polling-then-upgrade, events emitted right after
// page load rode polling and were intermittently lost through the tunnel.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
  ...SOCKET_OPTIONS,
  transports: [...SOCKET_OPTIONS.transports],
});
