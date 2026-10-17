import { useEffect, useState } from "react";
import type { ConversationSummary } from "../server/conversations.js";
import {
  deleteConversation,
  getStudies,
  listConversations,
  type StudySummary,
  startConversation,
} from "./api.js";
import { ADDED_MARK, NO_TRIALS } from "./logic.js";
import { ScreeningRow } from "./ScreeningRow.js";

/**
 * Screenings (slice 0014): start one against a ready trial, or continue one
 * in progress. Finished ones are on Reviews.
 */
export function ScreeningsPage() {
  const [studies, setStudies] = useState<StudySummary[] | undefined>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<string | undefined>();

  const loadConversations = () => listConversations().then(setConversations, () => {});

  useEffect(() => {
    getStudies().then(setStudies, (e: unknown) => setError(String(e)));
    void listConversations().then(setConversations, () => {});
  }, []);

  const remove = async (id: string) => {
    setError(undefined);
    try {
      await deleteConversation(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await loadConversations();
  };

  const start = async (nctId: string) => {
    try {
      window.location.hash = `#/c/${await startConversation(nctId)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const inProgress = conversations.filter((c) => c.origin === "conversation" && !c.done);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Screenings</h1>
        <p className="sub">
          Play a person considering a trial: the AI asks one question at a time.{" "}
          <strong>Use made-up answers only.</strong>
        </p>
      </div>
      {error !== undefined && <p className="error">{error}</p>}

      <section className="stack" aria-labelledby="start-h">
        <h2 id="start-h">Start a screening</h2>
        {studies !== undefined && studies.length === 0 && (
          <p className="dim">
            <a href="#/">{NO_TRIALS}</a>
          </p>
        )}
        <ul className="grid">
          {(studies ?? []).map((s) => (
            <li key={s.nctId} className="card study-card">
              <span className="id">{s.nctId}</span>
              <span className="study-title">{s.briefTitle}</span>
              <span className="dim">
                {s.criteria} criteria{s.origin === "added" ? ` · ${ADDED_MARK}` : ""}
              </span>
              <button type="button" onClick={() => start(s.nctId)}>
                Start
              </button>
            </li>
          ))}
        </ul>
      </section>

      {inProgress.length > 0 && (
        <section className="stack" aria-labelledby="progress-h">
          <h2 id="progress-h">In progress</h2>
          <ul className="rows-list">
            {inProgress.map((c) => (
              <ScreeningRow
                key={c.id}
                conversation={c}
                title={c.title}
                onDelete={() => remove(c.id)}
              >
                <a className="button secondary" href={`#/c/${c.id}`}>
                  Continue
                </a>
              </ScreeningRow>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
