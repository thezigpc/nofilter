import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@tabletop-judge/shared";

const configuredUrl = import.meta.env.VITE_SERVER_URL as string | undefined;

// In dev, Vite serves the client on :5173 while the API/socket server runs
// separately on :3001 — so phones on the LAN hitting the dev machine's IP
// still need that port called out explicitly. In production the server
// serves the built client itself (see server/src/index.ts), so client and
// API share one origin — including behind a single Cloudflare Tunnel
// hostname with no exposed port at all. VITE_SERVER_URL overrides both.
const isViteDevServer = window.location.port === "5173";
// Exported too - anything doing a plain HTTP call to the API (not a socket
// event) needs the same origin resolution, e.g. gameName.ts's /api/game-name.
export const serverUrl =
  configuredUrl && configuredUrl.length > 0
    ? configuredUrl
    : isViteDevServer
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : window.location.origin;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
  autoConnect: false,
});
