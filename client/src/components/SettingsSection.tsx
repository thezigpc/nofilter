import type { ReactNode } from "react";

/**
 * A collapsible settings block for the Lobby.
 *
 * The Lobby had grown to roughly five phone screens of always-expanded
 * controls, with Start Game stranded at the very bottom - so the common
 * case (glance, confirm, start) meant scrolling past 31 controls every
 * game. Collapsing by default puts Start Game back above the fold while
 * keeping everything one tap away.
 *
 * The `summary` is what makes that safe: a collapsed section still has to
 * say what's inside it ("2 on · win at 7"), or hiding it just moves the
 * problem from scrolling to guessing.
 *
 * Built on <details>, so it works without JS, keeps native keyboard and
 * screen-reader semantics, and needs no open/closed state of its own.
 */
export default function SettingsSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Shown on the collapsed row - keep it short and factual. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="settings-section" open={defaultOpen}>
      <summary>
        <span className="chev" aria-hidden="true">
          ›
        </span>
        <span className="settings-section-title">{title}</span>
        {summary != null && <span className="settings-section-summary">{summary}</span>}
      </summary>
      <div className="settings-section-body">{children}</div>
    </details>
  );
}
