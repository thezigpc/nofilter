import { useEffect, useState } from "react";

/**
 * Binding a number input's value directly to server-echoed state means
 * every keystroke round-trips: clearing the field to type a replacement
 * sends an out-of-range value, the server rejects it, no new state comes
 * back, and the controlled input snaps right back to the old digit before
 * you can type a new one. This keeps its own local buffer (always shows
 * exactly what was typed) and only commits once it's a valid number,
 * re-syncing from the external value only when it changes for a reason
 * other than this component's own typing (another client, a rejected/
 * settled update).
 */
export default function BufferedNumberInput({
  value,
  min,
  max,
  disabled,
  onCommit,
  width = "4rem",
}: {
  value: number;
  min: number;
  max?: number;
  disabled: boolean;
  onCommit: (n: number) => void;
  width?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function handleChange(raw: string) {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n) && n >= min && (max == null || n <= max)) {
      onCommit(n);
    }
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      style={{ width }}
    />
  );
}
