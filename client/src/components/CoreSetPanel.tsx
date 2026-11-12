import { useEffect, useRef, useState } from "react";
import type { CoreSetInfo, CoreSetUploadReport, PackSummary, UploadCoreSetPack } from "@tabletop-judge/shared";
import { serverUrl, socket } from "../socket.js";
import { ADMIN_TOKEN_KEY } from "../adminSession.js";
import { parseCsv } from "../csv.js";
import { CloseCircleIcon, EyeIcon, UploadIcon } from "./Icons.js";
import PackPreviewModal from "./PackPreviewModal.js";

const SOURCE_LABEL: Record<CoreSetInfo["source"], string> = {
  bundled_sample: "the bundled sample pack",
  uploaded_core_set: "a Core Set uploaded through this panel",
  env_override: "a file pinned by this deployment's CARD_DATA_PATH setting",
};

interface DetectedPack {
  name: string;
  white: { text: string }[];
  black: { text: string; pick?: number }[];
  /** Which raw group this pack landed in, and that group's display info -
   * computed once via rawGroupOf() at parse time and carried alongside the
   * pack (rather than reconstructed from `rawKey` later) so a category's
   * original casing survives grouping - the key itself is lowercased for
   * comparison, which would otherwise lose it. */
  rawKey: string;
  signal: string;
  guess: string;
}

interface RawGroup {
  key: string;
  /** What the file actually said, shown so an admin can judge the guess. */
  signal: string;
  guess: string;
  packs: DetectedPack[];
}

/**
 * What a pack's category resolves to before a human reviews it - a real
 * `category` field wins outright; a legacy `official: true` (only ever
 * seen in old-schema JSON, never CSV) falls back to "Official"; anything
 * else lands in "Uncategorized". Same fallback loader.ts uses server-side
 * for files nobody's mapping interactively (the bundled sample, an
 * env-pinned file) - this is the one place a *human* gets to override it.
 */
function rawGroupOf(category: string | undefined, official: boolean | undefined): { key: string; signal: string; guess: string } {
  const cat = category?.trim();
  if (cat) return { key: `cat:${cat.toLowerCase()}`, signal: `category: "${cat}"`, guess: cat };
  if (official) return { key: "legacy-official", signal: "official: true (legacy field)", guess: "Official" };
  return { key: "uncategorized", signal: "no category given", guess: "Uncategorized" };
}

function parseCoreSetJson(raw: string): DetectedPack[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected an array of packs: [{"name":"...", "category":"...", "white":[...], "black":[...]}]');
  }
  const packs: DetectedPack[] = [];
  for (const p of parsed) {
    if (typeof p?.name !== "string" || !p.name.trim()) continue;
    if (!Array.isArray(p.white) && !Array.isArray(p.black)) continue;
    const { key, signal, guess } = rawGroupOf(p.category, p.official);
    packs.push({
      name: p.name.trim(),
      white: Array.isArray(p.white) ? p.white : [],
      black: Array.isArray(p.black) ? p.black : [],
      rawKey: key,
      signal,
      guess,
    });
  }
  if (packs.length === 0) {
    throw new Error('No valid packs found - each one needs a "name" and a "white" or "black" array.');
  }
  return packs;
}

/** CSV schema: pack,category,type,text,pick - one row per card, grouped
 * into packs by the `pack` column so a single file can carry a whole
 * multi-pack, multi-section import (category and pick are optional). */
