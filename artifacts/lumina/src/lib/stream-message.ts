const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Client copy for a send that never got an HTTP response (offline browser, API
 * process down, DNS failure). Same wording as the auth forms (BUG-013) so one
 * situation reads the same everywhere.
 */
export const CHAT_UNREACHABLE_MESSAGE =
  "Can't reach the server. Check your connection and try again.";

/**
 * BUG-014: a failed chat send.
 *
 * `status` is set whenever the request produced an HTTP response (including the
 * mapped provider failures the API answers now). A rejected `fetch` — the API
 * is not running, the browser is offline — leaves it undefined, which is the
 * case where the composer keeps the typed text: nothing was persisted anywhere,
 * so the user should not have to type it again.
 */
export class ChatSendError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ChatSendError';
    this.status = status;
  }

  /** True when the API answered this request (even with an error status). */
  get reachedServer(): boolean {
    return this.status !== undefined;
  }
}

export async function streamMessage(
  conversationId: number,
  content: string,
  mode: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: ChatSendError) => void,
  context?: string,
) {
  try {
    const res = await fetch(`${BASE}/api/openai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mode, context }),
    });

    if (!res.ok) {
      // The API answers JSON for every failure class (BUG-013) and its provider
      // copy is already safe to display (BUG-014) — it never contains provider
      // text, a stack or a key.
      let detail = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const data = (await res.json()) as { error?: unknown } | null;
        if (typeof data?.error === 'string' && data.error) detail = data.error;
      } catch {
        // Non-JSON error body; keep the generic HTTP message.
      }
      throw new ChatSendError(detail, res.status);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.content) onChunk(evt.content);
            if (evt.error) {
              // Mid-stream provider failure: the response already began with
              // 200, and the frame carries the same mapped copy.
              onError(new ChatSendError(evt.error, res.status));
              return;
            }
            if (evt.done) {
              onDone();
              return;
            }
          } catch (e) {
            console.warn('Failed to parse SSE event:', line, e);
          }
        }
      }
    }
    onDone();
  } catch (error) {
    if (error instanceof ChatSendError) {
      onError(error);
      return;
    }
    // The request itself failed (`Failed to fetch`): the API never answered, so
    // nothing was saved, and a browser-level message is no help to the user.
    console.warn('Chat request failed before reaching the API:', error);
    onError(new ChatSendError(CHAT_UNREACHABLE_MESSAGE));
  }
}
