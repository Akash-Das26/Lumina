import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatConversation from '@/pages/chat-conversation';
import { CHAT_UNREACHABLE_MESSAGE, ChatSendError } from '@/lib/stream-message';

// BUG-014: a failed send keeps the user's message with an inline "Message failed
// to send" state and a Retry control, shows the API's mapped copy in the toast
// (never the provider's own text), and gives the typed text back when the
// request never reached the API at all.
const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  streamMessage: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock('@/lib/stream-message', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stream-message')>()),
  streamMessage: mocks.streamMessage,
}));

const conversation = vi.hoisted(() => ({
  data: {
    id: 1,
    title: 'Failing chat',
    mode: 'chat',
    createdAt: new Date(Date.UTC(2026, 9, 16, 11, 0, 0)).toISOString(),
    messages: [] as Array<{
      id: number;
      conversationId: number;
      role: string;
      content: string;
      createdAt: string;
    }>,
    nextCursor: null as number | null,
  },
}));

vi.mock('@workspace/api-client-react', () => ({
  useGetOpenaiConversation: () => ({ data: conversation.data, isLoading: false }),
  getOpenaiConversation: vi.fn(),
  useCreateOpenaiConversation: () => ({ mutate: vi.fn() }),
  useGenerateOpenaiImage: () => ({
    mutate: vi.fn(),
    mutateAsync: mocks.generateImage,
    isPending: false,
  }),
  getListOpenaiConversationsQueryKey: () => ['conversations'],
  getGetOpenaiConversationQueryKey: (id: number) => ['conversation', id],
}));

vi.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'ada@test.dev', name: 'Ada Lovelace' },
    status: 'authenticated',
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/seo', () => ({ useSeo: () => {} }));

vi.mock('wouter', () => ({
  useParams: () => ({ id: '1' }),
  useLocation: () => ['/chat/1', vi.fn()],
  Link: ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));

vi.mock('@/components/conversation-list', () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <div /> }));
vi.mock('@/components/image-lightbox', () => ({ ImageLightbox: () => <div /> }));

// The mapped copy the API answers with once the provider rejects the key.
const NOT_CONFIGURED =
  'The AI service is not configured correctly. Please contact the administrator.';
/**
 * Fragments of the provider text from the reported bug. The server stopped
 * forwarding them (bug-014.spec.ts asserts that), and the UI must not show them
 * either.
 */
const PROVIDER_TEXT_FRAGMENTS = ['Incorrect API key', 'replace-', 'platform.openai.com'];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatConversation />
    </QueryClientProvider>,
  );
}

/** Types a message and sends it. */
async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('input-chat-message'), text);
  await user.click(screen.getByTestId('button-send-message'));
  return user;
}

