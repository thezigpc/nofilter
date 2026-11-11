import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  label: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** A themed stand-in for window.prompt() - the native dialog can't be
 * styled at all (it's browser chrome, not page content), so it always
 * looked broken against the app's own look. Same backdrop/panel pattern
 * as PackPreviewModal. */
export default function TextPromptModal({ title, label, confirmLabel = "Save", onConfirm, onCancel }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <div className="prompt-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="prompt-modal-panel">
        <h3>{title}</h3>
        <label className="prompt-modal-label">
          {label}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <div className="prompt-modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!value.trim()} onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
