import { useState } from "react";
import type { ActionCardTier, RoomStateForClient } from "@tabletop-judge/shared";
import {
  ACTION_CARD_DEFS,
  ACTION_CARD_TIERS,
  ACTION_CARD_TIER_LABELS,
  MAX_ACTION_CARD_TIER_WEIGHT,
  MIN_ACTION_CARD_TIER_WEIGHT,
} from "@tabletop-judge/shared";
import { socket } from "../socket.js";

/**
 * Per-card frequency for Action Cards, as named tiers rather than nine
 * percentage sliders - the room's density still decides how many Action
 * Cards get seeded overall, and these only shift the mix between them.
 *
 * What each tier is actually worth is deliberately tucked into a collapsed
 * Advanced block: it's a tuning knob you set once, not a per-game decision,
 * and it's never shown on the shared screen (which says "Tax rare", not
 * "Tax 0.4").
 */
export default function ActionCardTierPanel({
  state,
  disabled,
}: {
  state: RoomStateForClient;
  disabled: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Democracy is filtered out of the deck under Crowd Favorite (it needs a
  // Czar to override) or below its real-player floor (it needs a real
  // electorate), so showing a control for it there would be a lie.
  const realPlayerCount = state.players.filter((p) => p.role === "player" && !p.isRando).length;
  const defs = ACTION_CARD_DEFS.filter(
    (d) => !(d.requiresCzarMode && state.houseRules.crowdFavorite) && (!d.minRealPlayers || realPlayerCount >= d.minRealPlayers)
  );
  const tiers = state.actionCardTiers ?? {};
  const enabledCount = defs.filter((d) => (tiers[d.id] ?? "normal") !== "off").length;

  function setTier(cardId: string, tier: ActionCardTier) {
    socket.emit("setActionCardTier", { cardId, tier });
  }

  function setWeight(key: "rare" | "normal" | "common", value: number) {
    if (!Number.isFinite(value)) return;
    socket.emit("setActionCardTierWeights", { [key]: value });
  }

  return (
    <div className="action-card-tiers">
      <div className="row action-card-tiers-head">
        <span className="field-title">Which Action Cards, and how often</span>
        <span className="muted">
          {enabledCount} of {defs.length} in play
        </span>
      </div>

      {enabledCount === 0 && (
        <p className="muted">
          Every Action Card is switched off, so none will be dealt — turn at least one on, or turn the Action Cards rule
          off entirely.
        </p>
      )}

      <ul className="action-card-tier-list">
        {defs.map((def) => {
          const current = tiers[def.id] ?? "normal";
          return (
            <li key={def.id} className={current === "off" ? "tier-row is-off" : "tier-row"}>
              <div className="tier-card">
                <span className="tier-name">{def.name}</span>
                <span className="muted tier-desc">{def.description}</span>
              </div>
              <div className="tier-picker" role="group" aria-label={`${def.name} frequency`}>
                {ACTION_CARD_TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    disabled={disabled}
                    aria-pressed={current === tier}
                    className={current === tier ? "tier-btn selected" : "tier-btn"}
                    onClick={() => setTier(def.id, tier)}
                  >
                    {ACTION_CARD_TIER_LABELS[tier]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? "▾" : "▸"} Advanced: what the tiers are worth
      </button>
      {showAdvanced && (
        <div className="stack action-card-weights">
          <p className="muted">
            Relative weights, not percentages — a card at Common is dealt this many times as often as one at Normal.
            Changing these re-balances the mix without changing how many Action Cards appear overall.
          </p>
          {(["rare", "normal", "common"] as const).map((key) => (
            <label className="toggle-row" key={key}>
              {ACTION_CARD_TIER_LABELS[key]}
              <input
                type="number"
                min={MIN_ACTION_CARD_TIER_WEIGHT}
                max={MAX_ACTION_CARD_TIER_WEIGHT}
                step={0.1}
                disabled={disabled}
                value={state.actionCardTierWeights?.[key] ?? 1}
                onChange={(e) => setWeight(key, Number(e.target.value))}
                style={{ width: "5rem" }}
              />
              <span className="muted">×</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
