import type { AppChoice, LocalModels } from "../models/index.js";
import type { ModelDescriptor } from "../models/types.js";
import type { ConversationSummary } from "../server/conversations.js";
import type { ConnectionResult } from "../server/models.js";
import type { SettingsPatch, SettingsView } from "../server/settings.js";
import type {
  ConversationInspection,
  ConversationReview,
  CriteriaSource,
  StudyOrigin,
  TrialDetail,
  TrialRow,
} from "../server/types.js";

/**
 * What the start page and the tester panel read: the inspection routes, never
 * the participant's channel (that is `src/transport/web/client.ts`). Every
 * request is a path literal on this page's own origin; `tests/boundary.test.ts`
 * holds this file to that.
 */

export interface Info {
  mode: "local-model" | "scripted";
  model: ModelDescriptor;
  source: CriteriaSource;
  /** Whether the built-in example trials are served (slice 0013). */
  examples: boolean;
  /** The hosted provider answering, or null for the local model and the scripted agent (slice 0017). */
  hosted: { provider: string; name: string; model: string } | null;
  /** Whether a key exists for the chosen model. */
  ready: boolean;
}

export type { ConnectionResult, LocalModels, SettingsView };

export interface StudySummary {
  nctId: string;
  briefTitle: string;
  criteria: number;
  source: CriteriaSource;
  origin: StudyOrigin;
}

export type { TrialDetail, TrialRow };

async function body<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function getInfo(): Promise<Info> {
  return body(await fetch("/api/info"));
}

export async function getStudies(): Promise<StudySummary[]> {
  return body(await fetch("/api/studies"));
}

export async function listConversations(): Promise<ConversationSummary[]> {
  return body(await fetch("/api/conversations"));
}

export async function startConversation(nctId: string): Promise<string> {
  const started = await body<{ id: string }>(
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nctId }),
    }),
  );
  return started.id;
}

/** The Trials screen's rows (slice 0013). */
export async function listTrials(): Promise<TrialRow[]> {
  return body(await fetch("/api/trials"));
}

/** A trial's checklist page (slice 0014), or undefined if no such trial is listed. */
export async function getTrialDetail(nctId: string): Promise<TrialDetail | undefined> {
  const response = await fetch(`/api/trials/${encodeURIComponent(nctId)}`);
  if (response.status === 404) {
    return undefined;
  }
  return body(response);
}

/** Adds a trial by link or ID, and returns its NCT ID. A refusal's reason is the error. */
export async function addTrial(reference: string): Promise<string> {
  const response = await fetch("/api/trials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reference }),
  });
  return ((await accepted(response)) as { nctId: string }).nctId;
}

export async function refreshTrial(nctId: string): Promise<void> {
  await accepted(
    await fetch(`/api/trials/${encodeURIComponent(nctId)}/refresh`, { method: "POST" }),
  );
}

export async function removeTrial(nctId: string): Promise<void> {
  await accepted(await fetch(`/api/trials/${encodeURIComponent(nctId)}`, { method: "DELETE" }));
}

/** The body of a 2xx answer, or the server's own reason for refusing. */
async function accepted(response: Response): Promise<unknown> {
  if (!response.ok) {
    const reason = await response.json().then(
      (b: { error?: unknown }) => (typeof b.error === "string" ? b.error : undefined),
      () => undefined,
    );
    throw new Error(reason ?? `${response.status} ${response.statusText}`);
  }
  return response.status === 204 ? undefined : response.json();
}

/** Deletes one of the person's own conversations (slice 0014). A refusal's reason is the error. */
export async function deleteConversation(conversationId: string): Promise<void> {
  await accepted(
    await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" }),
  );
}

export async function inspect(conversationId: string): Promise<ConversationInspection | undefined> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
  return response.ok ? ((await response.json()) as ConversationInspection) : undefined;
}

/** A finished conversation for the coordinator review, or why there is none yet. */
export type ReviewFetch =
  | { kind: "ok"; review: ConversationReview }
  | { kind: "unknown" }
  | { kind: "not-finished" }
  | { kind: "no-result" };

export async function getReview(conversationId: string): Promise<ReviewFetch> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/review`);
  if (response.ok) {
    return { kind: "ok", review: (await response.json()) as ConversationReview };
  }
  if (response.status === 409) {
    const { error } = (await response.json()) as { error: string };
    return { kind: error === "no-result" ? "no-result" : "not-finished" };
  }
  if (response.status === 404) {
    return { kind: "unknown" };
  }
  throw new Error(`${response.status} ${response.statusText}`);
}

const JSON_BODY = { "content-type": "application/json" };

/** Settings (slice 0017). The view never carries a key. */
export async function getSettings(): Promise<SettingsView> {
  return body(await fetch("/api/settings"));
}

export async function updateSettings(patch: SettingsPatch): Promise<SettingsView> {
  return (await accepted(
    await fetch("/api/settings", {
      method: "PUT",
      headers: JSON_BODY,
      body: JSON.stringify(patch),
    }),
  )) as SettingsView;
}

export async function saveKey(provider: AppChoice["provider"], key: string): Promise<SettingsView> {
  return (await accepted(
    await fetch(`/api/settings/keys/${provider}`, {
      method: "PUT",
      headers: JSON_BODY,
      body: JSON.stringify({ key }),
    }),
  )) as SettingsView;
}

export async function removeKey(provider: AppChoice["provider"]): Promise<SettingsView> {
  return (await accepted(
    await fetch(`/api/settings/keys/${provider}`, { method: "DELETE" }),
  )) as SettingsView;
}

export async function testConnection(choice: AppChoice): Promise<ConnectionResult> {
  return (await accepted(
    await fetch("/api/settings/test", {
      method: "POST",
      headers: JSON_BODY,
      body: JSON.stringify(choice),
    }),
  )) as ConnectionResult;
}

export async function getLocalModels(): Promise<LocalModels> {
  return body(await fetch("/api/settings/local-models"));
}
