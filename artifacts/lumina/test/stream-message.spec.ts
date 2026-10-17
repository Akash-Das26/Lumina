// @vitest-environment jsdom
// BUG-014: what the chat transport reports for each failure shape — and in
// particular, which failures mean "the API never saw this request" (the caller
// keeps the typed text) versus "the API answered" (the message was persisted).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_UNREACHABLE_MESSAGE,
  ChatSendError,
  apiAnswered,
  errorReachedServer,
  streamMessage,
} from '@/lib/stream-message';

type Handlers = {
  chunks: string[];
  done: boolean;
  error?: ChatSendError;
};

function run(response: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => response));
  const seen: Handlers = { chunks: [], done: false };
  const finished = streamMessage(
    1,
    'hello',
    'chat',
    (text) => seen.chunks.push(text),
    () => {
      seen.done = true;
    },
    (error) => {
      seen.error = error;
    },
  );
  return { seen, finished };
}

function errorResponse(status: number, statusText: string, body: unknown, json = true) {
  return {
    ok: false,
    status,
    statusText,
    json: async () => {
      if (!json) throw new Error('not json');
      return body;
    },
  };
}

function sseResponse(body: string[]) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: {
      getReader() {
        let index = 0;
        return {
          async read() {
            if (index >= body.length) return { done: true, value: undefined };
            const value = new TextEncoder().encode(body[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiAnswered', () => {
  it('accepts the API JSON error contract, including mapped provider errors', () => {
    expect(apiAnswered(502, { error: 'The AI service is temporarily unavailable.' })).toBe(true);
    expect(apiAnswered(401, { error: 'Authentication required' })).toBe(true);
    expect(apiAnswered(400, { error: 'Validation failed', fieldErrors: {} })).toBe(true);
  });

  it('rejects the dev proxy marker and any non-JSON 5xx page', () => {
    expect(apiAnswered(503, { error: 'The API server is not reachable.', code: 'api-unreachable' })).toBe(false);
    expect(apiAnswered(502, '<html><body>502 Bad Gateway</body></html>')).toBe(false);
    expect(apiAnswered(504, null)).toBe(false);
  });

  it('does not treat a 4xx without a body as a gateway failure', () => {
    expect(apiAnswered(404, null)).toBe(true);
  });
});

describe('errorReachedServer', () => {
  it('uses an explicit delivered flag when present', () => {
    expect(errorReachedServer(new ChatSendError(CHAT_UNREACHABLE_MESSAGE, 503, false))).toBe(false);
    expect(errorReachedServer(new ChatSendError('nope', 502, true))).toBe(true);
  });

  it('falls back to status plus body for API client errors (ApiError)', () => {
    const apiError = Object.assign(new Error('HTTP 502 Bad Gateway: mapped'), {
      status: 502,
      data: { error: 'The AI service is not configured correctly.' },
    });
    const proxyError = Object.assign(new Error('HTTP 503: The API server is not reachable.'), {
      status: 503,
      data: { error: 'The API server is not reachable.', code: 'api-unreachable' },
    });
    const offline = new TypeError('Failed to fetch');

    expect(errorReachedServer(apiError)).toBe(true);
    expect(errorReachedServer(proxyError)).toBe(false);
    expect(errorReachedServer(offline)).toBe(false);
  });
});

describe('streamMessage failure handling', () => {
  it('reports a mapped provider failure as delivered, with the API copy', async () => {
    const mapped = 'The AI service is temporarily unavailable. Please try again.';
    const { seen, finished } = run(errorResponse(502, 'Bad Gateway', { error: mapped }));

    await finished;

    expect(seen.error?.message).toBe(mapped);
    expect(seen.error?.status).toBe(502);
    expect(seen.error?.reachedServer).toBe(true);
  });

  it('treats the dev proxy 503 as "never reached the API"', async () => {
    const { seen, finished } = run(
      errorResponse(503, 'Service Unavailable', {
        error: 'The API server is not reachable.',
        code: 'api-unreachable',
      }),
    );

    await finished;

    expect(seen.error?.reachedServer).toBe(false);
    expect(seen.error?.message).toBe('The API server is not reachable.');
  });

  it('treats a gateway 502 HTML page as "never reached the API"', async () => {
    const { seen, finished } = run(errorResponse(502, 'Bad Gateway', undefined, false));

    await finished;

    expect(seen.error?.reachedServer).toBe(false);
    expect(seen.error?.message).toBe(CHAT_UNREACHABLE_MESSAGE);
  });

  it('treats a rejected fetch as "never reached the API"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const seen: Handlers = { chunks: [], done: false };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await streamMessage(
      1,
      'hello',
      'chat',
      (text) => seen.chunks.push(text),
      () => {
        seen.done = true;
      },
      (error) => {
        seen.error = error;
      },
    );

    expect(seen.error?.reachedServer).toBe(false);
    expect(seen.error?.status).toBeUndefined();
    expect(seen.error?.message).toBe(CHAT_UNREACHABLE_MESSAGE);
  });

  it('streams chunks and completes on success', async () => {
    const { seen, finished } = run(
      sseResponse(['data: {"content":"he"}\n\n', 'data: {"content":"llo"}\n\n', 'data: {"done":true}\n\n']),
    );

    await finished;

    expect(seen.chunks.join('')).toBe('hello');
    expect(seen.done).toBe(true);
    expect(seen.error).toBeUndefined();
  });

  it('reports a mid-stream error frame as delivered with the mapped copy', async () => {
    const mapped = 'The AI service is busy or over quota. Please try again later.';
    const { seen, finished } = run(
      sseResponse(['data: {"content":"he"}\n\n', `data: {"error":"${mapped}"}\n\n`]),
    );

    await finished;

    expect(seen.chunks.join('')).toBe('he');
    expect(seen.error?.message).toBe(mapped);
    expect(seen.error?.reachedServer).toBe(true);
    expect(seen.done).toBe(false);
  });
});
