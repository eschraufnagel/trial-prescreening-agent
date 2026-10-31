import { useCallback, useEffect, useRef, useState } from "react";
import { REASSURANCE } from "../screening/templates.js";
import type { ConversationInspection } from "../server/types.js";
import type { ChannelView } from "../transport/ledger.js";
import { poll } from "../transport/web/client.js";
import { inspect } from "./api.js";
import {
  changedIds,
  dollars,
  questionCount,
  reviewHash,
  UNMEASURED_HOSTED,
  viewChanged,
} from "./logic.js";
import { ParticipantPane } from "./ParticipantPane.js";
import { TesterPanel } from "./TesterPanel.js";

const POLL_MS = 1000;

/**
 * The conversation beside the tester panel. The participant pane learns about
 * replies by polling its channel once a second while the agent is working; the
 * tester panel refetches only when a poll brings something new.
 */
export function ConversationView({ id }: { id: string }) {
  const [view, setView] = useState<ChannelView | undefined>();
  const [missing, setMissing] = useState(false);
  const [inspection, setInspection] = useState<ConversationInspection | undefined>();
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const viewRef = useRef<ChannelView | undefined>(undefined);
  const inspectionRef = useRef<ConversationInspection | undefined>(undefined);

  const refresh = useCallback(async () => {
    const next = await poll(id).catch(() => undefined);
    if (next === undefined) {
      setMissing(viewRef.current === undefined);
      return;
    }
    const before = viewRef.current;
    viewRef.current = next;
    setView(next);
    if (viewChanged(before, next)) {
      const seen = await inspect(id).catch(() => undefined);
      if (seen !== undefined) {
        setChanged((previous) => changedIds(inspectionRef.current, seen, previous));
        inspectionRef.current = seen;
        setInspection(seen);
      }
    }
  }, [id]);

  useEffect(() => {
    viewRef.current = undefined;
    inspectionRef.current = undefined;
    setView(undefined);
    setInspection(undefined);
    setChanged(new Set());
    setMissing(false);
    void refresh();
  }, [refresh]);

  const working = view === undefined || view.status === "working";
  useEffect(() => {
    if (!working) {
      const onFocus = () => void refresh();
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [working, refresh]);

  if (missing) {
    return (
      <main className="page">
        <p className="error">
          No conversation {id} on this server. <a href="#/screenings">Start one</a>.
        </p>
      </main>
    );
  }

  const done = inspection?.done === true;
  const asked = questionCount(view);

  return (
    <main className="conversation">
      <div className="conversation-main">
        <header className="conversation-head">
          <div className="conversation-trial">
            <span className="dim">
              <span className="id">{inspection?.study.nctId ?? ""}</span>
              {inspection?.hosted && (
                <>
                  {" "}
                  · {inspection.hosted.name} · {inspection.hosted.model}
                </>
              )}
            </span>
            <h1>{inspection?.study.briefTitle ?? "Loading…"}</h1>
            {/* The agent's own opening line, repeated where it stays in view (slice 0020). */}
            <p className="conversation-reassure">{REASSURANCE}</p>
            {/* Slice 0017: what the measurement doesn't cover. */}
            {inspection?.hosted && <span className="help warn">{UNMEASURED_HOSTED}</span>}
          </div>
          {done ? (
            <a className="button" href={reviewHash(id)}>
              Open the coordinator review
            </a>
          ) : (
            (asked > 0 || inspection?.spent) && (
              <span className="conversation-count">
                {asked > 0 && <>Question {asked}</>}
                {inspection?.spent && (
                  <>
                    {asked > 0 && " · "}
                    {dollars(inspection.spent.usd)} so far · limit{" "}
                    {dollars(inspection.spent.capUsd)}
                  </>
                )}
              </span>
            )
          )}
        </header>
        <ParticipantPane id={id} view={view} onSent={refresh} hosted={inspection?.hosted ?? null} />
      </div>
      <aside className="conversation-aside">
        <TesterPanel inspection={inspection} changed={changed} />
      </aside>
    </main>
  );
}
