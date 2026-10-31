import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { getReview, type ReviewFetch } from "./api.js";
import { CriterionText } from "./CriterionText.js";
import {
  type Exchange,
  type ReviewModel,
  type ReviewRow,
  reviewModel,
  segments,
} from "./review.js";

/**
 * The coordinator review of a finished conversation (0007 spec §6). It lays
 * out `reviewModel` and nothing more: every word it shows about a finding
 * comes from there, where a test checks where it stops. Class names come from
 * group keys and fixed strings only, so no row is styled by how it went.
 */
export function ReviewPage({ id }: { id: string }) {
  const [found, setFound] = useState<ReviewFetch | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setFound(undefined);
    setError(undefined);
    getReview(id).then(setFound, (e: unknown) => setError(String(e)));
  }, [id]);

  if (error !== undefined) {
    return (
      <main className="page">
        <p className="error">{error}</p>
      </main>
    );
  }
  if (found === undefined) {
    return (
      <main className="page">
        <p className="dim">Loading…</p>
      </main>
    );
  }
  switch (found.kind) {
    case "unknown":
      return (
        <main className="page">
          <p className="error">
            No conversation {id} on this server. <a href="#/">Back to the start</a>.
          </p>
        </main>
      );
    case "not-finished":
    case "no-result":
      return (
        <main className="page">
          <p>
            {found.kind === "not-finished"
              ? "This conversation hasn't finished. The review opens when it does."
              : "This conversation finished, but its saved file has no result to review."}{" "}
            <a href={`#/c/${id}`}>Back to the conversation</a>.
          </p>
        </main>
      );
    case "ok":
      return <Review model={reviewModel(found.review)} />;
  }
}

/**
 * A link within the page. The URL hash is the page's router, so an ordinary
 * `#turn-3` would leave the review; this scrolls instead and leaves the hash.
 */
function Jump({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    const target = document.getElementById(to);
    // A row or group folded away is opened on the way, so the jump lands on it (slice 0014).
    for (let node = target; node !== null; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) {
        node.open = true;
      }
    }
    target?.scrollIntoView({ block: "start" });
  };
  return (
    <a href={`#${to}`} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

function Review({ model }: { model: ReviewModel }) {
  const { frame, rows, transcript } = model;
  // The first group with rows starts open; the rest are one click away.
  const firstOpen = frame.groups.find((g) => g.count > 0)?.key;
  return (
    <main className="review">
      {/* Fixed words and one count per group: what's left for the coordinator,
          never a total or a verdict (0007's rule, kept in 0014). On the left,
          beside the groups it links to (slice 0020). */}
      <nav className="review-summary" aria-labelledby="left-h">
        <h2 id="left-h">What's left for you</h2>
        <ul>
          {frame.groups.map((g) => (
            <li key={g.key}>
              <Jump to={`group-${g.key}`} className="review-count">
                <strong>{g.count}</strong>
                <span className="review-count-heading">{g.heading}</span>
                <span className="review-count-what">{g.what}</span>
              </Jump>
            </li>
          ))}
        </ul>
      </nav>

      <div className="review-main">
        <header className="review-head">
          <span className="review-nct">{frame.nctId}</span>
          <h1>{frame.title}</h1>
          {/* An example's name is words, so it isn't set as code (slice 0016). */}
          <span
            className={frame.label === frame.id ? "review-label id" : "review-label"}
            title={frame.id}
          >
            {frame.label}
          </span>
          <div className="review-notes">
            {frame.notes.map((note) => (
              <p key={note} className="review-note">
                {note}
              </p>
            ))}
          </div>
        </header>

        {frame.groups.map((g) => (
          <section key={g.key} id={`group-${g.key}`} className={`review-group group-${g.key}`}>
            <details open={g.key === firstOpen}>
              <summary>
                <h2>{g.heading}</h2>
                <span className="review-group-count">{g.count}</span>
                <p className="review-what">{g.what}</p>
              </summary>
              {g.rows.length === 0 ? (
                <p className="review-none">None.</p>
              ) : (
                <ol className="review-rows">
                  {g.rows.map((rowId) => {
                    const row = rows[rowId];
                    return row === undefined ? null : <Row key={rowId} row={row} />;
                  })}
                </ol>
              )}
            </details>
          </section>
        ))}

        <section className="review-transcript">
          <h2>The conversation</h2>
          <ol>
            {transcript.map((line) => (
              <li key={line.turn} id={`turn-${line.turn}`} className="review-turn">
                <span className="dim">
                  {line.turn} · {line.speaker}
                  {line.raised !== null && <> · asked about rule {line.raised}</>}
                </span>
                <p>{line.text}</p>
                {line.citedBy.length > 0 && (
                  <span className="dim">
                    Shown with {line.citedBy.length === 1 ? "rule" : "rules"}{" "}
                    {line.citedBy.map((c, i) => (
                      <span key={c}>
                        {i > 0 && ", "}
                        <Jump to={`row-${c}`}>{c}</Jump>
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <footer className="review-foot">
          {frame.footer.map((line) => (
            <p key={line} className="dim">
              {line}
            </p>
          ))}
        </footer>
      </div>
    </main>
  );
}

function Row({ row }: { row: ReviewRow }) {
  return (
    <li id={`row-${row.criterion.id}`} className="review-row">
      <details>
        {/* One line of a grid: rule, type, words, finding, and a chevron drawn by the stylesheet. */}
        <summary>
          <span className="id" title={`Rule ${row.criterion.id}, in the protocol's order`}>
            {row.criterion.id}
          </span>
          <span className="review-type">{row.polarity}</span>
          <CriterionText criterion={row.criterion} plain={row.plain} audience="coordinator" />
          <span className="review-finding">{row.finding}</span>
        </summary>
        <RowDetail row={row} />
      </details>
    </li>
  );
}

/** A row's detail, shown when it's opened: why, how often it was asked, and the words. */
function RowDetail({ row }: { row: ReviewRow }) {
  return (
    <div className="review-detail">
      {(row.reason !== null || row.asked > 0) && (
        <div className="row-detail">
          {row.reason !== null && <span>Why: {row.reason}</span>}
          {row.asked > 0 && <span>Asked {row.asked}×</span>}
        </div>
      )}
      {row.exchanges.map((e) => (
        <ExchangeView key={`${e.question?.turn}:${e.reply?.turn}`} exchange={e} />
      ))}
      {row.readings.map((line) => (
        <p key={line} className="review-reading">
          {line}
        </p>
      ))}
    </div>
  );
}

function ExchangeView({ exchange }: { exchange: Exchange }) {
  const { question, reply } = exchange;
  return (
    <div className="review-exchange">
      {question !== null && (
        <p className="review-question">
          <Jump to={`turn-${question.turn}`} className="dim">
            {question.turn}
          </Jump>{" "}
          {question.text}
        </p>
      )}
      {reply === null ? (
        <p className="review-reply dim">No reply: the conversation ended here.</p>
      ) : (
        <p className="review-reply">
          <Jump to={`turn-${reply.turn}`} className="dim">
            {reply.turn}
          </Jump>{" "}
          {segments(reply.text, reply.marks).map((part) =>
            part.mark === null ? (
              <span key={part.start}>{part.text}</span>
            ) : (
              <mark key={part.start} title={`The agent read this as: ${part.mark.reading}`}>
                {part.text}
              </mark>
            ),
          )}
        </p>
      )}
    </div>
  );
}
