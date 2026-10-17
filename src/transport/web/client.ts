import type { ChannelView } from "../ledger.js";

/**
 * The browser half of the web transport: what the participant pane uses to
 * send and to see the conversation. Every request is to this page's own
 * origin, by a path literal starting with `/`, and `tests/boundary.test.ts`
 * holds every `fetch` here to that. So the path is never passed around in a
 * variable, even where a helper would be shorter.
 */

export type SendOutcome = { ok: true } | { ok: false; status: number; error: string };

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function outcome(response: Response): Promise<SendOutcome> {
  if (response.ok) {
    return { ok: true };
  }
  const detail = (await response.json().catch(() => ({}))) as { error?: unknown };
  return {
    ok: false,
    status: response.status,
    error: typeof detail.error === "string" ? detail.error : "unknown",
  };
}

export async function sendMessage(conversationId: string, text: string): Promise<SendOutcome> {
  const id = encodeURIComponent(conversationId);
  return outcome(await fetch(`/api/conversations/${id}/messages`, json({ text })));
}

/** Resends the unprocessed message, or `text` in its place. */
export async function sendAgain(conversationId: string, text?: string): Promise<SendOutcome> {
  const id = encodeURIComponent(conversationId);
  return outcome(
    await fetch(`/api/conversations/${id}/retry`, json(text === undefined ? {} : { text })),
  );
}

/** The whole conversation as the participant sees it, and where it stands. */
export async function poll(conversationId: string): Promise<ChannelView | undefined> {
  const id = encodeURIComponent(conversationId);
  const response = await fetch(`/api/conversations/${id}/messages`);
  return response.ok ? ((await response.json()) as ChannelView) : undefined;
}
