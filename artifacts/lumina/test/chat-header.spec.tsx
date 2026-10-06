import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatConversation from '@/pages/chat-conversation';

const mocks = vi.hoisted(() => ({
  getAuthMe: vi.fn(),
  logoutAuth: vi.fn(),
  signOut: vi.fn(),
  toast: vi.fn(),
}));

// Mutable auth state so individual tests can toggle the signed-in user.
const auth = vi.hoisted(() => ({
  user: null as { id: number; email: string; name: string } | null,
}));

vi.mock('@workspace/api-client-react', () => ({
  getAuthMe: mocks.getAuthMe,
  logoutAuth: mocks.logoutAuth,
  useGetOpenaiConversation: () => ({ data: undefined, isLoading: false }),
  getOpenaiConversation: vi.fn(),
  useCreateOpenaiConversation: () => ({ mutate: vi.fn() }),
  useGenerateOpenaiImage: () => ({ mutate: vi.fn(), isPending: false }),
  getListOpenaiConversationsQueryKey: () => ['conversations'],
  getGetOpenaiConversationQueryKey: (id: number) => ['conversation', id],
}));

vi.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ user: auth.user, status: auth.user ? 'authenticated' : 'unauthenticated', signOut: mocks.signOut }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/lib/seo', () => ({ useSeo: () => {} }));
vi.mock('@/lib/stream-message', () => ({ streamMessage: vi.fn() }));

vi.mock('wouter', () => ({
  useParams: () => ({ id: '1' }),
  useLocation: () => ['/chat/1', vi.fn()],
  Link: ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));

// The chat page pulls in the whole conversation list + input; stub the heavy
// leaf components so these tests stay focused on the header.
vi.mock('@/components/conversation-list', () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));
vi.mock('@/components/chat-input', () => ({ ChatInput: () => <div data-testid="chat-input" /> }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <div /> }));
vi.mock('@/components/message-bubble', () => ({
  MessageBubble: () => <div />,
  extractImageSrc: () => undefined,
}));

beforeEach(() => {
  auth.user = { id: 1, email: 'ada@test.dev', name: 'Ada Lovelace' };
  // Radix's menu primitives call these pointer-capture APIs on open.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatConversation />
    </QueryClientProvider>,
  );
}

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('button-account-menu'));
}

describe('chat header account menu', () => {
  it('hides the account menu when nobody is signed in', () => {
    auth.user = null;
    renderPage();
    expect(screen.queryByTestId('button-account-menu')).not.toBeInTheDocument();
  });

  it("shows the signed-in user's name and email in the menu", async () => {
    const user = userEvent.setup();
    renderPage();

    await openAccountMenu(user);

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('ada@test.dev')).toBeInTheDocument();
    expect(screen.getByTestId('button-sign-out')).toHaveTextContent('Sign out');
  });

  it('signs out once when the sign-out item is selected', async () => {
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue(undefined);
    renderPage();

    await openAccountMenu(user);
    await user.click(await screen.findByTestId('button-sign-out'));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('disables the item while signing out so a second click cannot re-fire', async () => {
    const user = userEvent.setup();
    let resolveSignOut: () => void = () => {};
    mocks.signOut.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSignOut = resolve; }),
    );
    renderPage();

    await openAccountMenu(user);
    await user.click(await screen.findByTestId('button-sign-out'));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));

    // Re-open the menu while the request is still in flight.
    await openAccountMenu(user);
    const item = await screen.findByTestId('button-sign-out');
    // Radix renders a disabled menu item as a div with aria-disabled, not a
    // native disabled attribute.
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Signing out…');

    resolveSignOut();
  });

  it('toasts and re-enables the item when sign out fails', async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new Error('network down'));
    renderPage();

    await openAccountMenu(user);
    await user.click(await screen.findByTestId('button-sign-out'));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Sign out failed', variant: 'destructive' }),
      ),
    );

    await openAccountMenu(user);
    const item = await screen.findByTestId('button-sign-out');
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Sign out');
  });
});
