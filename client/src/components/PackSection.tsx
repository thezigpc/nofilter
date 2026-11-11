import type { PackSummary } from "@tabletop-judge/shared";
import { EyeIcon } from "./Icons.js";

interface Props {
  title: string;
  packs: PackSummary[];
  selected: Set<string>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  canToggle: boolean;
  onTogglePack: (id: string) => void;
  onPreview: (pack: PackSummary) => void;
}

export default function PackSection({
  title,
  packs,
  selected,
  collapsed,
  onToggleCollapsed,
  canToggle,
  onTogglePack,
  onPreview,
}: Props) {
  const selectedCount = packs.filter((p) => selected.has(p.id)).length;

  return (
    <div className="pack-section">
      <button type="button" className="pack-section-header" onClick={onToggleCollapsed}>
        <span>
          {collapsed ? "▸" : "▾"} {title}
        </span>
        <span className="muted">
          {packs.length} packs{selectedCount > 0 && ` · ${selectedCount} selected`}
        </span>
      </button>
      {!collapsed && (
        <div className="pack-list">
          {packs.map((p) => (
            <div key={p.id} className="pack-row">
              <label className="pack-row-select">
                <input
                  type="checkbox"
                  disabled={!canToggle}
                  checked={selected.has(p.id)}
                  onChange={() => onTogglePack(p.id)}
                />
                <span>{p.name}</span>
                <span className="muted" title={`${p.whiteCount} white cards, ${p.blackCount} black cards`}>
                  {p.whiteCount} white · {p.blackCount} black
                </span>
              </label>
              <button type="button" className="link-btn" onClick={() => onPreview(p)}>
                <EyeIcon /> Preview
              </button>
            </div>
          ))}
          {packs.length === 0 && <p className="muted">No packs match.</p>}
        </div>
      )}
    </div>
  );
}
