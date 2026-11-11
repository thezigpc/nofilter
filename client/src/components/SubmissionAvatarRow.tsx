import type { RoomStateForClient } from "@tabletop-judge/shared";
import { getSubmissionProgress } from "../submissionProgress.js";

export default function SubmissionAvatarRow({ state }: { state: RoomStateForClient }) {
  const { requiredPlayers } = getSubmissionProgress(state);
  return (
    <div className="strip-avatars">
      {requiredPlayers.map((p) => (
        <span key={p.id} className={`strip-avatar${p.hasSubmitted ? " done" : ""}`} title={p.name}>
          {p.name.charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
