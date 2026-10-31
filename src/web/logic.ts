import type { CriterionType } from "../criteria/types.js";
import type { PlainDisplay } from "../plain/types.js";
import type { FindingStatus, Progress, ScreeningCriterion } from "../screening/types.js";
import type { ConversationInspection, TrialRow, TrialState } from "../server/types.js";
import type { ChannelView } from "../transport/ledger.js";
import { MAX_MESSAGE_CHARS } from "../transport/rules.js";

/**
 * The page's decisions, as plain functions (spec §7.4). Components only lay
 * out what these return, which is what lets the page be tested in Node with
 * no DOM. Nothing here imports React or touches the browser.
 */

export { MAX_MESSAGE_CHARS };

/** What the box under the conversation should offer. */
export type Composer =
  | { kind: "loading" }
  | { kind: "send" }
  | { kind: "waiting" }
  /** The last message was not processed; offer it again, editable. */
  | { kind: "send-again"; text: string; detail: string; modelDown: boolean }
  | { kind: "finished" };

export function composerFor(view: ChannelView | undefined): Composer {
  if (view === undefined) {
    return { kind: "loading" };
  }
  switch (view.status) {
    case "idle":
      return { kind: "send" };
    case "working":
      return { kind: "waiting" };
    case "done":
      return { kind: "finished" };
    case "unavailable":
    case "failed": {
      const last = view.messages.at(-1);
      return {
        kind: "send-again",
        text: last?.from === "participant" ? last.text : "",
        detail: view.detail ?? "The last message was not processed.",
        modelDown: view.status === "unavailable",
      };
    }
  }
}

export function waitingText(seconds: number): string {
  return `Thinking… ${Math.max(0, Math.floor(seconds))} s`;
}

/**
 * Whether the button can be pressed. After a failed opening there is no
 * message to send again, so "Try again" works with an empty box.
 */
export function canSubmit(composer: Composer, draft: string): boolean {
  if (charsLeft(draft) < 0) {
    return false;
  }
  if (composer.kind === "send") {
    return draft.trim() !== "";
  }
  if (composer.kind === "send-again") {
    return draft.trim() !== "" || composer.text === "";
  }
  return false;
}

/**
 * The text to send with "try again": none when the opening is what failed
 * (there is no question to answer yet, whatever is in the box) or when the
 * unprocessed message is unchanged; the edited text otherwise.
 */
export function retryText(
  composer: Extract<Composer, { kind: "send-again" }>,
  draft: string,
): string | undefined {
  const text = draft.trim();
  return composer.text === "" || text === "" || text === composer.text ? undefined : text;
}

export function submitLabel(composer: Composer): string {
  if (composer.kind !== "send-again") {
    return "Send";
  }
  return composer.text === "" ? "Try again" : "Send again";
}

/** How to see a finished conversation beside its findings, from the saved file. */
export function showCommand(conversationId: string): string {
  return `npm run screening:show -- chats/${conversationId}.json --html`;
}

/** Characters left, or a negative number once over the cap. */
export function charsLeft(text: string): number {
  return MAX_MESSAGE_CHARS - text.trim().length;
}

/** Whether a poll brought anything new, so the tester panel should refetch. */
export function viewChanged(before: ChannelView | undefined, after: ChannelView): boolean {
  if (before === undefined) {
    return true;
  }
  const last = (v: ChannelView) => {
    const m = v.messages.at(-1);
    return `${m?.seq ?? -1}:${m?.state ?? ""}`;
  };
  return (
    before.status !== after.status ||
    before.messages.length !== after.messages.length ||
    last(before) !== last(after)
  );
}

/** 0004's display words for a finding, and "open" for one not yet reached. */
export const STATUS_WORDS: Record<FindingStatus | "open", string> = {
  open: "open",
  holds: "holds",
  "does-not-hold": "does not hold",
  unresolved: "unresolved",
  "chart-review": "needs chart review",
  "not-raised": "not raised",
};

export interface Row {
  criterion: ScreeningCriterion;
  /** Its plain-language rendering, or undefined when none is served (parsed criteria). */
  plain: PlainDisplay | undefined;
  status: FindingStatus | "open";
  words: string;
  reason: string | null;
  reported: string | undefined;
  timesAsked: number;
  evidence: Array<{ turn: number; quote: string }>;
  /** The question now waiting for a reply is about this criterion. */
  awaiting: boolean;
  /** Its progress changed on the last turn that changed anything. */
  changed: boolean;
}

function fingerprint(p: Progress): string {
  return JSON.stringify([p.status, p.reason, p.reported ?? null, p.evidence.length, p.timesAsked]);
}

/**
 * Criteria whose progress differs between two readings. When nothing differs
 * (a refetch while the agent is still thinking), the previous marks stand, so
 * the last real change stays visible until the next one.
 */
