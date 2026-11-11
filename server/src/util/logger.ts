// Minimal structured logging - no dependency, no log framework, just
// consistent greppable lines on stdout/stderr. NSSM captures both into the
// service log files, so "what happened in room ABCD" is answerable after
// the fact instead of being lost entirely (previously the only console
// output at all was boot messages and jsonFileStore errors).
//
// Format: 2026-08-17T12:34:56.789Z INFO  [room] joined code=ABCD name=Alice
// Fields are key=value so a line can be grepped by any of them, e.g.
// `findstr "code=ABCD"` to replay one room's whole history.

import { LOG_LEVEL } from "../config.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  return LEVEL_ORDER[LOG_LEVEL as Level] ?? LEVEL_ORDER.info;
}

/** Values are quoted only when they'd otherwise break key=value parsing -
 * player names can contain spaces, room codes never do. */
function formatFields(fields?: Record<string, unknown>): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    if (raw === undefined || raw === null) continue;
    const value = String(raw);
    parts.push(`${key}=${/[\s"]/.test(value) ? JSON.stringify(value) : value}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function emit(level: Level, scope: string, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < threshold()) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${formatFields(fields)}`;
  // Route warn/error to stderr so NSSM's separate error log catches the
  // things actually worth looking at, without the routine info noise.
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (scope: string, message: string, fields?: Record<string, unknown>) => emit("debug", scope, message, fields),
  info: (scope: string, message: string, fields?: Record<string, unknown>) => emit("info", scope, message, fields),
  warn: (scope: string, message: string, fields?: Record<string, unknown>) => emit("warn", scope, message, fields),
  error: (scope: string, message: string, fields?: Record<string, unknown>) => emit("error", scope, message, fields),
};
