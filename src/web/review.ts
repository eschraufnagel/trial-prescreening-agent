import { PROVIDER_NAMES, type Provider } from "../models/catalog.js";
import type { PlainDisplay } from "../plain/types.js";
import { locateEvidence } from "../screening/evidence.js";
import type {
  Finding,
  FindingReason,
  FindingStatus,
  ReadingValue,
  ReportedValue,
  RequestKind,
  ScreeningCriterion,
  ScreeningResult,
  Turn,
} from "../screening/types.js";
import type { ConversationReview } from "../server/types.js";
import { exampleLabel } from "./logic.js";

/**
 * The coordinator review, as plain functions (0007 spec §6). The page only
 * lays out what `reviewModel` returns, so everything it says can be tested in
 * Node, and where it stops can be tested at all.
 *
 * Everything here is one of three things (spec §3): fixed text, a count of one
 * group, or something about exactly one criterion. Groups are made from a
 * finding's status, never from which way it went, and rows keep protocol
 * order, so nothing outside a row's `finding` changes when a finding is
 * flipped. `tests/web/review.test.ts` flips every one and checks.
 *
 * Nothing here reads a criterion's text; `CriterionText` shows it.
 */

export type GroupKey = "settled" | "chart" | "unresolved" | "not-raised";

export interface Group {
  key: GroupKey;
  heading: string;
  /** What the coordinator does with the rows in it. */
  what: string;
  count: number;
  /** Criterion ids, in protocol order. */
  rows: string[];
}

export interface ReviewModel {
  frame: {
    nctId: string;
    /** The study's registry title. */
    title: string;
    id: string;
    /** What the header shows for the id: an example's readable name, or the id (slice 0016). */
    label: string;
    notes: string[];
    groups: Group[];
    footer: string[];
  };
  rows: Record<string, ReviewRow>;
  transcript: TranscriptLine[];
}

export interface ReviewRow {
  criterion: ScreeningCriterion;
  plain: PlainDisplay | undefined;
  polarity: "Inclusion" | "Exclusion";
  /** The only field whose words depend on which way the finding went. */
  finding: string;
  /** Unresolved and not-raised: why, in words. */
  reason: string | null;
  asked: number;
  exchanges: Exchange[];
  /** Readings for this criterion that were discarded or ignored, in words. */
  readings: string[];
}

export interface Mark {
  start: number;
  end: number;
  /** The agent's reading of the quote, in its own vocabulary. */
  reading: string;
}

export interface Exchange {
  /** The agent turn before the reply. Null when there is none. */
  question: { turn: number; text: string } | null;
  /** Null when the conversation ended before a reply. */
  reply: { turn: number; text: string; marks: Mark[] } | null;
}

export interface TranscriptLine {
  turn: number;
  speaker: "Agent" | "Participant";
  text: string;
  /** On a question: the criterion the agent raised. */
  raised: string | null;
  /** On a reply: what the person asked the agent for, in words (slice 0021). */
  asked: string | null;
  /** The rows that show this turn. */
  citedBy: string[];
}

/** Fixed words for what a participant asked for (slice 0021). Typed, so every kind has words. */
export const REQUEST_WORDS: Record<RequestKind, string> = {
  explain: "Asked what this means",
  why: "Asked why",
  study: "Asked about the study",
  stop: "Asked to stop",
};

const GROUPS: ReadonlyArray<{
  key: GroupKey;
  heading: string;
  what: string;
  statuses: FindingStatus[];
}> = [
  {
    key: "settled",
    heading: "Settled from the participant's words",
    what: "Check that the words say this.",
    statuses: ["holds", "does-not-hold"],
  },
  {
    key: "chart",
    heading: "Needs chart review",
    what: "Confirm in the medical record. What the participant reported is shown.",
    statuses: ["chart-review"],
  },
  {
    key: "unresolved",
    heading: "Unresolved",
    what: "Raised, not settled. Follow up or check the record.",
    statuses: ["unresolved"],
  },
  {
    key: "not-raised",
    heading: "Not raised in the conversation",
    what: "Not asked, by design. Check as usual.",
    statuses: ["not-raised"],
  },
];