export function changedIds(
  before: ConversationInspection | undefined,
  after: ConversationInspection,
  previous: ReadonlySet<string>,
): Set<string> {
  if (before === undefined || before.id !== after.id) {
    return new Set();
  }
  const old = new Map(before.progress.map((p) => [p.criterionId, fingerprint(p)]));
  const changed = new Set(
    after.progress
      .filter((p) => old.get(p.criterionId) !== fingerprint(p))
      .map((p) => p.criterionId),
  );
  return changed.size === 0 ? new Set(previous) : changed;
}

/** One row per criterion, in the order the agent works: document order. No totals. */
export function rows(inspection: ConversationInspection, changed: ReadonlySet<string>): Row[] {
  const progress = new Map(inspection.progress.map((p) => [p.criterionId, p]));
  return inspection.criteria.map((criterion) => {
    const p = progress.get(criterion.id);
    const status = p?.status ?? "open";
    return {
      criterion,
      plain: inspection.plain[criterion.id],
      status,
      words: STATUS_WORDS[status],
      reason: p?.reason ?? null,
      reported: p?.reported,
      timesAsked: p?.timesAsked ?? 0,
      evidence: (p?.evidence ?? []).map((e) => ({ turn: e.turn, quote: e.quote })),
      awaiting: inspection.pending === criterion.id && !inspection.done,
      changed: changed.has(criterion.id),
    };
  });
}

/** What `CriterionText` shows under the protocol words (0006 spec §7.2). */
export interface PlainView {
  label: string;
  /** A small tag beside the label: "retry" when the first attempt was refused. */
  tag: string | null;
  /** The rendering, when there is one to show. */
  text: string | null;
  /** Why there is none, when there is none. */
  lines: string[];
}

/**
 * Who is reading. The tester sees the check's reasons, which help test the
 * renderings; the coordinator sees only that there is no plain version and
 * which kind of absence it is (0007 spec §7), so nothing is hidden.
 */
export type Audience = "tester" | "coordinator";

/** Null when nothing is served for this criterion: the protocol words stand alone. */
export function plainView(
  plain: PlainDisplay | undefined,
  audience: Audience = "tester",
): PlainView | null {
  if (plain === undefined) {
    return null;
  }
  if (audience === "coordinator") {
    return coordinatorView(plain);
  }
  switch (plain.state) {
    case "shown":
      return {
        label: "Plain language",
        tag: plain.attempt === 2 ? "retry" : null,
        text: plain.text,
        lines: [],
      };
    case "failed":
      return {
        label: "No plain version: the check found",
        tag: null,
        text: null,
        lines: plain.problems,
      };
    case "stale":
      return {
        label: "No plain version",
        tag: null,
        text: null,
        lines: ["It was made from earlier wording of this criterion."],
      };
    case "missing":
      return { label: "No plain version", tag: null, text: null, lines: ["None has been made."] };
  }
}

function coordinatorView(plain: PlainDisplay): PlainView {
  const none = (line: string) => ({
    label: "No plain-language version",
    tag: null,
    text: null,
    lines: [line],
  });
  switch (plain.state) {
    case "shown":
      return { label: "Plain language", tag: null, text: plain.text, lines: [] };
    case "failed":
      return none("One was made but failed the check.");
    case "stale":
      return none("It was made from earlier wording.");
    case "missing":
      return none("None has been made.");
  }
}

/**
 * Where the page is, from the URL hash (slice 0014): Trials is home (`#/`,
 * `#/trials`), a trial's checklist is `#/t/<NCT ID>`, then `#/screenings`,
 * `#/reviews`, `#/c/<id>` and `#/review/<id>`.
 */
export type Route =
  | { page: "trials" }
  | { page: "trial"; nctId: string }
  | { page: "screenings" }
  | { page: "reviews" }
  | { page: "conversation"; id: string }
  | { page: "review"; id: string }
  | { page: "settings" };

const HOME: Route = { page: "trials" };

/**
 * A review id may be an eval run's (`eval NCT…-v1-labels`), so it arrives
 * URL-encoded. A malformed encoding is the home page, not an exception.
 */
export function routeFrom(hash: string): Route {
  if (hash === "#/screenings") {
    return { page: "screenings" };
  }
  if (hash === "#/reviews") {
    return { page: "reviews" };
  }
  if (hash === "#/settings") {
    return { page: "settings" };
  }
  const trial = /^#\/t\/(NCT\d{8})$/.exec(hash)?.[1];
  if (trial !== undefined) {
    return { page: "trial", nctId: trial };
  }
  const conversation = /^#\/c\/([A-Za-z0-9-]+)$/.exec(hash)?.[1];
  if (conversation !== undefined) {
    return { page: "conversation", id: conversation };
  }
  const review = /^#\/review\/([A-Za-z0-9%-]+)$/.exec(hash)?.[1];
  if (review !== undefined) {
    try {
      return { page: "review", id: decodeURIComponent(review) };
    } catch {
      return HOME;
    }
  }
  return HOME;
}