function parseCoreSetCsv(raw: string): DetectedPack[] {
  const rows = parseCsv(raw);
  if (rows.length === 0) throw new Error("Empty file.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const packIdx = header.indexOf("pack");
  const categoryIdx = header.indexOf("category");
  const typeIdx = header.indexOf("type");
  const textIdx = header.indexOf("text");
  const pickIdx = header.indexOf("pick");
  if (packIdx === -1 || typeIdx === -1 || textIdx === -1) {
    throw new Error("Expected a header row: pack,category,type,text,pick (category and pick are optional).");
  }

  const byPackName = new Map<string, DetectedPack>();
  for (const fields of rows.slice(1)) {
    const packName = (fields[packIdx] ?? "").trim();
    const text = (fields[textIdx] ?? "").trim();
    if (!packName || !text) continue;
    const type = (fields[typeIdx] ?? "").trim().toLowerCase();
    const category = categoryIdx !== -1 ? fields[categoryIdx]?.trim() : undefined;

    let pack = byPackName.get(packName);
    if (!pack) {
      const { key, signal, guess } = rawGroupOf(category, undefined);
      pack = { name: packName, white: [], black: [], rawKey: key, signal, guess };
      byPackName.set(packName, pack);
    }
    if (type === "white") {
      pack.white.push({ text });
    } else if (type === "black") {
      const pickRaw = pickIdx !== -1 ? Number(fields[pickIdx]) : undefined;
      pack.black.push({ text, pick: pickRaw && pickRaw > 0 ? pickRaw : undefined });
    }
  }
  const packs = [...byPackName.values()];
  if (packs.length === 0) throw new Error("No valid rows found.");
  return packs;
}

function groupByRawKey(detected: DetectedPack[]): RawGroup[] {
  const byKey = new Map<string, RawGroup>();
  for (const p of detected) {
    let g = byKey.get(p.rawKey);
    if (!g) {
      g = { key: p.rawKey, signal: p.signal, guess: p.guess, packs: [] };
      byKey.set(p.rawKey, g);
    }
    g.packs.push(p);
  }
  return [...byKey.values()];
}


/**
 * Admin panel for the Core Set: the card data a fresh deploy actually
 * plays with. Ships as a small bundled sample; an admin can add to it or
 * replace it outright by uploading a JSON or CSV file. Every upload goes
 * through the same validate/repair pass as Custom Cards and Custom Sets
 * uploads (server/src/cards/validate.ts) - broken pick counts (a
 * blank-count mismatch) get corrected automatically, and the report after
 * upload says what changed.
 *
 * Between picking a file and confirming the upload, a section mapper lets
 * the admin review how each pack's raw category signal (an explicit
 * `category`, a legacy `official` flag, or nothing at all) resolves to a
 * final section - typing the same name into two rows merges them, so
 * near-duplicate labels ("Community" vs "community-driven") don't
 * fragment into separate sections by accident.
 *
 * Only rooms created after a successful upload see the new data - a room
 * already in progress keeps whatever it started with (RoomManager.setCardData()).
 */
export default function CoreSetPanel({
  packs,
  onPacksChanged,
}: {
  /** Every pack currently in the Core Set (the parent already filters out
   * Custom Set packs - those have their own delete flow elsewhere on this
   * page, and deleting them here would hit a Core Set route that's never
   * heard of them). */
  packs: PackSummary[];
  /** Called after a pack is actually deleted, so the parent's own
   * listAllPacks-backed state (used by the pack-selection preset builder
   * further down this page) doesn't go stale. */
  onPacksChanged: () => void;
}) {
  const [info, setInfo] = useState<CoreSetInfo | null>(null);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CoreSetUploadReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [packFilter, setPackFilter] = useState("");
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewPack, setPreviewPack] = useState<PackSummary | null>(null);

  const [stage, setStage] = useState<"idle" | "mapping">("idle");
  const [fileName, setFileName] = useState("");
  const [detected, setDetected] = useState<DetectedPack[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});

  function refresh() {
    socket.emit("getCoreSetInfo", setInfo);
  }

  // This page connects/disconnects the shared socket itself (see
  // CustomCardsPage's own effect), so a child mounting first can't assume
  // it's already connected - same pattern as AdminBar.
  useEffect(() => {
    socket.on("connect", refresh);
    if (socket.connected) refresh();
    return () => {
      socket.off("connect", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setReport(null);
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onload = () => {
      let packs: DetectedPack[];
      try {
        const raw = String(reader.result ?? "");
        packs = isCsv ? parseCoreSetCsv(raw) : parseCoreSetJson(raw);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read that file.");
        return;
      }
      const groups = groupByRawKey(packs);
      setTargets(Object.fromEntries(groups.map((g) => [g.key, g.guess])));
      setDetected(packs);
      setFileName(file.name);
      setStage("mapping");
    };
    reader.readAsText(file);
  }

  function backToStart() {
    setStage("idle");
    setDetected([]);
    setTargets({});
    setError(null);
  }

  /** Posts to /api/core-set rather than emitting a socket event: a real
   * card set routinely exceeds socket.io's per-message cap, and going over
   * it fails silently (transport closes, the emit is replayed on reconnect,
   * the ack never arrives). See the route in server/src/index.ts. */
  async function confirmImport() {
    const groups = groupByRawKey(detected);
    const packs: UploadCoreSetPack[] = detected.map((p) => {
      const g = groups.find((x) => x.key === p.rawKey)!;
      const category = (targets[p.rawKey] ?? g.guess).trim() || "Uncategorized";
      return { name: p.name, category, white: p.white, black: p.black };
    });
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/core-set`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
        },
        body: JSON.stringify({ mode, packs }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; report?: CoreSetUploadReport; info?: CoreSetInfo }
        | null;
      if (!res.ok || !data?.ok) {
        setError(
          data?.error ??
            (res.status === 401
              ? "Sign in as admin to change the Core Set."
              : `Upload failed (${res.status}).`)
        );
        return;
      }
      setReport(data.report ?? null);
      if (data.info) setInfo(data.info);
      backToStart();
    } catch {
      setError("Couldn't reach the server to upload. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Same route family as the upload above (POST /api/core-set/delete-pack,
   * same admin-token header) - deletes by name, since PackSummary.id is
   * array-index-derived and reshuffles on the very next rebuild (see
   * server/src/cards/coreSet.ts's deleteCoreSetPack for the full reasoning). */
  async function deletePack(pack: PackSummary) {
    if (
      !window.confirm(
        `Delete "${pack.name}" (${pack.whiteCount} white, ${pack.blackCount} black cards)? This can't be undone.`
      )
    ) {
      return;
    }
    setDeletingName(pack.name);
    setDeleteError(null);
    try {
      const res = await fetch(`${serverUrl}/api/core-set/delete-pack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
        },
        body: JSON.stringify({ name: pack.name }),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string; info?: CoreSetInfo } | null;
      if (!res.ok || !data?.ok) {
        setDeleteError(
          data?.error ??
            (res.status === 401 ? "Sign in as admin to change the Core Set." : `Delete failed (${res.status}).`)
        );
        return;
      }
      if (data.info) setInfo(data.info);
      onPacksChanged();
    } catch {
      setDeleteError("Couldn't reach the server to delete. Check your connection and try again.");
    } finally {
      setDeletingName(null);
    }
  }

  if (!info) return null;

  const groups = stage === "mapping" ? groupByRawKey(detected) : [];
  const existingCategories = mode === "add" ? info.categories : [];

  // Live "what this import will result in" summary - recomputed on every
  // edit to a target field, so a merge's effect is visible immediately
  // rather than only discoverable after confirming.
  const summary = (() => {
    const byFinal = new Map<string, { name: string; count: number; isExisting: boolean }>();
    for (const g of groups) {
      const current = (targets[g.key] ?? g.guess).trim() || "Uncategorized";
      const lower = current.toLowerCase();
      const isExisting = existingCategories.some((c) => c.toLowerCase() === lower);
      const entry = byFinal.get(lower) ?? { name: current, count: 0, isExisting };
      entry.count += g.packs.length;
      byFinal.set(lower, entry);
    }
    return [...byFinal.values()];
  })();

  return (
    <div className="panel">
      <h2>Core Set</h2>

      {stage === "idle" && (
        <>
          <p className="muted">
            This server is currently playing {SOURCE_LABEL[info.source]} — {info.totalPacks} pack
            {info.totalPacks === 1 ? "" : "s"}, {info.totalWhite} white and {info.totalBlack} black cards.
          </p>

          {info.locked ? (
            <p className="muted">
              Uploads are disabled: this deployment's CARD_DATA_PATH setting always wins on restart, so an upload
              here would just be discarded.
            </p>
          ) : (
            <>
              <p className="muted">
                Upload a JSON or CSV file of packs to add to or replace what's loaded. JSON is an array of{" "}
                <code>{'{ name, category, white: [{ text }], black: [{ text, pick }] }'}</code>; CSV is one row per
                card with columns <code>pack,category,type,text,pick</code>. Broken cards are validated and repaired
                automatically, e.g. a black card whose blank count doesn't match its pick value gets corrected to
                match — but each individual underscore counts as its own blank, so a card meant to have one blank
                should use a single <code>_</code>, not <code>___</code> or more (the display already stretches one{" "}
                <code>_</code> into a full-width blank on its own).{" "}
                <a href={`${serverUrl}/sample-cards.json`} target="_blank" rel="noreferrer">
                  See a working JSON example
                </a>
                .
              </p>
              <div className="role-picker">
                <label>
                  <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />
                  Add to the Core Set
                </label>
                <label>
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                  Replace the Core Set
                </label>
              </div>
              <div className="row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.csv,text/csv"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <button type="button" onClick={handleUploadClick} disabled={busy}>
                  <UploadIcon /> {busy ? "Uploading…" : "Choose a file…"}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
              {report && (
                <p className="muted">
                  Added {report.packsAdded} pack{report.packsAdded === 1 ? "" : "s"} ({report.whiteAdded} white,{" "}
                  {report.blackAdded} black cards).{" "}
                  {report.cardsRepaired > 0 &&
                    `Repaired ${report.cardsRepaired} card${report.cardsRepaired === 1 ? "" : "s"}' pick counts. `}
                  {report.cardsDropped > 0 &&
                    `Dropped ${report.cardsDropped} empty card${report.cardsDropped === 1 ? "" : "s"}. `}
                  Only rooms created from now on will see this — games already in progress are unaffected.
                </p>
              )}

              {packs.length > 0 && (
                <details className="core-set-packs">
                  <summary>
                    Packs in this Core Set ({packs.length})
                  </summary>
                  <p className="muted">
                    Delete a pack you didn't mean to add — e.g. an extra category from a recent upload — without
                    touching anything else. Only rooms created from now on stop seeing it.
                  </p>
                  <input
                    type="search"
                    placeholder="Filter by name or category…"
                    value={packFilter}
                    onChange={(e) => setPackFilter(e.target.value)}
                  />
                  {deleteError && <p className="error">{deleteError}</p>}
                  <ul className="player-list core-set-pack-list">
                    {packs
                      .filter((p) => {
                        const q = packFilter.trim().toLowerCase();
                        if (!q) return true;
                        return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
                      })
                      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
                      .map((p) => (
                        <li key={p.id} className="player-row">
                          <span>
                            {p.name} <span className="tag">{p.category}</span>
                          </span>
                          <span className="row">
                            <span className="muted">
                              {p.whiteCount} white · {p.blackCount} black
                            </span>
                            <button type="button" onClick={() => setPreviewPack(p)} title={`Preview "${p.name}"`}>
                              <EyeIcon /> Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePack(p)}
                              disabled={deletingName === p.name}
                              aria-label={`Delete pack ${p.name}`}
                              title={`Delete "${p.name}"`}
                            >
                              <CloseCircleIcon /> {deletingName === p.name ? "Deleting…" : "Delete"}
                            </button>
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}

      {stage === "mapping" && (
        <>
          <p className="muted">
            Importing <code>{fileName}</code> — {detected.length} pack{detected.length === 1 ? "" : "s"} found
            {mode === "add" ? ", adding to the existing Core Set" : ", replacing the existing Core Set"}.
          </p>
          <p className="muted">
            Some packs share the same section, and some don't say at all — review the guesses below before
            importing. Type a new name to rename a section, or match an existing one to merge into it.
          </p>

          {groups.map((g, groupIndex) => {
            const current = targets[g.key] ?? g.guess;
            const lower = current.trim().toLowerCase();
            const isExisting = existingCategories.some((c) => c.toLowerCase() === lower);
            const mergedWithOthers = groups.filter(
              (o) => o.key !== g.key && (targets[o.key] ?? o.guess).trim().toLowerCase() === lower
            ).length;
            // Index, not a slug of g.key: slugifying collapsed distinct
            // keys onto the same DOM id (e.g. "a-b" and "a b"), which
            // silently pointed two inputs at one datalist.
            const listId = `core-set-category-${groupIndex}`;
            const options = [...new Set([...existingCategories, ...groups.map((o) => targets[o.key] ?? o.guess)])];

            return (
              <div key={g.key} className="player-row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <span>
                  <strong>{g.packs.length}×</strong>{" "}
                  <span className="muted">
                    {g.packs
                      .slice(0, 2)
                      .map((p) => p.name)
                      .join(", ")}
                    {g.packs.length > 2 ? ", …" : ""}
                  </span>
                  <br />
                  <span className="muted" style={{ fontSize: "0.8em" }}>
                    {g.signal}
                  </span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem" }}>
                  <input
                    list={listId}
                    value={current}
                    onChange={(e) => setTargets((prev) => ({ ...prev, [g.key]: e.target.value }))}
                    style={{ textAlign: "right" }}
                  />
                  <datalist id={listId}>
                    {options.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                  {isExisting ? (
                    <span className="tag">Matches existing</span>
                  ) : mergedWithOthers > 0 ? (
                    <span className="tag">Merged with {mergedWithOthers} other{mergedWithOthers === 1 ? "" : "s"}</span>
                  ) : (
                    <span className="tag muted">New section</span>
                  )}
                </span>
              </div>
            );
          })}

          <h3>Result</h3>
          <ul className="player-list">
            {summary.map((s) => (
              <li key={s.name} className="player-row">
                <span>
                  {s.name}
                  {mode === "add" && !s.isExisting && <span className="tag muted"> new section</span>}
                </span>
                <span className="muted">
                  +{s.count} pack{s.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>

          {error && <p className="error">{error}</p>}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" onClick={backToStart} disabled={busy}>
              ← Choose a different file
            </button>
            <button type="button" className="primary" onClick={confirmImport} disabled={busy}>
              {busy ? "Importing…" : "Confirm & Import"}
            </button>
          </div>
        </>
      )}

      {previewPack && (
        <PackPreviewModal
          pack={previewPack}
          selected={false}
          canToggle={false}
          onToggle={() => {}}
          onClose={() => setPreviewPack(null)}
        />
      )}
    </div>
  );
}
