const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Client copy for a send that never got an HTTP response (offline browser, API
 * process down, DNS failure). Same wording as the auth forms (BUG-013) so one
 * situation reads the same everywhere.
 */
export const CHAT_UNREACHABLE_MESSAGE =
  "Can't reach the server. Check your connection and try again.";

/**
 * The dev proxy's marker for "I could not reach the API at all" (see
 * artifacts/lumina/vite.config.ts). A response carrying it was not produced by
 * the API, so nothing was persisted.
 */
export const API_UNREACHABLE_CODE = 'api-unreachable';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * True when an HTTP response came from the API itself.
 *
 * Every API failure — including the mapped provider errors (BUG-014) — is JSON
 * with an `error` string (BUG-013). A 5xx that is *not* that contract came from
 * something in front of the API (the Vite dev proxy, a reverse proxy, a gateway
 * error page), which means the request never reached the app and nothing was
 * saved: the caller should keep their text rather than being told the message
 * failed to send.
 */
export function apiAnswered(status: number, body: unknown): boolean {
  if (!Number.isFinite(status)) return false;
  if (status < 500) return true;
  const record = asRecord(body);
  if (record?.['code'] === API_UNREACHABLE_CODE) return false;
  return typeof record?.['error'] === 'string';
}

/**
 * The same rule for anything thrown by the chat path: our own `ChatSendError`
 * (which already decided) or an API-client `ApiError` (`status` plus the parsed
 * body on `data`). No status at all means the request never left the browser.
 */
export function errorReachedServer(error: unknown): boolean {
  const record = asRecord(error);
  if (typeof record?.['delivered'] === 'boolean') return record['delivered'];
  const status = record?.['status'];
  if (typeof status !== 'number') return false;
  return apiAnswered(status, record?.['data']);
}

/**
 * BUG-014: a failed chat send.
 *
 * `status` is set whenever the request produced an HTTP response (including the
 * mapped provider failures the API answers now). `delivered` is false when the
 * API never saw the request — a rejected `fetch` (API not running, browser
 * offline) or a proxy/gateway 5xx — which is exactly the case where the
 * composer keeps the typed text: nothing was persisted anywhere, so the user
 * should not have to type it again.
 */
export class ChatSendError extends Error {
  readonly status?: number;
  readonly delivered: boolean;

  constructor(message: string, status?: number, delivered = status !== undefined) {
    super(message);
    this.name = 'ChatSendError';
    this.status = status;
    this.delivered = delivered;
  }

  /** True when the API answered this request (even with an error status). */
  get reachedServer(): boolean {
    return this.delivered;
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
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // Not JSON: a proxy or gateway produced this response, not the API.
      }
      const contractMessage = asRecord(body)?.['error'];
      const detail =
        typeof contractMessage === 'string' && contractMessage
          ? contractMessage
          : `HTTP ${res.status}: ${res.statusText}`;
      if (!apiAnswered(res.status, body)) {
        // Proxy/gateway failure: the request never reached the API, so the
        // caller keeps the typed text (the message says what happened).
        throw new ChatSendError(
          typeof contractMessage === 'string' && contractMessage
            ? contractMessage
            : CHAT_UNREACHABLE_MESSAGE,
          res.status,
          false,
        );
      }
      throw new ChatSendError(detail, res.status, true);
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
              // 200, and the frame carries the same mapped copy. The message was
              // persisted before streaming, so this is a delivered failure.
              onError(new ChatSendError(evt.error, res.status, true));
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
    onError(new ChatSendError(CHAT_UNREACHABLE_MESSAGE, undefined, false));
  }
}
