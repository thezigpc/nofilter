// Test runner. Each spec in ./specs exports:
//   export const name = "human readable name";
//   export const needsPlaywright = true;   // optional, default false
//   export default async function (ctx) { ... }   // throws to fail
//
// Run everything:        npm test
// Run one spec:          npm test -- action-cards
//
// Playwright is deliberately NOT a package.json dependency - the production
// deploy runs a plain `npm install`, and pulling a browser automation stack
// (plus binaries) into it for tests that never run there isn't worth it.
// UI specs are skipped with instructions unless Playwright is present.

import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startServer, PROJECT_ROOT } from "./harness.mjs";

const SPEC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "specs");
const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"))[0] ?? null;

if (!existsSync(path.join(PROJECT_ROOT, "server", "dist", "index.js"))) {
  console.error("No server build found. Run `npm run build` first.");
  process.exit(1);
}

let hasPlaywright = false;
try {
  await import("playwright");
  hasPlaywright = true;
} catch {
  hasPlaywright = false;
}

const specFiles = readdirSync(SPEC_DIR)
  .filter((f) => f.endsWith(".mjs"))
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (specFiles.length === 0) {
  console.error(filter ? `No specs matching "${filter}".` : "No specs found.");
  process.exit(1);
}

const results = [];
const startedAt = Date.now();

for (const file of specFiles) {
  const mod = await import(pathToFileURL(path.join(SPEC_DIR, file)).href);
  const name = mod.name ?? file;

  if (mod.needsPlaywright && !hasPlaywright) {
    console.log(`SKIP  ${name}\n      needs Playwright: npm i -D playwright && npx playwright install chromium`);
    results.push({ name, status: "skip" });
    continue;
  }

  // Each spec gets its own server on its own port, so a spec that wedges
  // the server (or deliberately crashes it) can't cascade into the next.
  const port = 3197 + results.length * 2;
  let server = null;
  const specStart = Date.now();
  try {
    // prepare() runs before the server boots - specs that patch the build
    // (see crash-containment) need the change in place at module load time.
    if (mod.prepare) await mod.prepare();
    server = await startServer({ port, env: mod.serverEnv ?? {} });
    await mod.default({ server, baseUrl: server.baseUrl, hasPlaywright });
    const ms = Date.now() - specStart;
    console.log(`PASS  ${name} (${ms}ms)`);
    results.push({ name, status: "pass" });
  } catch (err) {
    const ms = Date.now() - specStart;
    console.log(`FAIL  ${name} (${ms}ms)`);
    console.log(`      ${err.message.split("\n").join("\n      ")}`);
    if (process.env.TEST_VERBOSE && server) {
      console.log("      --- server output ---");
      console.log(server.output.split("\n").map((l) => `      ${l}`).join("\n"));
    }
    results.push({ name, status: "fail", err });
  } finally {
    if (server) await server.stop().catch(() => {});
    // Always runs, so a spec that patched the build can't leave it dirty
    // for the next spec (or for the next `npm run build`-less test run).
    if (mod.cleanup) {
      try {
        await mod.cleanup();
      } catch (err) {
        console.log(`      WARNING: cleanup for ${name} failed: ${err.message}`);
      }
    }
  }
}

const passed = results.filter((r) => r.status === "pass").length;
const failed = results.filter((r) => r.status === "fail").length;
const skipped = results.filter((r) => r.status === "skip").length;
const totalMs = Date.now() - startedAt;

console.log(
  `\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""} in ${(totalMs / 1000).toFixed(1)}s`
);
if (failed > 0 && !process.env.TEST_VERBOSE) {
  console.log("Re-run with TEST_VERBOSE=1 to include server output for failures.");
}
process.exit(failed > 0 ? 1 : 0);
