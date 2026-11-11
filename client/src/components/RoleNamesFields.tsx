import { useEffect, useState } from "react";
import { DEFAULT_ROLE_NAMES, MAX_ROLE_NAME_LENGTH, type RoleNames } from "@tabletop-judge/shared";

/**
 * Two text inputs for what the Judge and the Wild Card bot are called.
 * Shared by the Lobby (per-room) and /admin (the deployment default).
 *
 * Commits on blur or Enter rather than per keystroke: every commit is a
 * broadcast to the whole room, and a half-typed name flashing across
 * everyone's screen reads as a glitch. An emptied field snaps back to the
 * default instead of leaving a role nameless.
 */
export default function RoleNamesFields({
  value,
  disabled,
  onCommit,
}: {
  value: RoleNames;
  disabled?: boolean;
  onCommit: (next: Partial<RoleNames>) => void;
}) {
  const [draft, setDraft] = useState<RoleNames>(value);

  // Follow changes made elsewhere (another host device, a Quick Setup).
  useEffect(() => setDraft(value), [value.judge, value.wildCard]);

  function commit(key: keyof RoleNames) {
    const clean = draft[key].trim() || DEFAULT_ROLE_NAMES[key];
    if (clean !== draft[key]) setDraft((d) => ({ ...d, [key]: clean }));
    if (clean !== value[key]) onCommit({ [key]: clean });
  }

  function field(key: keyof RoleNames, label: string, hint: string) {
    return (
      <label className="role-name-field">
        <span>{label}</span>
        <input
          value={draft[key]}
          maxLength={MAX_ROLE_NAME_LENGTH}
          disabled={disabled}
          placeholder={DEFAULT_ROLE_NAMES[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          onBlur={() => commit(key)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="muted">{hint}</span>
      </label>
    );
  }

  return (
    <div className="role-names">
      {field("judge", "Judge is called", "whoever picks the winner each round")}
      {field("wildCard", "Wild Card is called", "the bot that plays a random card")}
    </div>
  );
}