beforeEach(() => {
  mocks.toast.mockReset();
  mocks.streamMessage.mockReset();
  mocks.generateImage.mockReset();
  conversation.data.messages = [];
  conversation.data.nextCursor = null;
  conversation.data.mode = 'chat';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('failed message state (BUG-014)', () => {
  it('keeps the message, marks it failed and shows the mapped copy in the toast', async () => {
    mocks.streamMessage.mockImplementation(
      async (_id, _content, _mode, _onChunk, _onDone, onError: (e: Error) => void) => {
        onError(new ChatSendError(NOT_CONFIGURED, 502));
      },
    );

    renderPage();
    await send('hello there');

    // The user's message stays in the transcript, flagged, with Retry offered.
    expect(await screen.findByTestId('message-failed')).toBeInTheDocument();
    expect(screen.getByText('Message failed to send')).toBeInTheDocument();
    expect(screen.getByText('hello there')).toBeInTheDocument();
    expect(screen.getByTestId('button-retry-message')).toBeInTheDocument();

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Message failed',
      description: NOT_CONFIGURED,
      variant: 'destructive',
    });
    // Provider text and key fragments are in neither the toast nor the DOM.
    const shown = `${document.body.textContent ?? ''} ${JSON.stringify(mocks.toast.mock.calls)}`;
    for (const fragment of PROVIDER_TEXT_FRAGMENTS) {
      expect(shown).not.toContain(fragment);
    }
  });

  it('resends the message when Retry is clicked', async () => {
    mocks.streamMessage
      .mockImplementationOnce(
        async (_id, _content, _mode, _onChunk, _onDone, onError: (e: Error) => void) => {
          onError(new ChatSendError(NOT_CONFIGURED, 502));
        },
      )
      .mockImplementationOnce(
        async (_id, _content, _mode, onChunk: (t: string) => void, onDone: () => void) => {
          onChunk('answered');
          onDone();
        },
      );

    renderPage();
    const user = await send('hello there');
    await screen.findByTestId('button-retry-message');

    await user.click(screen.getByTestId('button-retry-message'));

    await waitFor(() => expect(mocks.streamMessage).toHaveBeenCalledTimes(2));
    expect(mocks.streamMessage.mock.calls[0]?.[1]).toBe('hello there');
    expect(mocks.streamMessage.mock.calls[1]?.[1]).toBe('hello there');
    // The stale failed copy is replaced by the retried message.
    await waitFor(() => expect(screen.queryByTestId('message-failed')).not.toBeInTheDocument());
    expect(screen.getByText('answered')).toBeInTheDocument();
  });

  // Requirement: every tool shares the mapping. Search mode's source lookup
  // fails first, and its failure must be as safe and as retryable as a chat one.
  it('uses the API copy for a failed Search source lookup and offers Retry', async () => {
    conversation.data.mode = 'search';
    const mapped = 'The AI service did not respond. Please try again.';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 504,
        json: async () => ({ error: mapped }),
      })),
    );

    try {
      renderPage();
      // The page adopts the conversation's mode, so this send goes through the
      // Search branch (source lookup) and never reaches the streaming call.
      await waitFor(() => expect(screen.getByTestId('mode-search')).toHaveClass(/bg-primary/));
      await send('latest news on ada');

      expect(await screen.findByTestId('message-failed')).toBeInTheDocument();
      expect(screen.getByTestId('button-retry-message')).toBeInTheDocument();
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Search unavailable',
        description: mapped,
        variant: 'destructive',
      });
      expect(mocks.streamMessage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the API copy when the provider is temporarily unavailable (5xx)', async () => {
    const mapped = 'The AI service is temporarily unavailable. Please try again.';
    mocks.streamMessage.mockImplementation(
      async (_id, _content, _mode, _onChunk, _onDone, onError: (e: Error) => void) => {
        onError(new ChatSendError(mapped, 502, true));
      },
    );

    renderPage();
    await send('is the provider up?');

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Message failed',
      description: mapped,
      variant: 'destructive',
    });
    // The API answered, so the message is persisted and stays with Retry.
    expect(await screen.findByTestId('message-failed')).toBeInTheDocument();
    expect(screen.getByTestId('button-retry-message')).toBeInTheDocument();
  });

  it('keeps the typed text when a gateway answered instead of the API', async () => {
    mocks.streamMessage.mockImplementation(
      async (_id, _content, _mode, _onChunk, _onDone, onError: (e: Error) => void) => {
        // The dev proxy marks its own response with code "api-unreachable".
        onError(new ChatSendError(CHAT_UNREACHABLE_MESSAGE, 503, false));
      },
    );

    renderPage();
    await send('typed while the api was down');

    await waitFor(() =>
      expect(screen.getByTestId('input-chat-message')).toHaveValue('typed while the api was down'),
    );
    expect(screen.queryByTestId('message-failed')).not.toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Message failed',
      description: CHAT_UNREACHABLE_MESSAGE,
      variant: 'destructive',
    });
  });

  it('keeps the typed text when an Artist request never reached the API', async () => {
    conversation.data.mode = 'artist';
    // API-client error shape: status plus the parsed body (see customFetch).
    mocks.generateImage.mockRejectedValue(
      Object.assign(new Error('HTTP 503 Service Unavailable'), {
        status: 503,
        data: { error: 'The API server is not reachable.', code: 'api-unreachable' },
      }),
    );

    renderPage();
    await send('a calm blue rectangle');

    await waitFor(() =>
      expect(screen.getByTestId('input-chat-message')).toHaveValue('a calm blue rectangle'),
    );
    expect(screen.queryByTestId('message-failed')).not.toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Image generation failed',
      description: 'The API server is not reachable.',
      variant: 'destructive',
    });
  });

  it('keeps the typed text when the send never reached the API', async () => {
    mocks.streamMessage.mockImplementation(
      async (_id, _content, _mode, _onChunk, _onDone, onError: (e: Error) => void) => {
        // No HTTP status: a rejected fetch, so nothing was persisted anywhere.
        onError(new ChatSendError(CHAT_UNREACHABLE_MESSAGE));
      },
    );

    renderPage();
    await send('a long message worth keeping');

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Message failed',
      description: CHAT_UNREACHABLE_MESSAGE,
      variant: 'destructive',
    });
    // Text back in the composer instead of a bubble that never existed server-side.
    await waitFor(() =>
      expect(screen.getByTestId('input-chat-message')).toHaveValue('a long message worth keeping'),
    );
    expect(screen.queryByTestId('message-failed')).not.toBeInTheDocument();
  });
});