export const HEADER_NOTE =
  "The agent's record of what the participant said, criterion by criterion. " +
  "It is not a decision. The coordinator decides.";
export const SCRIPTED_NOTE = "Scripted agent: not the real model.";
export const EVAL_RUN_NOTE =
  "An example from the project's test run. The patient was played by an AI from a written description, not by a person.";
/**
 * A review made on a hosted model (slice 0017). Every number the project
 * reports is from the local model, so the coordinator is told this one isn't.
 */
export function hostedNote(name: string, model: string): string {
  return `Made with ${name} · ${model}. The agent was measured on the local model only.`;
}

export const PARSE_NOTE =
  "The criteria came from the parser, not the labels. Some may be missing or mis-typed, " +
  "and a missing criterion isn't shown anywhere. These criteria have no plain-language versions.";

export function groupOf(status: FindingStatus): GroupKey {
  const group = GROUPS.find((g) => g.statuses.includes(status));
  return group?.key ?? "unresolved";
}

/** What `met` or `applies` means depends on the criterion's polarity, and on nothing else. */
function applied(polarity: ScreeningCriterion["polarity"], holds: boolean): string {
  if (polarity === "inclusion") {
    return holds ? "met" : "not met";
  }
  return holds ? "applies" : "does not apply";
}

function capitalized(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const REPORTED: Record<Exclude<ReportedValue, "holds" | "does-not-hold">, string> = {
  partial: "Participant reported part of it. Needs the record",
  unknown: "Participant didn't know. Needs the record",
  "does-not-apply": "Participant said it doesn't apply to them. Needs the record",
};

/** The finding with polarity applied, for this criterion only (spec §6.3). */
export function findingWords(
  polarity: ScreeningCriterion["polarity"],
  finding: Pick<Finding, "status" | "reported">,
): string {
  switch (finding.status) {
    case "holds":
    case "does-not-hold":
      return `${capitalized(applied(polarity, finding.status === "holds"))}, by the participant's account`;
    case "chart-review": {
      const reported = finding.reported;
      if (reported === "holds" || reported === "does-not-hold") {
        return `Participant reported: ${applied(polarity, reported === "holds")}. Needs the record`;
      }
      return REPORTED[reported ?? "unknown"];
    }
    case "unresolved":
      return "Not settled";
    case "not-raised":
      return "Not asked";
  }
}

const REASONS: Record<FindingReason, string | null> = {
  answered: null,
  partial: "answered part of it",
  unclear: "unclear answer",
  unknown: "didn't know",
  declined: "declined to say",
  "does-not-apply": "said it doesn't apply to them",
  contradicted: "contradicted themselves",
  "evidence-not-found": "the agent's quote wasn't in what they said",
  "no-answer": "the conversation ended before an answer",
  "lab-value": "a lab value",
  protocol: "a site or protocol requirement",
  definitional: "a definition",
};

export function reasonWords(reason: FindingReason): string | null {
  return REASONS[reason];
}

const READINGS: Record<ReadingValue, string> = {
  holds: "holds",
  "does-not-hold": "does not hold",
  partial: "partly holds",
  unclear: "unclear",
  unknown: "unknown",
  declined: "declined",
  "does-not-apply": "doesn't apply",
};

/** The agent's reading in its own vocabulary: about the statement, not the person. */
export function readingWords(reading: ReadingValue): string {
  return READINGS[reading];
}

/**
 * The questions and replies behind one criterion (spec §6.4): every question
 * the agent asked about it with the reply that followed, then any other reply
 * a reading for it cited, with the agent turn before that reply. In transcript
 * order, each reply once.
 */
export function exchangesFor(criterionId: string, result: ScreeningResult): Exchange[] {
  const turns = result.transcript;
  const byIndex = new Map(turns.map((t) => [t.index, t]));
  const evidence = result.findings.find((f) => f.criterionId === criterionId)?.evidence ?? [];

  const exchanges = new Map<string, Exchange>();
  const add = (question: Turn | undefined, reply: Turn | undefined) => {
    const key = reply === undefined ? `q${question?.index}` : `r${reply.index}`;
    if (exchanges.has(key)) {
      return;
    }
    exchanges.set(key, {
      question: question === undefined ? null : { turn: question.index, text: question.text },
      reply:
        reply === undefined
          ? null
          : {
              turn: reply.index,
              text: reply.text,
              marks: marksIn(reply, evidence),
            },
    });
  };

  for (const turn of turns) {
    if (turn.kind === "question" && turn.criterionId === criterionId) {
      const next = byIndex.get(turn.index + 1);
      add(turn, next?.speaker === "participant" ? next : undefined);
    }
  }

  const cited = [
    ...evidence.map((e) => e.turn),
    ...result.rejectedReadings.filter((r) => r.criterionId === criterionId).map((r) => r.turn),
    ...result.ignoredReadings.filter((r) => r.criterionId === criterionId).map((r) => r.turn),
  ];
  for (const index of cited) {
    const reply = byIndex.get(index);
    if (reply?.speaker === "participant") {
      const before = turns.filter((t) => t.index < index && t.speaker === "agent").at(-1);
      add(before, reply);
    }
  }

  const position = (e: Exchange) => e.reply?.turn ?? e.question?.turn ?? 0;
  return [...exchanges.values()].sort((a, b) => position(a) - position(b));
}

/**
 * The quotes the agent read in this reply, where they are. Located the way
 * the session located them when it accepted them. Overlapping quotes keep the
 * first, so the reply can be laid out as a run of segments.
 */
function marksIn(reply: Turn, evidence: Finding["evidence"]): Mark[] {
  const found = evidence
    .filter((e) => e.turn === reply.index)
    .flatMap((e) => {
      const at = locateEvidence(reply.text, e.quote);
      return at === undefined ? [] : [{ start: at.start, end: at.end, reading: e.reading }];
    })
    .sort((a, b) => a.start - b.start);
  const marks: Mark[] = [];
  for (const mark of found) {
    const last = marks.at(-1);
    if (last === undefined || mark.start >= last.end) {
      marks.push({ ...mark, reading: readingWords(mark.reading) });
    }
  }
  return marks;
}

/** A reply cut at its marks, for laying out. `start` is each piece's offset in the reply. */
export function segments(
  text: string,
  marks: readonly Mark[],
): Array<{ start: number; text: string; mark: Mark | null }> {
  const out: Array<{ start: number; text: string; mark: Mark | null }> = [];
  let at = 0;
  for (const mark of marks) {
    if (mark.start > at) {
      out.push({ start: at, text: text.slice(at, mark.start), mark: null });
    }
    out.push({ start: mark.start, text: text.slice(mark.start, mark.end), mark });
    at = mark.end;
  }
  if (at < text.length) {
    out.push({ start: at, text: text.slice(at), mark: null });
  }
  return out;
}

/** Readings about this criterion that did not count, and why (spec §6.4). */
export function readingLines(criterionId: string, result: ScreeningResult): string[] {
  const rejected = result.rejectedReadings
    .filter((r) => r.criterionId === criterionId)
    .map(
      (r) =>
        `At turn ${r.turn} the agent read "${r.quote}" as ${readingWords(r.reading)}, ` +
        "but those words weren't in the reply, so it was discarded.",
    );
  const ignored = result.ignoredReadings
    .filter((r) => r.criterionId === criterionId)
    .map((r) =>
      r.why === "already-settled"
        ? `At turn ${r.turn} the agent read this as ${readingWords(r.reading)} after it was settled. It was ignored.`
        : r.why === "asked-to-explain"
          ? `At turn ${r.turn} the person asked what the question meant, so the agent set aside what that reply said (${readingWords(r.reading)}) and asked again.`
          : `At turn ${r.turn} the agent read something about this criterion, which isn't asked in conversation. It was ignored.`,
    );
  return [...rejected, ...ignored];
}

function row(
  criterion: ScreeningCriterion,
  finding: Finding | undefined,
  review: ConversationReview,
): ReviewRow {
  const reason =
    finding === undefined
      ? "no finding was recorded"
      : finding.status === "unresolved" || finding.status === "not-raised"
        ? reasonWords(finding.reason)
        : null;
  return {
    criterion,
    plain: review.plain[criterion.id],
    polarity: criterion.polarity === "inclusion" ? "Inclusion" : "Exclusion",
    finding: finding === undefined ? "Not settled" : findingWords(criterion.polarity, finding),
    reason,
    asked: finding?.timesAsked ?? 0,
    exchanges: exchangesFor(criterion.id, review.result),
    readings: readingLines(criterion.id, review.result),
  };
}

function footer(result: ScreeningResult): string[] {
  const { run } = result;
  const unplaced = result.ignoredReadings.filter((r) => r.why === "unknown-criterion").length;
  return [
    `${run.model} (${run.quantization}), temperature ${run.temperature}, ` +
      `seed ${run.seed ?? "none"}, reasoning ${run.thinking === "off" ? "off" : "runtime default"}`,
    `Adapter ${run.adapter}, prompt ${run.promptVersion}, finished ${run.timestamp}`,
    `${result.calls} model calls. ${unplaced} readings named no criterion in this study.`,
  ];
}

export function reviewModel(review: ConversationReview): ReviewModel {
  const { result, criteria } = review;
  const findings = new Map(result.findings.map((f) => [f.criterionId, f]));
  const rows = Object.fromEntries(
    criteria.map((c) => [c.id, row(c, findings.get(c.id), review)] as const),
  );

  const groups = GROUPS.map(({ key, heading, what }) => {
    const ids = criteria
      .filter((c) => groupOf(findings.get(c.id)?.status ?? "unresolved") === key)
      .map((c) => c.id);
    return { key, heading, what, count: ids.length, rows: ids };
  });

  const notes = [HEADER_NOTE];
  if (result.run.adapter === "fake") {
    notes.push(SCRIPTED_NOTE);
  }
  if (review.origin === "eval-run") {
    notes.push(EVAL_RUN_NOTE);
  }
  const hosted = PROVIDER_NAMES[result.run.adapter as Provider];
  if (hosted !== undefined) {
    notes.push(hostedNote(hosted, result.run.model));
  }
  if (review.source === "parse") {
    notes.push(PARSE_NOTE);
  }

  const citedBy = new Map<number, string[]>();
  for (const c of criteria) {
    const turns = new Set(
      (rows[c.id]?.exchanges ?? []).flatMap((e) => [e.question?.turn, e.reply?.turn]),
    );
    for (const turn of turns) {
      if (turn !== undefined) {
        citedBy.set(turn, [...(citedBy.get(turn) ?? []), c.id]);
      }
    }
  }

  return {
    frame: {
      nctId: result.study.nctId,
      title: result.study.briefTitle,
      id: review.id,
      label: review.origin === "eval-run" ? exampleLabel(review.id) : review.id,
      notes,
      groups,
      footer: footer(result),
    },
    rows,
    transcript: result.transcript.map((t) => ({
      turn: t.index,
      speaker: t.speaker === "agent" ? "Agent" : "Participant",
      text: t.text,
      raised: t.kind === "question" ? (t.criterionId ?? null) : null,
      asked: t.request === undefined ? null : REQUEST_WORDS[t.request.kind],
      citedBy: citedBy.get(t.index) ?? [],
    })),
  };
}