/** The hash that opens a conversation's review. */
export function reviewHash(id: string): string {
  return `#/review/${encodeURIComponent(id)}`;
}

/** The hash that opens a trial's checklist. */
export function trialHash(nctId: string): string {
  return `#/t/${nctId}`;
}

/** Which nav item a route sits under. */
export function navOf(route: Route): "trials" | "screenings" | "reviews" | "settings" {
  switch (route.page) {
    case "settings":
      return "settings";
    case "trials":
    case "trial":
      return "trials";
    case "screenings":
    case "conversation":
      return "screenings";
    case "reviews":
    case "review":
      return "reviews";
  }
}

/** The page's fixed words (slices 0013 and 0014), here so the browser test can read them. */
export const ADDED_NOTE =
  "Read by the AI from each trial's published rules, not checked by a person. " +
  "The parser was measured on five lung cancer trials only.";

export const STATE_WORDS: Record<TrialState, string> = {
  fetching: "Fetching from ClinicalTrials.gov",
  parsing: "Reading the rules on the local model (a minute or two, longer for a long protocol)",
  ready: "Ready",
  failed: "Couldn't add",
};

export const PINNED_WORDS = "Built-in example";
export const FIRST_RUN_HEADING = "Add your first trial";
export const EXAMPLES_NOTE =
  "The project's own test trials. They come with the app and can't be removed.";
export const CHECKLIST_NOTE =
  "This checklist was read from the trial's published rules by the AI and hasn't been checked " +
  "by a person. The AI asks about the rules a person can answer, and leaves the rest for their " +
  "medical records.";

/** What Screenings says before any trial is added. */
export const NO_TRIALS = "No trials yet. Add one on the Trials page.";

/** A trial card's status badge: its words, and a tone that styles it. */
export function badgeWords(row: Pick<TrialRow, "origin" | "state" | "criteria">): {
  text: string;
  tone: "accent" | "ok" | "down" | "neutral";
} {
  if (row.origin === "pinned") {
    return { text: PINNED_WORDS, tone: "neutral" };
  }
  switch (row.state) {
    case "fetching":
      return { text: "Fetching", tone: "accent" };
    case "parsing":
      return { text: "Reading the rules", tone: "accent" };
    case "ready":
      return { text: `Ready · ${row.criteria ?? 0} criteria`, tone: "ok" };
    case "failed":
      return row.criteria === null
        ? { text: STATE_WORDS.failed, tone: "down" }
        : { text: `Ready · ${row.criteria} criteria`, tone: "ok" };
  }
}

/** Who can settle a criterion of each type, as the checklist tags it. */
export function typeTag(type: CriterionType): string {
  switch (type) {
    case "patient":
      return "Person answers";
    case "clinical":
      return "Records";
    case "protocol":
      return "For the study site";
    case "definitional":
      return "Definition";
  }
}

/** One line on who can settle a trial's rules, from its counts by type. Null with none. */
export function settleWords(byType: Record<CriterionType, number> | null): string | null {
  if (byType === null) {
    return null;
  }
  const parts = [
    `${byType.patient} the person can answer`,
    `${byType.clinical} need medical records`,
  ];
  const site = byType.protocol + byType.definitional;
  if (site > 0) {
    parts.push(`${site} for the study site`);
  }
  return parts.join(" · ");
}

/**
 * How many questions the agent has asked: its messages, the last of which may
 * close, less its respond-then-ask turns (slice 0021). An explanation repeats
 * the question it explains, so the number stays on that question.
 */
export function questionCount(
  view: Pick<ChannelView, "messages"> | undefined,
  responses = 0,
): number {
  return Math.max(0, (view?.messages.filter((m) => m.from === "agent").length ?? 0) - responses);
}

/** Respond-then-ask turns so far, from the tester panel's progress (slice 0021). */
export function responsesIn(progress: readonly Progress[] | undefined): number {
  return (progress ?? []).reduce((n, p) => n + (p.responses ?? 0), 0);
}

/**
 * A fetching or parsing row's status with how long it has run, so the screen
 * shows the job is alive (slice 0013, after the owner's first real add).
 */
