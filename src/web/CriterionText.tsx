import type { PlainDisplay } from "../plain/types.js";
import type { ScreeningCriterion } from "../screening/types.js";
import { type Audience, plainView } from "./logic.js";

/**
 * The one place on the page that shows a criterion's words (0005 spec §7.3).
 * The protocol's own wording always, and under it the plain-language rendering
 * or the reason there is none (0006 spec §7.2). A rendering helps with reading;
 * it is never shown instead of the protocol's words.
 */
export function CriterionText(props: {
  criterion: ScreeningCriterion;
  plain?: PlainDisplay | undefined;
  /** The tester panel by default; the coordinator review sees fewer details (0007 spec §7). */
  audience?: Audience;
}) {
  const view = plainView(props.plain, props.audience);
  if (view === null) {
    return <p className="criterion">{props.criterion.text}</p>;
  }
  return (
    <div className="criterion">
      <p className="words">
        <span className="words-label">Protocol</span>
        {props.criterion.text}
      </p>
      <div className={view.text === null ? "words plain none" : "words plain"}>
        <span className="words-label">
          {view.label}
          {view.tag !== null && <span className="tag">{view.tag}</span>}
        </span>
        {view.text !== null && <p>{view.text}</p>}
        {view.lines.length > 0 && (
          <ul>
            {view.lines.map((line, i) => (
              // Two problems can read the same ("number added: 5ml" twice).
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
