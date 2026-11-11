import type { RoomStateForClient } from "@tabletop-judge/shared";
import JudgingBoard from "./JudgingBoard.js";
import SubmissionStatusPill from "./SubmissionStatusPill.js";
import SubmissionAvatarRow from "./SubmissionAvatarRow.js";

type Props = { state: RoomStateForClient } & Omit<
  React.ComponentProps<typeof JudgingBoard>,
  "state" | "topSlot" | "readOnly"
>;

/** Persistent top strip showing round pacing (who's submitted, who hasn't),
 * centered black card, submissions fill whatever space is left below.
 * Wraps the real JudgingBoard unmodified - this is chrome around it, not a
 * reimplementation. */
export default function TableCommandStripLayout({ state, ...judgingBoardProps }: Props) {
  return (
    <div className="table-judging-shell" data-table-layout="strip">
      <div className="layout-strip">
        <header className="strip-header">
          <SubmissionStatusPill state={state} />
          <SubmissionAvatarRow state={state} />
        </header>
        <div className="strip-body">
          <JudgingBoard state={state} {...judgingBoardProps} />
        </div>
      </div>
    </div>
  );
}
