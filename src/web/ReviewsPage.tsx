import { useEffect, useState } from "react";
import type { ConversationSummary } from "../server/conversations.js";
import { deleteConversation, listConversations } from "./api.js";
import { exampleOrder, reviewHash } from "./logic.js";
import { ScreeningRow } from "./ScreeningRow.js";

/**
 * Reviews (slice 0014): finished conversations, each opening the coordinator
 * review. With `--examples`, the committed eval run's conversations too.
 */
export function ReviewsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = () =>
    listConversations().then(setConversations, (e: unknown) => setError(String(e)));

  useEffect(() => {
    void listConversations().then(setConversations, (e: unknown) => setError(String(e)));
  }, []);

  const remove = async (id: string) => {
    setError(undefined);
    try {
      await deleteConversation(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await load();
  };

  const finished = (conversations ?? []).filter((c) => c.origin === "conversation" && c.done);
  const evalRun = (conversations ?? []).filter((c) => c.origin === "eval-run");
  // Examples under their trial, trials in the order the run lists them (slice 0016).
  const byTrial = new Map<string, ConversationSummary[]>();
  for (const c of evalRun) {
    byTrial.set(c.nctId, [...(byTrial.get(c.nctId) ?? []), c]);
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Reviews</h1>
        <p className="sub">
          A finished screening goes to a coordinator as a review: each rule beside the person's own
          words. The coordinator decides, not the AI.
        </p>
      </div>
      {error !== undefined && <p className="error">{error}</p>}

      <section className="stack" aria-labelledby="finished-h">
        <h2 id="finished-h">Finished</h2>
        {conversations !== undefined && finished.length === 0 && (
          <p className="card dim">
            Nothing finished yet. <a href="#/screenings">Start a screening</a>.
          </p>
        )}
        <ul className="rows-list">
          {finished.map((c) => (
            <ScreeningRow key={c.id} conversation={c} title={c.title} onDelete={() => remove(c.id)}>
              <a className="button secondary" href={`#/c/${c.id}`}>
                View conversation
              </a>
              <a className="button" href={reviewHash(c.id)}>
                Open review
              </a>
            </ScreeningRow>
          ))}
        </ul>
      </section>

      {evalRun.length > 0 && (
        <section className="stack" aria-labelledby="eval-h">
          <h2 id="eval-h">Examples (simulated patients)</h2>
          <div className="example-groups">
            {[...byTrial].map(([nctId, examples]) => (
              <div key={nctId} className="example-trial">
                <h3>
                  <span className="id">{nctId}</span> {examples[0]?.title}
                </h3>
                <ul className="rows-list">
                  {[...examples]
                    .sort((a, b) => exampleOrder(a.id, b.id))
                    .map((c) => (
                      <ScreeningRow key={c.id} conversation={c} title={c.title}>
                        <a className="button" href={reviewHash(c.id)}>
                          Open review
                        </a>
                      </ScreeningRow>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
