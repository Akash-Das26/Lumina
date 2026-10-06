import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatConversation from '@/pages/chat-conversation';

// Audit 3 F-03 / BUG-008: the conversation endpoint returns only a recent
// window; older messages load on demand via nextCursor.
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
vi.mock('@/components/chat-input', () => ({ ChatInput: () => <div data-testid="chat-input" /> }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <div /> }));
vi.mock('@/components/image-lightbox', () => ({ ImageLightbox: () => <div /> }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatConversation />
    </QueryClientProvider>,
  );
}

const msg = (id: number, content: string) => ({
  id,
  conversationId: 1,
  role: 'user',
  content,
  createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0, id)).toISOString(),
});

beforeEach(() => {
  conversation.data = {
    id: 1,
    title: 'Windowed chat',
    mode: 'chat',
    createdAt: new Date(Date.UTC(2026, 9, 5, 11, 0, 0)).toISOString(),
    messages: [msg(3, 'm3')],
    nextCursor: 2,
  };
  mocks.getOpenaiConversation.mockResolvedValue({
    ...conversation.data,
    messages: [msg(1, 'm1'), msg(2, 'm2')],
    nextCursor: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  conversation.data = undefined;
});

describe('Load earlier messages (Audit 3 F-03)', () => {
  it('shows the button when older messages remain and prepends the fetched page', async () => {
    renderPage();

    const button = await screen.findByTestId('button-load-earlier-messages');
    expect(screen.getByText('m3')).toBeInTheDocument();
    // m1/m2 are not loaded yet (they are older than this window).
    expect(screen.queryByText('m2')).not.toBeInTheDocument();

    await userEvent.setup().click(button);

    expect(mocks.getOpenaiConversation).toHaveBeenCalledWith(1, { cursor: 2 });
    await waitFor(() => expect(screen.getByText('m1')).toBeInTheDocument());
    expect(screen.getByText('m2')).toBeInTheDocument();
    // nextCursor is now null, so the button is gone.
    expect(screen.queryByTestId('button-load-earlier-messages')).not.toBeInTheDocument();
  });

  it('hides the button when the whole history already fits in one window', async () => {
    conversation.data!.nextCursor = null;
    renderPage();

    await screen.findByText('m3');
    expect(screen.queryByTestId('button-load-earlier-messages')).not.toBeInTheDocument();
  });
});
