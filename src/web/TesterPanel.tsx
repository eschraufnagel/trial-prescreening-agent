import { useState } from "react";
import type { ConversationInspection } from "../server/types.js";
import { CriterionText } from "./CriterionText.js";
import { rows } from "./logic.js";

/** Whether the panel is open, remembered in this browser where storage works (slice 0014). */
const OPEN_KEY = "prescreen.tester";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "open";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "open" : "closed");
  } catch {
    // Storage blocked: the panel still opens, it just isn't remembered.
  }
}

/**
 * What the agent has recorded, criterion by criterion, as it records it.
 * The same list at the end as during: no totals and no grouping by outcome,
 * because counts of "holds" read as a score, and polarity is not applied here.
 */
export function TesterPanel(props: {
  inspection: ConversationInspection | undefined;
  changed: ReadonlySet<string>;
}) {
  const { inspection, changed } = props;
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    writeOpen(!open);
    setOpen(!open);
  };
  const count = inspection?.criteria.length;
  return (
    <section className="tester" aria-labelledby="tester-h">
      <h2 id="tester-h">What the agent has recorded</h2>
      <p className="tester-note">
        A view for testing. A person being screened wouldn't see this, and it isn't the
        coordinator's review.
        {inspection?.source === "parse" && (
          <>
            <br />
            Rules the AI read from a trial have no plain-language versions.
          </>
        )}
      </p>
      <button
        type="button"
        className="secondary tester-toggle"
        aria-expanded={open}
        aria-controls="tester-rows"
        onClick={toggle}
      >
        {open ? "Hide the rules" : `Show the ${count ?? ""} rules`.replace("  ", " ")}
      </button>
      {!open ? null : inspection === undefined ? (
        <p className="dim">Loading…</p>
      ) : (
        <ol className="rows" id="tester-rows">
          {rows(inspection, changed).map((row) => (
            <li
              key={row.criterion.id}
              className={`row ${row.status} ${row.awaiting ? "awaiting" : ""} ${row.changed ? "changed" : ""}`}
            >
              <div className="row-head">
                <span className="id">{row.criterion.id}</span>
                <span className="tag">{row.criterion.polarity}</span>
                <span className="tag">{row.criterion.type}</span>
                <span className={`status s-${row.status}`}>{row.words}</span>
                {row.awaiting && <span className="tag now">asked, awaiting reply</span>}
                {row.changed && <span className="tag new">changed</span>}
              </div>
              <CriterionText criterion={row.criterion} plain={row.plain} />
              {(row.reason !== null || row.reported !== undefined || row.timesAsked > 0) && (
                <div className="row-detail">
                  {row.reason !== null && <span>reason: {row.reason}</span>}
                  {row.reported !== undefined && <span>person reported: {row.reported}</span>}
                  {row.timesAsked > 0 && <span>asked {row.timesAsked}×</span>}
                </div>
              )}
              {row.evidence.map((e) => (
                <blockquote key={`${e.turn}:${e.quote}`} className="evidence">
                  “{e.quote}” <span className="dim">turn {e.turn}</span>
                </blockquote>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
