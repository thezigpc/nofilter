import type { RoomStateForClient } from "@tabletop-judge/shared";
import { getSubmissionProgress } from "../submissionProgress.js";

export default function SubmissionStatusPill({ state }: { state: RoomStateForClient }) {
  const { requiredPlayers, submittedCount } = getSubmissionProgress(state);
  if (requiredPlayers.length === 0) return null;
  return (
    <span className="status-pill">
      {submittedCount} of {requiredPlayers.length} submitted
    </span>
  );
}
