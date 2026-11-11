import { useEffect, useState } from "react";
import type { GameSetupPreset, RoomStateForClient } from "@tabletop-judge/shared";
import { BUILT_IN_GAME_SETUPS } from "@tabletop-judge/shared";
import { socket } from "../socket.js";
import { CloseCircleIcon } from "./Icons.js";
import TextPromptModal from "./TextPromptModal.js";

/**
 * One-tap game configurations.
 *
 * The real failure mode in the Lobby was never "the settings are hard to
 * find" - it's that nobody wants to configure anything at the point they
 * actually want to start playing, so every game lands on the defaults
 * whether or not they suit the group. A named setup makes the interesting
 * configurations reachable without reading 31 controls.
 *
 * Packs are deliberately untouched here: they have their own preset system,
 * and a setup answers "how do we play?" not "with which cards?".
 */
export default function QuickSetupPanel({
  state,
  disabled,
}: {
  state: RoomStateForClient;
  disabled: boolean;
}) {
  const [saved, setSaved] = useState<GameSetupPreset[]>([]);
  const [namePromptOpen, setNamePromptOpen] = useState(false);

  useEffect(() => {
    socket.emit("listGameSetupPresets", setSaved);
  }, []);

  function applyBuiltIn(id: string) {
    const setup = BUILT_IN_GAME_SETUPS.find((s) => s.id === id);
    if (!setup) return;
    const { id: _id, name: _name, description: _description, ...rest } = setup;
    socket.emit("applyGameSetup", { setup: rest });
  }

  function applySaved(preset: GameSetupPreset) {
    const { name: _name, ...rest } = preset;
    socket.emit("applyGameSetup", { setup: rest });
  }

  function saveCurrent() {
    setNamePromptOpen(true);
  }

  function confirmSaveCurrent(name: string) {
    setNamePromptOpen(false);
    socket.emit("saveGameSetupPreset", { name }, setSaved);
  }

  function remove(name: string) {
    if (!window.confirm(`Delete the "${name}" setup?`)) return;
    socket.emit("deleteGameSetupPreset", { name }, setSaved);
  }

  return (
    <div className="panel quick-setup">
      <h2>Quick setup</h2>
      <p className="muted">
        One tap sets the house rules, win condition and hand size. Packs are chosen separately. Tweak anything
        afterwards.
      </p>

      <div className="setup-grid">
        {BUILT_IN_GAME_SETUPS.map((setup) => (
          <button
            key={setup.id}
            type="button"
            className="setup-card"
            disabled={disabled}
            onClick={() => applyBuiltIn(setup.id)}
          >
            <span className="setup-name">{setup.name}</span>
            <span className="setup-desc">{setup.description}</span>
          </button>
        ))}
      </div>

      {saved.length > 0 && (
        <>
          <p className="field-title">Your saved setups</p>
          <ul className="player-list">
            {saved.map((preset) => (
              <li key={preset.name} className="player-row">
                <button type="button" disabled={disabled} onClick={() => applySaved(preset)}>
                  {preset.name}
                </button>
                <button type="button" onClick={() => remove(preset.name)} aria-label={`Delete setup ${preset.name}`}>
                  <CloseCircleIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!disabled && (
        <div className="row">
          <button type="button" onClick={saveCurrent}>
            Save current settings as a setup
          </button>
        </div>
      )}

      {namePromptOpen && (
        <TextPromptModal
          title="Save setup"
          label="Name this setup (house rules, win condition and hand size — not packs):"
          onConfirm={confirmSaveCurrent}
          onCancel={() => setNamePromptOpen(false)}
        />
      )}
    </div>
  );
}
