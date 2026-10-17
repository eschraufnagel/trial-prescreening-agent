import { type ReactNode, useState } from "react";
import type { ConversationSummary } from "../server/conversations.js";
import { exampleLabel, screeningLabel } from "./logic.js";

/**
 * One screening in a list (slice 0014): its readable name, its id small, its
 * actions, and, for the person's own, Delete… with an inline confirmation.
 * An eval-run conversation gets no delete: it's the project's test material.
 */
export function ScreeningRow(props: {
  conversation: ConversationSummary;
  title: string | undefined;
  children: ReactNode;
  onDelete?: () => void;
}) {
  const { conversation: c } = props;
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="card row-card">
      {/* An example sits under its trial's heading on Reviews (slice 0016), so
          it's named by its simulated patient, not by the trial again. */}
      {c.origin === "eval-run" ? (
        <div>
          <span className="row-title">{exampleLabel(c.id)}</span>
          <span className="dim">{c.turns} messages</span>
        </div>
      ) : (
        <div>
          <span className="row-title">{screeningLabel(c.id, props.title)}</span>
          <span className="dim">
            <span className="id">{c.id}</span> · {c.turns} messages
          </span>
        </div>
      )}
      {confirming ? (
        <span className="confirm">
          <span>Delete this screening?</span>
          <button type="button" className="danger" onClick={props.onDelete}>
            Delete
          </button>
          <button type="button" className="quiet" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <span className="actions">
          {props.children}
          {props.onDelete !== undefined && (
            <button type="button" className="destructive" onClick={() => setConfirming(true)}>
              Delete…
            </button>
          )}
        </span>
      )}
    </li>
  );
}
