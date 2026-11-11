import type { RoomStateForClient } from "@tabletop-judge/shared";
import JudgingBoard from "./JudgingBoard.js";
import Scoreboard from "./Scoreboard.js";
import SubmissionStatusPill from "./SubmissionStatusPill.js";

type Props = { state: RoomStateForClient } & Omit<
  React.ComponentProps<typeof JudgingBoard>,
  "state" | "topSlot" | "readOnly"
>;

/** Persistent sidebar scoreboard + pinned black-card banner, submissions
 * fill whatever space is left. Wraps the real JudgingBoard/Scoreboard
 * unmodified - this is chrome around them, not a reimplementation. */
export default function TableDenseLayout({ state, ...judgingBoardProps }: Props) {
  return (
    <div className="table-judging-shell" data-table-layout="dense">
      <div className="layout-dense">
        <aside className="dense-sidebar">
          <h3>Scoreboard</h3>
          <Scoreboard state={state} />
        </aside>
        <div className="dense-main">
          <JudgingBoard
            state={state}
            topSlot={
              <div className="dense-status-row">
                <SubmissionStatusPill state={state} />
              </div>
            }
            {...judgingBoardProps}
          />
        </div>
      </div>
    </div>
  );
}
