import { useEffect, useState } from "react";
import type { PackContents, PackSummary } from "@tabletop-judge/shared";
import { fetchPackPreview } from "../packPreview.js";
import { CheckboxCheckedIcon, CheckboxEmptyIcon, CheckIcon, CloseCircleIcon } from "./Icons.js";

interface Props {
  pack: PackSummary;
  selected: boolean;
  canToggle: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Preset-builder mode only (see CustomCardsPage.tsx) - a room never
   * exposes its own live exclude-a-card toggle, only presets do. When
   * omitted, cards render as plain read-only text. */
  excludedCardIds?: Set<string>;
  onToggleExclude?: (cardId: string) => void;
}

export default function PackPreviewModal({
  pack,
  selected,
  canToggle,
  onToggle,
  onClose,
  excludedCardIds,
  onToggleExclude,
}: Props) {
  const [contents, setContents] = useState<PackContents | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContents(null);
    fetchPackPreview(pack.id).then((data) => {
      if (cancelled) return;
      setContents(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pack.id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="pack-preview-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pack-preview-panel">
        <header className="pack-preview-header">
          <div>
            <h3>
              {pack.name} {!pack.isCustomSet && <span className="tag">{pack.category}</span>}
            </h3>
            <p className="muted">
              {pack.whiteCount} white · {pack.blackCount} black
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview">
            <CloseCircleIcon />
          </button>
        </header>

        {canToggle && (
          <div className="pack-preview-actions">
            <button type="button" className={selected ? "primary" : ""} onClick={onToggle}>
              {selected ? (
                <>
                  <CheckIcon /> Included in your deck
                </>
              ) : (
                "+ Add to deck"
              )}
            </button>
          </div>
        )}

        {loading ? (
          <p className="muted center-text">Loading…</p>
        ) : !contents ? (
          <p className="muted center-text">Couldn't load this pack's cards.</p>
        ) : (
          <>
            {onToggleExclude && (
              <p className="muted pack-preview-exclude-hint">Tap a card to exclude it from this preset.</p>
            )}
            <div className="pack-preview-columns">
              <div className="pack-preview-column">
                <h4>White cards ({contents.white.length})</h4>
                <ul>
                  {contents.white.map((c) => {
                    const excluded = excludedCardIds?.has(c.id) ?? false;
                    return (
                      <li key={c.id}>
                        {onToggleExclude ? (
                          <button
                            type="button"
                            className={excluded ? "exclude-toggle excluded" : "exclude-toggle"}
                            onClick={() => onToggleExclude(c.id)}
                          >
                            {excluded ? <CheckboxEmptyIcon /> : <CheckboxCheckedIcon />} {c.text}
                          </button>
                        ) : (
                          c.text
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="pack-preview-column">
                <h4>Black cards ({contents.black.length})</h4>
                <ul>
                  {contents.black.map((c) => {
                    const excluded = excludedCardIds?.has(c.id) ?? false;
                    return (
                      <li key={c.id}>
                        {onToggleExclude ? (
                          <button
                            type="button"
                            className={excluded ? "exclude-toggle excluded" : "exclude-toggle"}
                            onClick={() => onToggleExclude(c.id)}
                          >
                            {excluded ? <CheckboxEmptyIcon /> : <CheckboxCheckedIcon />} {c.text}{" "}
                            <span className="muted">(pick {c.pick})</span>
                          </button>
                        ) : (
                          <>
                            {c.text} <span className="muted">(pick {c.pick})</span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
