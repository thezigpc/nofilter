import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_TABLE_STYLE } from "@tabletop-judge/shared";
import type { CustomCardsData, CustomSet, PackSelectionPreset, PackSummary } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { createCustomSet, loadCustomSets } from "../customSets.js";
import { parseCsv } from "../csv.js";
import { fetchPublicConfig } from "../publicConfig.js";
import { themeAttrs } from "../useThemeAttrs.js";
import { COLLAPSE_THRESHOLD, groupPacksByCategory } from "../packGrouping.js";
import {
  deletePackSelectionPreset,
  loadPackSelectionPresets,
  onPackSelectionPresetsUpdated,
  savePackSelectionPreset,
} from "../packSelectionPresets.js";
import CustomSetRow from "../components/CustomSetRow.js";
import PackSection from "../components/PackSection.js";
import PackPreviewModal from "../components/PackPreviewModal.js";
import {
  BackArrowIcon,
  CardsStackIcon,
  CloseCircleIcon,
  DownloadIcon,
  GearIcon,
  InboxIcon,
  PencilIcon,
  UploadIcon,
} from "../components/Icons.js";
import AdminBar from "../components/AdminBar.js";
import CoreSetPanel from "../components/CoreSetPanel.js";

type CardType = "white" | "black";

const SECTIONS = [
  { id: "core", label: "Core Set", icon: CardsStackIcon },
  { id: "cards", label: "Custom Cards", icon: PencilIcon },
  { id: "sets", label: "Custom Sets", icon: InboxIcon },
  { id: "presets", label: "Pack Presets", icon: GearIcon },
  { id: "backup", label: "Backup & Restore", icon: DownloadIcon },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function parseUploadFile(raw: string): { white?: { text: string }[]; black?: { text: string; pick?: number }[] } {
  const parsed = JSON.parse(raw);
  const white = Array.isArray(parsed.white)
    ? parsed.white.filter((c: unknown): c is { text: string } => typeof (c as { text?: unknown })?.text === "string")
    : [];
  const black = Array.isArray(parsed.black)
    ? parsed.black.filter((c: unknown): c is { text: string; pick?: number } => typeof (c as { text?: unknown })?.text === "string")
    : [];
  if (white.length === 0 && black.length === 0) {
    throw new Error('Expected {"white":[{"text":"..."}], "black":[{"text":"...", "pick":1}]}');
  }
  return { white, black };
}

function parseSetCsv(raw: string): { white: { text: string }[]; black: { text: string; pick?: number }[] } {
  const rows = parseCsv(raw);
  if (rows.length === 0) throw new Error("Empty file.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const typeIdx = header.indexOf("type");
  const textIdx = header.indexOf("text");
  const pickIdx = header.indexOf("pick");
  if (typeIdx === -1 || textIdx === -1) {
    throw new Error('Expected a header row: type,text,pick (pick only used for "black" rows).');
  }
  const white: { text: string }[] = [];
  const black: { text: string; pick?: number }[] = [];
  for (const fields of rows.slice(1)) {
    const type = (fields[typeIdx] ?? "").trim().toLowerCase();
    const text = (fields[textIdx] ?? "").trim();
    if (!text) continue;
    if (type === "white") {
      white.push({ text });
    } else if (type === "black") {
      const pickRaw = pickIdx !== -1 ? Number(fields[pickIdx]) : undefined;
      black.push({ text, pick: pickRaw && pickRaw > 0 ? pickRaw : undefined });
    }
  }
  if (white.length === 0 && black.length === 0) throw new Error("No valid rows found.");
  return { white, black };
}

function setToPackSummary(s: CustomSet): PackSummary {
  return {
    id: s.id,
    name: `Custom Set: ${s.name}`,
    category: "Custom Sets",
    whiteCount: s.white.length,
    blackCount: s.black.length,
    isCustomSet: true,
  };
}

/**
 * Standalone page for host-submitted card content - connects its own
 * socket for the duration (custom cards/sets/presets are shared
 * server-side libraries, not something usable offline).
 */
export default function CustomCardsPage() {
  const navigate = useNavigate();
  // Writes are server-gated; this only drives the UI so guests are not
  // offered buttons that would just be refused.
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("core");
  const [data, setData] = useState<CustomCardsData>({ white: [], black: [] });
  const [type, setType] = useState<CardType>("white");
  const [text, setText] = useState("");
  const [pick, setPick] = useState<1 | 2 | 3>(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Sets.
  const [sets, setSets] = useState<CustomSet[]>([]);
  const [newSetName, setNewSetName] = useState("");
  const [setsUploadError, setSetsUploadError] = useState<string | null>(null);
  const setFileInputRef = useRef<HTMLInputElement>(null);
  const [previewSet, setPreviewSet] = useState<CustomSet | null>(null);

  // Backup/restore: a manual export/import safety net for the loose custom
  // cards + every Custom Set, independent of whatever server-side
  // persistence already exists - lets a host keep their own copy and
  // restore it on any server (or after any data loss) without needing
  // filesystem/admin access.
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // Pack Selection Presets (built here, applied from a room's Lobby).
  const [presets, setPresets] = useState<PackSelectionPreset[]>([]);
  const [allPacks, setAllPacks] = useState<PackSummary[]>([]);
  const [builderName, setBuilderName] = useState("");
  const [builderFilter, setBuilderFilter] = useState("");
  const [builderCategoryFilter, setBuilderCategoryFilter] = useState<string | null>(null);
  const [builderSelected, setBuilderSelected] = useState<Set<string>>(new Set());
  const [builderExcluded, setBuilderExcluded] = useState<Set<string>>(new Set());
  const [builderCollapsed, setBuilderCollapsed] = useState<Set<string>>(() => new Set());
  const [builderAutoCollapseApplied, setBuilderAutoCollapseApplied] = useState(false);
  const [builderPreviewPack, setBuilderPreviewPack] = useState<PackSummary | null>(null);
  const [editingPresetName, setEditingPresetName] = useState<string | null>(null);
  const builderHeadingRef = useRef<HTMLHeadingElement>(null);
  const [theme, setTheme] = useState(DEFAULT_TABLE_STYLE.theme);
  const [accentIndex, setAccentIndex] = useState(DEFAULT_TABLE_STYLE.accentIndex);

  function refreshAllPacks() {
    socket.emit("listAllPacks", setAllPacks);
  }

  useEffect(() => {
    socket.connect();
    socket.emit("listCustomCards", setData);
    loadCustomSets().then(setSets);
    loadPackSelectionPresets().then(setPresets);
    refreshAllPacks();
    const unsubscribe = onPackSelectionPresetsUpdated(setPresets);
    fetchPublicConfig().then((config) => {
      setTheme(config.defaultTheme);
      setAccentIndex(config.defaultAccentIndex);
    });
    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, []);

  function addCard() {
    const clean = text.trim();
    if (!clean) return;
    if (type === "white") {
      socket.emit("addCustomWhiteCard", { text: clean }, setData);
    } else {
      socket.emit("addCustomBlackCard", { text: clean, pick }, setData);
    }
    setText("");
  }

  function deleteCard(id: string) {
    socket.emit("deleteCustomCard", { id }, setData);
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const upload = parseUploadFile(String(reader.result ?? ""));
        socket.emit("uploadCustomCards", upload, setData);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    };
    reader.readAsText(file);
  }

  function handleSetUploadClick() {
    setFileInputRef.current?.click();
  }

  function handleSetFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = newSetName.trim();
    if (!name) {
      setSetsUploadError("Name the set before uploading a file for it.");
      return;
    }
    setSetsUploadError(null);
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result ?? "");
        const parsed = isCsv ? parseSetCsv(raw) : parseUploadFile(raw);
        createCustomSet(name, parsed.white, parsed.black).then((next) => {
          setSets(next);
          setNewSetName("");
        });
      } catch (err) {
        setSetsUploadError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    };
    reader.readAsText(file);
  }

  // Same Blob/object-URL/temp-<a> pattern as downloadBackup below - a
  // starting file to edit and re-upload, not just a format string in the
  // help text above. One example row per card type shows the exact shape
  // (field names, where "pick" goes) rather than a bare empty-array
  // skeleton that would leave someone guessing at the syntax.
  function downloadFile(filename: string, contents: string, mimeType: string) {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadSetJsonTemplate() {
    const template = {
      white: [{ text: "Your white card text here" }],
      black: [{ text: "Your black card prompt with a _ blank.", pick: 1 }],
    };
    downloadFile("custom-set-template.json", JSON.stringify(template, null, 2), "application/json");
  }

  function downloadSetCsvTemplate() {
    const rows = [
      ["type", "text", "pick"],
      ["white", "Your white card text here", ""],
      ["black", "Your black card prompt with a _ blank.", "1"],
    ];
    const csv = rows.map((r) => r.map((cell) => (cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")).join("\r\n");
    downloadFile("custom-set-template.csv", csv, "text/csv");
  }

  function createEmptySet() {
    const name = newSetName.trim();
    if (!name) return;
    createCustomSet(name).then((next) => {
      setSets(next);
      setNewSetName("");
    });
  }

  // ---- Backup / restore ----

  function downloadBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      customCards: data,
      customSets: sets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cah-custom-cards-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleRestoreClick() {
    restoreFileInputRef.current?.click();
  }

  function handleRestoreFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setRestoreError(null);
    setRestoreStatus(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ""));
        let restoredCardCount = 0;
        let restoredSetCount = 0;

        const white = Array.isArray(parsed?.customCards?.white) ? parsed.customCards.white : [];
        const black = Array.isArray(parsed?.customCards?.black) ? parsed.customCards.black : [];
        restoredCardCount = white.length + black.length;
        if (restoredCardCount > 0) {
          const next = await new Promise<CustomCardsData>((resolve) =>
            socket.emit("uploadCustomCards", { white, black }, resolve)
          );
          setData(next);
        }

        if (Array.isArray(parsed?.customSets)) {
          let result = sets;
          for (const s of parsed.customSets) {
            if (!s?.name) continue;
            result = await createCustomSet(s.name, s.white ?? [], s.black ?? []);
            restoredSetCount++;
          }
          setSets(result);
        }

        if (restoredCardCount === 0 && restoredSetCount === 0) {
          throw new Error("That file didn't have any recognizable custom cards or sets in it.");
        }
        setRestoreStatus(
          `Restored ${restoredCardCount} card${restoredCardCount === 1 ? "" : "s"} and ${restoredSetCount} set${restoredSetCount === 1 ? "" : "s"} (merged with what was already here — nothing was replaced).`
        );
      } catch (err) {
        setRestoreError(err instanceof Error ? err.message : "Couldn't read that backup file.");
      }
    };
    reader.readAsText(file);
  }

  // ---- Pack Selection Preset builder ----

  // The Core Set's own packs never change mid-session, so the one-time
  // listAllPacks fetch is fine for those - but Custom Sets can be
  // created/edited on this very page while the builder is open, so that
  // portion is derived live from `sets` instead of the stale initial
  // fetch, keeping a newly-created set usable in the builder immediately.
  const combinedPacks = useMemo(
    () => [...allPacks.filter((p) => !p.isCustomSet), ...sets.map(setToPackSummary)],
    [allPacks, sets]
  );

  const allBuilderCategories = useMemo(
    () => [...new Set(combinedPacks.filter((p) => !p.isCustomSet).map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [combinedPacks]
  );

  const { categoryGroups: builderCategoryGroups, customSetPacks: builderCustomSetPacks } = useMemo(() => {
    const q = builderFilter.trim().toLowerCase();
    let list = q ? combinedPacks.filter((p) => p.name.toLowerCase().includes(q)) : combinedPacks;
    if (builderCategoryFilter) list = list.filter((p) => p.isCustomSet || p.category === builderCategoryFilter);
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return groupPacksByCategory(sorted);
  }, [combinedPacks, builderFilter, builderCategoryFilter]);

  // Same one-time, size-based auto-collapse as the Lobby's pack picker -
  // see COLLAPSE_THRESHOLD's own comment.
  useEffect(() => {
    if (builderAutoCollapseApplied) return;
    if (combinedPacks.length === 0) return;
    setBuilderAutoCollapseApplied(true);
    setBuilderCollapsed((prev) => {
      const next = new Set(prev);
      for (const g of builderCategoryGroups) {
        if (g.packs.length > COLLAPSE_THRESHOLD) next.add(g.category);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedPacks.length]);

  function toggleBuilderCollapsed(section: string) {
    setBuilderCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function toggleBuilderPack(id: string) {
    setBuilderSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bulk-select, mirroring the Lobby's own Packs panel - lets a host start
  // from "everything" (or "everything Custom Sets") and uncheck the few
  // packs they don't want, instead of hand-checking dozens of boxes one at
  // a time. Whole-catalog, not scoped to the current search filter,
  // matching the Lobby's behavior exactly.
  function selectAllBuilderPacks() {
    setBuilderSelected(new Set(combinedPacks.map((p) => p.id)));
  }

  function selectBuilderCustomSetsOnly() {
    setBuilderSelected(new Set(combinedPacks.filter((p) => p.isCustomSet).map((p) => p.id)));
  }

  function clearBuilderSelection() {
    setBuilderSelected(new Set());
  }

  function toggleBuilderExclude(cardId: string) {
    setBuilderExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function saveBuilderPreset() {
    const name = builderName.trim();
    if (!name || builderSelected.size === 0) return;
    savePackSelectionPreset({
      name,
      packIds: [...builderSelected],
      excludedCardIds: [...builderExcluded],
    }).then((next) => {
      // Renaming while editing: saving under the new name is an upsert, so
      // it never touches the old name - without this it'd stick around as
      // a stale duplicate instead of the edit replacing it.
      if (editingPresetName && editingPresetName !== name) {
        deletePackSelectionPreset(editingPresetName).then(setPresets);
      } else {
        setPresets(next);
      }
      setBuilderName("");
      setBuilderSelected(new Set());
      setBuilderExcluded(new Set());
      setEditingPresetName(null);
    });
  }

  function editPreset(preset: PackSelectionPreset) {
    setBuilderName(preset.name);
    setBuilderSelected(new Set(preset.packIds));
    setBuilderExcluded(new Set(preset.excludedCardIds));
    setEditingPresetName(preset.name);
    builderHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditingPreset() {
    setEditingPresetName(null);
    setBuilderName("");
    setBuilderSelected(new Set());
    setBuilderExcluded(new Set());
  }

  function removePreset(name: string) {
    deletePackSelectionPreset(name).then(setPresets);
    if (editingPresetName === name) cancelEditingPreset();
  }

  const theming = themeAttrs(theme, accentIndex);
  const corePacks = allPacks.filter((p) => !p.isCustomSet);
  const counts: Record<SectionId, number | null> = {
    core: corePacks.length,
    cards: data.white.length + data.black.length,
    sets: sets.length,
    presets: presets.length,
    backup: null,
  };

  return (
    <div className="page card-mgmt-page" data-table-theme={theming["data-table-theme"]} style={theming.style}>
      <header className="room-header">
        <button type="button" onClick={() => navigate("/")}>
          <BackArrowIcon /> Back
        </button>
        <span>Card Management</span>
      </header>

      <AdminBar onChange={setIsAdmin} />

      <div className="card-mgmt-layout">
        <nav className="card-mgmt-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`card-mgmt-nav-item${activeSection === s.id ? " active" : ""}`}
              onClick={() => setActiveSection(s.id)}
            >
              <s.icon className="card-mgmt-nav-icon" />
              <span className="card-mgmt-nav-label">{s.label}</span>
              {counts[s.id] != null && <span className="card-mgmt-nav-count">{counts[s.id]}</span>}
            </button>
          ))}
        </nav>

        <main className="card-mgmt-content">
          {activeSection === "core" && <CoreSetPanel packs={corePacks} onPacksChanged={refreshAllPacks} />}

          {activeSection === "cards" && (
            <>
              <div className="panel">
                <h2>Add a card</h2>
                <div className="role-picker">
                  <label>
                    <input type="radio" checked={type === "white"} onChange={() => setType("white")} />
                    White
                  </label>
                  <label>
                    <input type="radio" checked={type === "black"} onChange={() => setType("black")} />
                    Black
                  </label>
                </div>
                <div className="row">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={type === "white" ? "Card text…" : "Prompt text (one _ per blank)…"}
                    maxLength={300}
                    style={{ flex: 1 }}
                  />
                </div>
                {type === "black" && (
                  <div className="row">
                    {([1, 2, 3] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={pick === n ? "theme-btn selected" : "theme-btn"}
                        onClick={() => setPick(n)}
                      >
                        Pick {n}
                      </button>
                    ))}
                  </div>
                )}
                <div className="row">
                  <button className="primary" type="button" onClick={addCard} disabled={!text.trim()}>
                    Add card
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2>Upload a JSON file</h2>
                <p className="muted">
                  {'Format: {"white":[{"text":"..."}], "black":[{"text":"...", "pick":1}]} — appends to what\'s already here.'}
                </p>
                <p className="muted">
                  Use a single <code>_</code> per blank — extra underscores each count as their own blank, so{" "}
                  <code>___</code> silently sets Pick to 3. The display already stretches one <code>_</code> into a
                  full-width blank.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <button type="button" onClick={handleUploadClick}>
                  Choose a file…
                </button>
                {uploadError && <p className="error">{uploadError}</p>}
              </div>

              <div className="card-mgmt-two-col">
                <div className="panel">
                  <h2>White cards ({data.white.length})</h2>
                  {data.white.length === 0 ? (
                    <p className="muted">None yet.</p>
                  ) : (
                    <ul className="player-list">
                      {data.white.map((c) => (
                        <li key={c.id} className="player-row">
                          <span>{c.text}</span>
                          <button type="button" onClick={() => deleteCard(c.id)} aria-label={`Delete ${c.text}`}>
                            <CloseCircleIcon />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel">
                  <h2>Black cards ({data.black.length})</h2>
                  {data.black.length === 0 ? (
                    <p className="muted">None yet.</p>
                  ) : (
                    <ul className="player-list">
                      {data.black.map((c) => (
                        <li key={c.id} className="player-row">
                          <span>
                            {c.text} <span className="tag">Pick {c.pick}</span>
                          </span>
                          <button type="button" onClick={() => deleteCard(c.id)} aria-label={`Delete ${c.text}`}>
                            <CloseCircleIcon />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}

          {activeSection === "sets" && (
            <>
              <div className="panel">
                <h2>Create a Custom Set</h2>
                <p className="muted">
                  A named pack of your own cards — shows up in any room's Packs list as "Custom Set: {"{"}name{"}"}",
                  selectable on its own, separate from the loose cards above.
                </p>
                <div className="row">
                  <input
                    value={newSetName}
                    onChange={(e) => setNewSetName(e.target.value)}
                    placeholder="Set name…"
                    maxLength={80}
                    style={{ flex: 1 }}
                  />
                </div>
                <p className="muted">
                  Upload a CSV (header row <code>type,text,pick</code>, pick only used for "black" rows) or a JSON
                  file (same format as above) to create the set already populated — or just create it empty and add
                  cards below.
                </p>
                <p className="muted">
                  Use a single <code>_</code> for each blank in a black card's text — not <code>___</code> or more to
                  make it look longer. Each underscore is counted as its own blank (so <code>___</code> reads as
                  three), which silently sets the wrong Pick count. The card display already stretches a single{" "}
                  <code>_</code> into a full-width blank on its own.
                </p>
                <div className="row">
                  <button type="button" onClick={downloadSetJsonTemplate}>
                    <DownloadIcon /> Download JSON template
                  </button>
                  <button type="button" onClick={downloadSetCsvTemplate}>
                    <DownloadIcon /> Download CSV template
                  </button>
                </div>
                <div className="row">
                  <input
                    ref={setFileInputRef}
                    type="file"
                    accept="application/json,.csv,text/csv"
                    onChange={handleSetFileChange}
                    style={{ display: "none" }}
                  />
                  <button type="button" onClick={handleSetUploadClick} disabled={!newSetName.trim()}>
                    Upload a file…
                  </button>
                  <button type="button" onClick={createEmptySet} disabled={!newSetName.trim()}>
                    Create empty set
                  </button>
                </div>
                {setsUploadError && <p className="error">{setsUploadError}</p>}
              </div>

              <div className="panel">
                <h2>Your Custom Sets ({sets.length})</h2>
                {sets.length === 0 ? (
                  <p className="muted">None yet.</p>
                ) : (
                  <div className="stack">
                    {sets.map((s) => (
                      <CustomSetRow key={s.id} set={s} onUpdate={setSets} onPreview={setPreviewSet} />
                    ))}
                  </div>
                )}
              </div>

              {previewSet && (
                <PackPreviewModal
                  pack={setToPackSummary(previewSet)}
                  selected={false}
                  canToggle={false}
                  onToggle={() => {}}
                  onClose={() => setPreviewSet(null)}
                />
              )}
            </>
          )}

          {activeSection === "presets" && (
            <>
              <div className="panel">
                <h2>Pack Selection Presets</h2>
                <p className="muted">
                  Save a specific combination of packs — any section, or your own Custom Sets — under a name, so a
                  host can apply the whole selection at once from a room's Lobby instead of re-checking boxes every
                  time. You can also exclude specific cards you never want to see, even from packs you otherwise
                  like.
                </p>

                <h3 ref={builderHeadingRef}>{editingPresetName ? `Editing "${editingPresetName}"` : "Build a preset"}</h3>
                <div className="row">
                  <input
                    value={builderName}
                    onChange={(e) => setBuilderName(e.target.value)}
                    placeholder="Preset name…"
                    maxLength={60}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="primary"
                    onClick={saveBuilderPreset}
                    disabled={!builderName.trim() || builderSelected.size === 0}
                  >
                    {editingPresetName ? "Update preset" : "Save as preset"}
                  </button>
                  {editingPresetName && (
                    <button type="button" onClick={cancelEditingPreset}>
                      Cancel
                    </button>
                  )}
                </div>
                <div className="row">
                  <input
                    value={builderFilter}
                    onChange={(e) => setBuilderFilter(e.target.value)}
                    placeholder="Filter packs…"
                  />
                  <button type="button" onClick={selectAllBuilderPacks}>
                    Select all
                  </button>
                  <button type="button" onClick={selectBuilderCustomSetsOnly}>
                    Custom Sets only
                  </button>
                  <button type="button" onClick={clearBuilderSelection}>
                    Clear
                  </button>
                </div>
                {allBuilderCategories.length > 1 && (
                  <div className="row">
                    <button
                      type="button"
                      className={builderCategoryFilter === null ? "filter-chip selected" : "filter-chip"}
                      onClick={() => setBuilderCategoryFilter(null)}
                    >
                      All sections
                    </button>
                    {allBuilderCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={builderCategoryFilter === c ? "filter-chip selected" : "filter-chip"}
                        onClick={() => setBuilderCategoryFilter(builderCategoryFilter === c ? null : c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <p className="muted">
                  {builderSelected.size} packs selected
                  {builderExcluded.size > 0 &&
                    ` · ${builderExcluded.size} card${builderExcluded.size === 1 ? "" : "s"} excluded`}
                  . Preview a pack to exclude individual cards from it.
                </p>
                {builderCategoryGroups.map((g) => (
                  <PackSection
                    key={g.category}
                    title={g.category}
                    packs={g.packs}
                    selected={builderSelected}
                    collapsed={builderCollapsed.has(g.category)}
                    onToggleCollapsed={() => toggleBuilderCollapsed(g.category)}
                    canToggle
                    onTogglePack={toggleBuilderPack}
                    onPreview={setBuilderPreviewPack}
                  />
                ))}
                <PackSection
                  title="Custom Sets"
                  packs={builderCustomSetPacks}
                  selected={builderSelected}
                  collapsed={builderCollapsed.has("customSets")}
                  onToggleCollapsed={() => toggleBuilderCollapsed("customSets")}
                  canToggle
                  onTogglePack={toggleBuilderPack}
                  onPreview={setBuilderPreviewPack}
                />

                <h3>Your saved presets</h3>
                {presets.length === 0 ? (
                  <p className="muted">None yet.</p>
                ) : (
                  <ul className="player-list">
                    {presets.map((p) => (
                      <li key={p.name} className="player-row">
                        <span>
                          <strong>{p.name}</strong>{" "}
                          <span className="muted">
                            ({p.packIds.length} pack{p.packIds.length === 1 ? "" : "s"}
                            {p.excludedCardIds.length > 0 && `, ${p.excludedCardIds.length} excluded`})
                          </span>
                        </span>
                        <span className="row">
                          <button type="button" onClick={() => editPreset(p)}>
                            Edit
                          </button>
                          <button type="button" onClick={() => removePreset(p.name)} aria-label={`Delete preset ${p.name}`}>
                            <CloseCircleIcon />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {builderPreviewPack && (
                <PackPreviewModal
                  pack={builderPreviewPack}
                  selected={builderSelected.has(builderPreviewPack.id)}
                  canToggle
                  onToggle={() => toggleBuilderPack(builderPreviewPack.id)}
                  onClose={() => setBuilderPreviewPack(null)}
                  excludedCardIds={builderExcluded}
                  onToggleExclude={toggleBuilderExclude}
                />
              )}
            </>
          )}

          {activeSection === "backup" && (
            <div className="panel">
              <h2>Backup &amp; Restore</h2>
              <p className="muted">
                Download everything below — your loose custom cards and every Custom Set — as one file you keep
                yourself. Restoring merges a backup back in; it never replaces or deletes what's already here.
              </p>
              <div className="row">
                <button type="button" onClick={downloadBackup}>
                  <DownloadIcon /> Download backup
                </button>
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleRestoreFileChange}
                  style={{ display: "none" }}
                />
                <button type="button" onClick={handleRestoreClick}>
                  <UploadIcon /> Restore from backup…
                </button>
              </div>
              {restoreError && <p className="error">{restoreError}</p>}
              {restoreStatus && <p className="muted">{restoreStatus}</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
