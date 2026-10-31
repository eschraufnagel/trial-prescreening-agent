import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ChannelView } from "../transport/ledger.js";
import { sendAgain, sendMessage } from "../transport/web/client.js";
import {
  canSubmit,
  charsLeft,
  composerFor,
  hostedHint,
  questionCount,
  retryText,
  showCommand,
  submitLabel,
  waitingText,
} from "./logic.js";

/** The conversation as a participant would see it: messages, and whether they were taken. */
export function ParticipantPane(props: {
  id: string;
  view: ChannelView | undefined;
  onSent: () => Promise<void>;
  /** The hosted provider this screening runs on (slice 0017), so the hint says where answers go. */
  hosted: { name: string; model: string } | null;
  /** Respond-then-ask turns so far, which don't move the question number (slice 0021). */
  responses: number;
}) {
  const { id, view, onSent } = props;
  const composer = composerFor(view);
  const [draft, setDraft] = useState("");
  const [refusal, setRefusal] = useState<string | undefined>();
  const since = useWorkingSince(composer.kind === "waiting");
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. The thread keeps itself at its end (the
  // stylesheet's column-reverse); this brings the composer into view where the
  // page scrolls instead, on a phone.
  const count = view?.messages.length ?? 0;
  useEffect(() => {
    if (count > 0) {
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [count]);

  // The question waiting for an answer gets the card (slice 0020); everything
  // before it, and anything once the agent is working, is an earlier turn.
  const messages = view?.messages ?? [];
  const last = messages.at(-1);
  const current = composer.kind === "send" && last?.from === "agent" ? last : undefined;
  const earlier = current === undefined ? messages : messages.slice(0, -1);

  // After a failure, the unprocessed message comes back into the box, editable.
  const failedText = composer.kind === "send-again" ? composer.text : undefined;
  useEffect(() => {
    if (failedText !== undefined && failedText !== "") {
      // Anything typed while waiting is kept, after the message to resend.
      setDraft((current) =>
        current.trim() === "" || current === failedText ? failedText : `${failedText}\n${current}`,
      );
    }
  }, [failedText]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit(composer, draft)) {
      return;
    }
    const text = draft.trim();
    if (composer.kind === "send-again" && composer.text === "") {
      // The opening failed: there is nothing to answer yet, so the box is left
      // as it is and only the opening is tried again.
      await sendAgain(id);
      await onSent();
      return;
    }
    // Cleared now, not when the request returns, or anything typed meanwhile
    // would be wiped. A refused message comes back into the box.
    setDraft("");
    const outcome =
      composer.kind === "send-again"
        ? await sendAgain(id, retryText(composer, draft))
        : await sendMessage(id, text);
    if (outcome.ok) {
      setRefusal(undefined);
    } else {
      setDraft((current) => (current.trim() === "" ? text : `${text}\n${current}`));
      setRefusal(
        outcome.error === "working"
          ? "The agent is still working on your last message. Your draft is kept."
          : `Not sent: ${outcome.error}.`,
      );
    }
    await onSent();
  };

  const left = charsLeft(draft);
  const canType = composer.kind === "send" || composer.kind === "send-again";

  return (
    <section className="participant">
      <div className="messages">
        <div className="messages-inner">
          {earlier.map((m) => (
            <div key={m.seq} className={`bubble from-${m.from} ${m.state ?? ""}`}>
              <div className="text">{m.text}</div>
              {m.from === "participant" && m.state !== "processed" && (
                <div className="state">{m.state === "pending" ? "sent" : "not processed"}</div>
              )}
            </div>
          ))}
          {composer.kind === "waiting" && (
            <div className="bubble from-agent waiting">{waitingText(since)}</div>
          )}
        </div>
      </div>

      {current !== undefined && (
        <div className="question-card">
          <span className="question-label">Question {questionCount(view, props.responses)}</span>
          <p className="question-text">{current.text}</p>
        </div>
      )}

      {composer.kind === "send-again" && (
        <p className={composer.modelDown ? "notice down" : "notice"}>{composer.detail}</p>
      )}
      {refusal !== undefined && <p className="notice">{refusal}</p>}

      {composer.kind === "finished" ? (
        <div className="finished">
          <p>This conversation is finished. A coordinator would review it from here.</p>
          <p className="dim">
            To see it beside its findings: <code>{showCommand(id)}</code>
          </p>
        </div>
      ) : (
        <form className="composer" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                void submit(e);
              }
            }}
            placeholder={canType ? "Type your answer" : "Waiting for the agent…"}
            rows={2}
          />
          <div className="composer-row">
            <span className="hint">{hostedHint({ hosted: props.hosted })}</span>
            <span className={left < 0 ? "count over" : "count"}>{left}</span>
            <button type="submit" disabled={!canSubmit(composer, draft)}>
              {submitLabel(composer)}
            </button>
          </div>
        </form>
      )}
      <div ref={end} />
    </section>
  );
}

/** Seconds since the agent started working, ticking once a second. */
function useWorkingSince(working: boolean): number {
  const [start, setStart] = useState<number | undefined>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!working) {
      setStart(undefined);
      return;
    }
    setStart(Date.now());
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [working]);
  return start === undefined ? 0 : (now - start) / 1000;
}
