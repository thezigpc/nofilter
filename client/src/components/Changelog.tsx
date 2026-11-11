import { useState } from "react";
import type { ChangeKind } from "../changelog.js";
import { CHANGELOG, CHANGE_KIND_LABELS } from "../changelog.js";

// New first, then Improved, then Fixed. Sorted at render rather than
// maintained by hand in the data, so "add your line to the top entry"
// stays a safe instruction no matter which kind it is.
const KIND_ORDER: Record<ChangeKind, number> = { new: 0, improved: 1, fixed: 2 };

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });

function formatDate(iso: string): string {
  // Parsed as UTC parts rather than `new Date(iso)` so the heading doesn't
  // slip to the previous day for anyone west of GMT.
  const [y, m, d] = iso.split("-").map(Number);
  return DATE_FORMAT.format(new Date(y, m - 1, d));
}

/**
 * Release notes at the foot of the home page. Only the most recent entry is
 * open by default - this sits below the buttons people actually came for,
 * so it should be findable without being in the way.
 */
export default function Changelog() {
  const [showAll, setShowAll] = useState(false);
  const entries = showAll ? CHANGELOG : CHANGELOG.slice(0, 1);
  const hiddenCount = CHANGELOG.length - 1;

  return (
    <div className="panel changelog">
      <h2>What's new</h2>
      {entries.map((entry) => (
        <div key={entry.date} className="changelog-entry">
          <p className="changelog-date">{formatDate(entry.date)}</p>
          <ul className="changelog-list">
            {[...entry.items]
              .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
              .map((item, i) => (
              <li key={i}>
                <span className={`changelog-tag tag-${item.kind}`}>{CHANGE_KIND_LABELS[item.kind]}</span>
                <span className="changelog-text">{item.text}</span>
              </li>
              ))}
          </ul>
        </div>
      ))}
      {hiddenCount > 0 && (
        <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show less" : `Show ${hiddenCount} earlier update${hiddenCount === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
