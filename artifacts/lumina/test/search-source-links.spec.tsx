// @vitest-environment jsdom
// BUG-018 / Audit 4 A4: search-source cards are links built from upstream data
// (Wikipedia / DuckDuckGo). Only http(s) URLs may become an <a>, non-http
// schemes stay unlinked text, and external links must carry
// rel="noopener noreferrer".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatConversation from '@/pages/chat-conversation';

const mocks = vi.hoisted(() => ({
  getOpenaiConversation: vi.fn(),
}));

const conversation = vi.hoisted(() => ({
  data: null as
    | {
        id: number;
        title: string;
        mode: string;
        createdAt: string;
        messages: Array<{ id: number; conversationId: number; role: string; content: string; createdAt: string }>;
        nextCursor: number | null;
      }
    | undefined,
}));

vi.mock('@workspace/api-client-react', () => ({
  useGetOpenaiConversation: () => ({ data: conversation.data, isLoading: false }),
  getOpenaiConversation: mocks.getOpenaiConversation,
  useCreateOpenaiConversation: () => ({ mutate: vi.fn() }),
  useGenerateOpenaiImage: () => ({ mutate: vi.fn(), isPending: false }),
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

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/seo', () => ({ useSeo: () => {} }));
vi.mock('@/lib/stream-message', () => ({ streamMessage: vi.fn() }));

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

const searchFetch = vi.fn(async (input: RequestInfo | URL) => {
  if (String(input).includes('/api/openai/search')) {
    return {
      ok: true,
      json: async () => ({
        sources: [
          { title: 'Safe source', url: 'https://example.com/article', snippet: 'ok', domain: 'example.com' },
          { title: 'Script source', url: 'javascript:alert(1)', snippet: 'bad', domain: 'evil.example' },
          { title: 'Data source', url: 'data:text/html,<script>alert(1)</script>', snippet: 'bad', domain: 'evil.example' },
        ],
      }),
    } as Response;
  }
  return { ok: true, json: async () => ({}) } as Response;
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatConversation />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // mode: search so the conversation effect selects Search and the sources
  // block renders after the send.
  conversation.data = {
    id: 1,
    title: 'Search chat',
    mode: 'search',
    createdAt: new Date(Date.UTC(2026, 9, 5, 11, 0, 0)).toISOString(),
    messages: [
      {
        id: 1,
        conversationId: 1,
        role: 'user',
        content: 'existing question',
        createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0, 0)).toISOString(),
      },
    ],
    nextCursor: null,
  };
  vi.stubGlobal('fetch', searchFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  conversation.data = undefined;
});

async function sendSearch() {
  renderPage();
  const user = userEvent.setup();
  const box = await screen.findByTestId('input-chat-message');
  await user.type(box, 'what happened');
  await user.click(screen.getByTestId('button-send-message'));
  await screen.findByText('Sources used for this answer');
}

describe('search source links (BUG-018 / Audit 4 A4)', () => {
  it('links an http(s) source with target and noopener noreferrer', async () => {
    await sendSearch();

    const anchor = (await screen.findByText('Safe source')).closest('a');
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute('href', 'https://example.com/article');
    expect(anchor).toHaveAttribute('target', '_blank');
    const rel = anchor!.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('does not link javascript: and data: sources but keeps them visible', async () => {
    await sendSearch();

    const scriptLink = screen.getByText('Script source').closest('a');
    expect(scriptLink).toBeNull();

    const dataLink = screen.getByText('Data source').closest('a');
    expect(dataLink).toBeNull();

    // The card content stays readable as plain text.
    expect(screen.getByText('Script source')).toBeInTheDocument();
    expect(screen.getByText('Data source')).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    expect(document.querySelector('a[href^="data:"]')).toBeNull();
  });

  it('fetches sources once for the search send', async () => {
    await sendSearch();
    await waitFor(() =>
      expect(searchFetch.mock.calls.some((call) => String(call[0]).includes('/api/openai/search'))).toBe(true),
    );
  });
});
