import { useEffect, useState } from "react";
import type { ScreeningCriterion } from "../screening/types.js";
import { getTrialDetail, startConversation, type TrialDetail } from "./api.js";
import { CriterionText } from "./CriterionText.js";
import { badgeWords, CHECKLIST_NOTE, droppedWords, typeTag } from "./logic.js";

/**
 * A trial's checklist (slice 0014): what the AI read from its published rules,
 * before anyone screens against it. Each rule's words go through
 * `CriterionText`, the one place the page shows them, beside who can settle it.
 */
export function TrialPage({ nctId }: { nctId: string }) {
  const [detail, setDetail] = useState<TrialDetail | null | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setDetail(undefined);
    getTrialDetail(nctId).then(
      (found) => setDetail(found ?? null),
      (e: unknown) => setError(String(e)),
    );
  }, [nctId]);

  const start = async () => {
    try {
      window.location.hash = `#/c/${await startConversation(nctId)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (detail === undefined || detail === null) {
    return (
      <main className="page">
        <a href="#/" className="back">
          ← Your trials
        </a>
        {error !== undefined ? (
          <p className="error">{error}</p>
        ) : detail === null ? (
          <p className="error">No trial {nctId} is listed here.</p>
        ) : (
          <p className="dim">Loading…</p>
        )}
      </main>
    );
  }

  const { row, criteria, plain, criteriaText } = detail;
  const badge = badgeWords(row);
  const byType = row.byType;
  const dropped = droppedWords(row.dropped);
  const ready = criteria.length > 0 && row.state !== "fetching" && row.state !== "parsing";

  return (
    <main className="page">
      <a href="#/" className="back">
        ← Your trials
      </a>
      <div className="trial-hero">
        <div className="trial-main">
          <div className="trial-tags">
            <span className={`badge ${badge.tone}`}>{badge.text}</span>
            <a
              className="id"
              href={`https://clinicaltrials.gov/study/${row.nctId}`}
              target="_blank"
              rel="noreferrer"
            >
              {row.nctId} on ClinicalTrials.gov ↗
            </a>
          </div>
          <h1>{row.briefTitle ?? row.nctId}</h1>
          {row.conditions.length > 0 && (
            <ul className="chips">
              {row.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
        {ready && (
          <div className="trial-actions">
            <button type="button" onClick={start}>
              Start screening
            </button>
          </div>
        )}
      </div>
      {error !== undefined && <p className="error">{error}</p>}

      <p className="note">{CHECKLIST_NOTE}</p>
      {dropped !== undefined && <p className="note warn">{dropped}</p>}

      {byType !== null && (
        <ul className="counts">
          <li>
            <strong>{criteria.length}</strong> rules read
          </li>
          <li>
            <strong>{byType.patient}</strong> the person can answer
          </li>
          <li>
            <strong>{byType.clinical}</strong> need medical records
          </li>
        </ul>
      )}

      <Rules
        title="Who can join"
        criteria={criteria.filter((c) => c.polarity === "inclusion")}
        plain={plain}
      />
      <Rules
        title="Who can't join"
        criteria={criteria.filter((c) => c.polarity === "exclusion")}
        plain={plain}
      />

      {criteriaText !== null && (
        <details className="card published">
          <summary>The trial's rules as published</summary>
          <p className="dim">
            The eligibility text exactly as ClinicalTrials.gov gives it, for checking the checklist
            against.
          </p>
          <pre>{criteriaText}</pre>
        </details>
      )}
    </main>
  );
}

function Rules(props: {
  title: string;
  criteria: ScreeningCriterion[];
  plain: TrialDetail["plain"];
}) {
  if (props.criteria.length === 0) {
    return null;
  }
  return (
    <section className="card checklist" aria-label={props.title}>
      <h2>
        {props.title} <span className="dim">· {props.criteria.length} rules</span>
      </h2>
      <ol>
        {props.criteria.map((c) => (
          <li key={c.id}>
            <CriterionText criterion={c} plain={props.plain[c.id]} audience="coordinator" />
            <span className={`badge ${c.type === "patient" ? "accent" : "neutral"}`}>
              {typeTag(c.type)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
