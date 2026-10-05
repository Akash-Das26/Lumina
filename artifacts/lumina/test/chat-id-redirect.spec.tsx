import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatConversation from '@/pages/chat-conversation';

// Mutable wouter state so each test can pick the route params.
const route = vi.hoisted(() => ({
  params: { id: '1' } as Record<string, string | undefined>,
}));

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  getAuthMe: vi.fn(),
  logoutAuth: vi.fn(),
  useGetOpenaiConversation: () => ({ data: undefined, isLoading: false }),
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
  useParams: () => route.params,
  useLocation: () => ['/chat/1', mocks.setLocation],
  Link: ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));

// Stub the heavy leaf components; these tests only care about the redirect.
vi.mock('@/components/conversation-list', () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));
vi.mock('@/components/chat-input', () => ({ ChatInput: () => <div data-testid="chat-input" /> }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <div /> }));
vi.mock('@/components/message-bubble', () => ({
  MessageBubble: () => <div />,
  extractImageSrc: () => undefined,
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatConversation />
    </QueryClientProvider>,
  );
}

describe('/chat/:id with a non-numeric id (Audit 3 F-13)', () => {
  beforeEach(() => {
    mocks.setLocation.mockClear();
  });

  afterEach(() => {
    route.params = { id: '1' };
  });

  it('redirects to /chat when the id is not numeric', async () => {
    route.params = { id: 'abc' };
    renderPage();
    await waitFor(() => expect(mocks.setLocation).toHaveBeenCalledWith('/chat'));
  });

  it('does not redirect for a valid numeric id', async () => {
    route.params = { id: '7' };
    renderPage();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });
});
