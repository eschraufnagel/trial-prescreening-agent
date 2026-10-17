import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  addTrial,
  listTrials,
  refreshTrial,
  removeTrial,
  startConversation,
  type TrialRow,
} from "./api.js";
import {
  ADDED_NOTE,
  badgeWords,
  droppedWords,
  EXAMPLES_NOTE,
  FIRST_RUN_HEADING,
  pendingWords,
  readByWords,
  SET_UP_MODEL,
  settleWords,
  trialHash,
} from "./logic.js";

/**
 * Trials, the home page (slices 0013 and 0014): the person's own trials as
 * cards, a box to add one by its ClinicalTrials.gov link, and, with
 * `--examples`, the project's built-in ones below. The server fetches and
 * parses an added trial in the background; this page polls while one is busy.
 */

const POLL_MS = 2000;

const pending = (row: TrialRow) => row.state === "fetching" || row.state === "parsing";

export function TrialsPage({ ready }: { ready: boolean }) {
  const [rows, setRows] = useState<TrialRow[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    listTrials().then(setRows, (e: unknown) => setError(String(e)));
  }, []);

  useEffect(load, []);

  // While anything is fetching or parsing: poll the server, and tick each busy
  // card's running time once a second. On an interval, not chained off each
  // answer, so one failed poll doesn't freeze the page on a stale state.
  const anyPending = (rows ?? []).some(pending);
  useEffect(() => {
    if (!anyPending) {
      return;
    }
    setNow(Date.now());
    const poll = window.setInterval(load, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [anyPending, load]);

  const act = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    load();
  };

  const start = async (nctId: string) => {
    try {
      window.location.hash = `#/c/${await startConversation(nctId)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (rows === undefined) {
    return (
      <main className="page">
        {error === undefined ? <p className="dim">Loading…</p> : <p className="error">{error}</p>}
      </main>
    );
  }

  const mine = rows.filter((r) => r.origin === "added");
  const examples = rows.filter((r) => r.origin === "pinned");
  const card = (row: TrialRow) => (
    <TrialCard
      key={row.nctId}
      row={row}
      now={now}
      onStart={() => start(row.nctId)}
      onRefresh={() => act(() => refreshTrial(row.nctId))}
      onRemove={() => act(() => removeTrial(row.nctId))}
    />
  );

  return (
    <main className="page">
      {mine.length === 0 ? (
        <section className="hero" aria-labelledby="first-run">
          <h1 id="first-run">{FIRST_RUN_HEADING}</h1>
          <p className="sub">
            Find a trial on ClinicalTrials.gov and paste its link here. The AI turns its eligibility
            rules into a checklist, then you can try a screening against it.
          </p>
          {!ready && (
            <p className="card settings-note">
              {SET_UP_MODEL} <a href="#/settings">Set one up in Settings</a>: the local model, or a
              key for Anthropic, OpenAI or xAI.
            </p>
          )}
          <AddForm onAdd={(reference) => act(() => addTrial(reference))} />
          {error !== undefined && <p className="error">{error}</p>}
          <ol className="steps">
            <li>
              <span className="step-name">1 · Add</span>
              The app fetches the trial from ClinicalTrials.gov.
            </li>
            <li>
              <span className="step-name">2 · Read</span>
              The model chosen in Settings reads its rules into a checklist, usually in a minute or
              two.
            </li>
            <li>
              <span className="step-name">3 · Screen</span>
              Play a person considering the trial, then open the coordinator's review.
            </li>
          </ol>
        </section>
      ) : (
        <>
          <div className="page-head">
            <h1>Your trials</h1>
            <p className="sub">
              Add a trial from ClinicalTrials.gov. The AI reads its eligibility rules into a
              checklist, and you can screen against it once it's ready.
            </p>
          </div>
          <AddForm onAdd={(reference) => act(() => addTrial(reference))} />
          {error !== undefined && <p className="error">{error}</p>}
          <section className="stack" aria-labelledby="mine">
            <div className="section-head">
              <h2 id="mine">
                {mine.length} {mine.length === 1 ? "trial" : "trials"}
              </h2>
              <span className="dim">{ADDED_NOTE}</span>
            </div>
            {mine.map(card)}
          </section>
        </>
      )}
      {examples.length > 0 ? (
        <section className="stack" aria-labelledby="examples">
          <div className="section-head">
            <h2 id="examples">Built-in examples</h2>
            <span className="dim">{EXAMPLES_NOTE}</span>
          </div>
          {examples.map(card)}
        </section>
      ) : (
        <p className="dim footnote">
          The project's five built-in example trials are hidden. Start the app with{" "}
          <code>--examples</code> to include them.
        </p>
      )}
    </main>
  );
}

function AddForm({ onAdd }: { onAdd: (reference: string) => Promise<void> }) {
  const [reference, setReference] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onAdd(reference);
    setReference("");
  };
  return (
    <form className="card add-form" onSubmit={submit}>
      <label htmlFor="trial-ref">ClinicalTrials.gov link or NCT ID</label>
      <div className="add-row">
        <input
          id="trial-ref"
          type="text"
          placeholder="https://clinicaltrials.gov/study/NCT…"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <button type="submit" disabled={reference.trim() === ""}>
          Add trial
        </button>
      </div>
      <p className="help">
        Paste the study's page address, or just its ID, like NCT06557512. The app fetches it from
        ClinicalTrials.gov.
      </p>
    </form>
  );
}

function TrialCard(props: {
  row: TrialRow;
  now: number;
  onStart: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const { row, now } = props;
  const [confirming, setConfirming] = useState(false);
  const badge = badgeWords(row);
  const busy = pending(row);
  const usable = row.criteria !== null && !busy;
  const settle = settleWords(row.byType);
  const dropped = droppedWords(row.dropped);
  const readBy = readByWords(row.readBy);

  return (
    <article className="card trial-card" aria-label={`${row.nctId} ${row.briefTitle ?? ""}`}>
      <div className="trial-main">
        <div className="trial-tags">
          {busy ? (
            <output className="badge accent">
              <span className="spinner" aria-hidden="true" />
              {pendingWords(
                row.state,
                row.since === null ? 0 : (now - Date.parse(row.since)) / 1000,
              )}
            </output>
          ) : (
            <span className={`badge ${badge.tone}`}>{badge.text}</span>
          )}
          <a
            className="id"
            href={`https://clinicaltrials.gov/study/${row.nctId}`}
            target="_blank"
            rel="noreferrer"
          >
            {row.nctId}
          </a>
        </div>
        {row.briefTitle !== null && <h3>{row.briefTitle}</h3>}
        {row.conditions.length > 0 && (
          <ul className="chips">
            {row.conditions.slice(0, 3).map((c) => (
              <li key={c}>{c}</li>
            ))}
            {row.conditions.length > 3 && <li>+{row.conditions.length - 3} more</li>}
          </ul>
        )}
        {settle !== null && <p className="dim">{settle}</p>}
        {readBy !== undefined && <p className="dim">{readBy}</p>}
        {dropped !== undefined && <p className="warn-text">{dropped}</p>}
        {row.problem !== null && <p className="error trial-problem">{row.problem}</p>}
      </div>
      {(usable || (row.origin === "added" && !busy)) && (
        <div className="trial-actions">
          {usable && (
            <>
              <button type="button" onClick={props.onStart}>
                Start screening
              </button>
              <a className="button secondary" href={trialHash(row.nctId)}>
                See the checklist
              </a>
            </>
          )}
          {row.origin === "added" &&
            !busy &&
            (confirming ? (
              <div className="confirm">
                <span>Remove {row.nctId}?</span>
                <button type="button" className="danger" onClick={props.onRemove}>
                  Remove
                </button>
                <button type="button" className="quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="quiet-row">
                <button type="button" className="quiet" onClick={props.onRefresh}>
                  {row.criteria === null ? "Try again" : "Refresh"}
                </button>
                <button type="button" className="destructive" onClick={() => setConfirming(true)}>
                  Remove…
                </button>
              </div>
            ))}
        </div>
      )}
    </article>
  );
}