export function pendingWords(state: TrialState, seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const time = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${STATE_WORDS[state]} · ${time}`;
}

/** After an added trial's details on Screenings: its checklist wasn't checked. */
export const ADDED_MARK = "read by the AI, not verified";

/**
 * What a trial's parse left out, said on its row (slice 0013's gate). A long,
 * nested protocol can lose criteria whose quote the parser stitched together,
 * and without this the row would look complete. Undefined when nothing was.
 */
export function droppedWords(
  dropped: { rejected: number; unclaimed: number } | null,
): string | undefined {
  if (dropped === null || (dropped.rejected === 0 && dropped.unclaimed === 0)) {
    return undefined;
  }
  const parts: string[] = [];
  if (dropped.rejected > 0) {
    parts.push(
      dropped.rejected === 1
        ? "1 criterion couldn't be matched to the protocol text and was left out"
        : `${dropped.rejected} criteria couldn't be matched to the protocol text and were left out`,
    );
  }
  if (dropped.unclaimed > 0) {
    parts.push(
      dropped.unclaimed === 1
        ? "1 passage wasn't read"
        : `${dropped.unclaimed} passages weren't read`,
    );
  }
  return `${parts.join("; ")}. The agent won't ask about them.`;
}

/**
 * A screening's readable name (slice 0014): its trial and when it started,
 * from the time in its id (`<NCT ID>-<yyyymmddThhmmss>`, UTC), shown in local
 * time. Nothing personal: the app makes it, and nobody types a name.
 */
export function screeningLabel(
  id: string,
  title: string | undefined,
  now: Date = new Date(),
): string {
  const m = /-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(id);
  const name = title ?? id.replace(/-.*$/, "");
  if (m === null) {
    return name;
  }
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  const at = new Date(Date.UTC(y as number, (mo as number) - 1, d, h, mi, s));
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toDateString() === now.toDateString();
  const day = sameDay
    ? "today"
    : at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${name} · ${day} ${time}`;
}

/**
 * An example conversation's readable name (slice 0016), from its id in the
 * committed eval run (`eval <NCT ID>-v<n>-<labels|parse>`): which written
 * patient description played it, and where its rules came from. Display only:
 * the id stays the key everywhere. Any other id comes back as it is.
 */
export function exampleLabel(id: string): string {
  const m = /^eval NCT\d{8}-v(\d+)-(labels|parse)$/.exec(id);
  if (m === null) {
    return id;
  }
  const source = m[2] === "labels" ? "rules checked by hand" : "rules read by the AI";
  return `Simulated patient ${m[1]} · ${source}`;
}

/**
 * The order of examples under one trial on Reviews (slice 0016): those whose
 * rules were checked by hand first, then those read by the AI, each by
 * simulated patient. It reads only the id, never how a conversation went.
 */
export function exampleOrder(a: string, b: string): number {
  const key = (id: string): [number, number] => {
    const m = /-v(\d+)-(labels|parse)$/.exec(id);
    return m === null ? [2, 0] : [m[2] === "labels" ? 0 : 1, Number(m[1])];
  };
  const [sa, va] = key(a);
  const [sb, vb] = key(b);
  return sa - sb || va - vb;
}

/** What `/api/info` says about the model, as the page's words need it (slice 0017). */
export interface ModelInfo {
  mode: "local-model" | "scripted";
  model: { model: string };
  hosted: { name: string; model: string } | null;
}

/** The header's badge: which model is answering. */
export function modelLine(info: ModelInfo): string {
  if (info.mode === "scripted") {
    return "Scripted agent · no model";
  }
  return info.hosted === null
    ? `Local model · ${info.model.model}`
    : `${info.hosted.name} · ${info.hosted.model}`;
}

/** Above the composer: where a person's answers go. */
export function hostedHint(info: Pick<ModelInfo, "hosted"> | undefined): string {
  return info?.hosted
    ? `Your answers are sent to ${info.hosted.name}. Use made-up answers only.`
    : "Use made-up answers only. This is a test system.";
}

/** Dollars as Settings and a screening show them. */
export function dollars(usd: number): string {
  return usd > 0 && usd < 0.01 ? "under 1¢" : `$${usd.toFixed(2)}`;
}

/** Whether a model's estimated screening costs more than the cap allows. */
export function overCap(estimateUsd: number | undefined, capUsd: number): boolean {
  return estimateUsd !== undefined && estimateUsd > capUsd;
}

export const NOT_TESTED = "Not yet tested against the live API";
export const UNMEASURED_HOSTED = "Unmeasured: the agent was measured on the local model only.";
export const SETTINGS_NOTE =
  "Keys are kept on this computer in local/settings.json, which isn't part of the repository. " +
  "A hosted provider receives everything typed in a screening, so use made-up answers only.";
export const SCRIPTED_SETTINGS =
  "Fake mode: settings are saved, but the scripted agent answers, and Test makes no call.";

/** A trial card's line when a hosted model read its rules (slice 0017). */
export function readByWords(readBy: TrialRow["readBy"]): string | undefined {
  return readBy?.hosted ? `Read by ${readBy.hosted} · ${readBy.model}` : undefined;
}

export const SET_UP_MODEL = "No model is set up yet.";
