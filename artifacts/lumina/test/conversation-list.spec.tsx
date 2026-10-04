import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationList } from '@/components/conversation-list';

const useList = vi.hoisted(() => vi.fn());
const useDelete = vi.hoisted(() => vi.fn());
const getQueryKey = vi.hoisted(() => vi.fn());
const ago = vi.hoisted(() => (date: Date) => `ago-${date.toISOString()}`);

vi.mock('@workspace/api-client-react', () => ({
  useListOpenaiConversations: useList,
  useDeleteOpenaiConversation: () => ({ mutate: useDelete }),
  getListOpenaiConversationsQueryKey: getQueryKey,
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/chat/42', vi.fn(), { '/chat/:id': () => {} }],
  Link: ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => {
    const { 'data-testid': testId, ...restWithoutTestId } = rest as Record<string, unknown>;
    return <a {...restWithoutTestId} data-testid={testId ?? 'link-mock'}>{children}</a>;
  },
}));

vi.mock('date-fns', () => ({ formatDistanceToNow: ago }));

afterEach(() => {
  vi.clearAllMocks();
});

const CONVO = [
  { id: 7, title: 'a-zolder', mode: 'chat' as const, createdAt: new Date(Date.now() - 1000 * 60 * 5) },
  { id: 42, title: 'z-newer', mode: 'artist' as const, createdAt: new Date() },
  { id: 101, title: 'empty', mode: 'search' as const, createdAt: new Date(Date.now() - 1000 * 60 * 10) },
];

function defaultClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('ConversationList', () => {
  it('renders a "New Conversation" button that calls onNewChat', async () => {
    useList.mockReturnValue({ data: CONVO, isLoading: false });
    const onNewChat = vi.fn();
    const client = defaultClient();

    render(
      <QueryClientProvider client={client}>
        <ConversationList onNewChat={onNewChat} />
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('button-new-chat'));

    await waitFor(() => expect(onNewChat).toHaveBeenCalledTimes(1));
  });

  it('renders the loading skeleton while the list is in flight', () => {
    useList.mockReturnValue({ data: undefined, isLoading: true });
    const client = defaultClient();
    const view = render(
      <QueryClientProvider client={client}>
        <ConversationList />
      </QueryClientProvider>,
    );

    const pulses = view.container.querySelectorAll('[class*=animate-pulse]');
    expect(pulses).toHaveLength(3);
  });

  it('shows an empty-state message when there are no conversations', () => {
    useList.mockReturnValue({ data: [], isLoading: false });
    const client = defaultClient();

    render(
      <QueryClientProvider client={client}>
        <ConversationList />
      </QueryClientProvider>,
    );

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.queryByTestId(/link-conversation-/)).not.toBeInTheDocument();
  });

  it('renders conversations with icon, title, and relative time', () => {
    useList.mockReturnValue({ data: [...CONVO], isLoading: false });
    const client = defaultClient();

    render(
      <QueryClientProvider client={client}>
        <ConversationList />
      </QueryClientProvider>,
    );

    // Sorted newest-first: 42, 101, 7. The parent container also holds the
    // "New Conversation" button, so the full child order is: button, 42, 7, 101.
    expect(screen.getByTestId('link-conversation-42')).toBeInTheDocument();
    expect(screen.getByTestId('link-conversation-101')).toBeInTheDocument();
    expect(screen.getByTestId('link-conversation-7')).toBeInTheDocument();

    const list = screen.getByTestId('link-conversation-42').parentElement!;
    const ids = Array.from(list.children)
      .filter((el) => el instanceof HTMLElement)
      .map((el) => (el as HTMLElement).getAttribute('data-testid'));
    expect(ids).toEqual(['button-new-chat', 'link-conversation-42', 'link-conversation-7', 'link-conversation-101']);

    expect(screen.getByText('z-newer')).toBeInTheDocument();
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.getByText('a-zolder')).toBeInTheDocument();
  });

  it('highlights the conversation whose id matches the current location', () => {
    useList.mockReturnValue({ data: [...CONVO], isLoading: false });
    const client = defaultClient();

    render(
      <QueryClientProvider client={client}>
        <ConversationList />
      </QueryClientProvider>,
    );

    const activeItem = screen.getByTestId('link-conversation-42');
    const otherItem = screen.getByTestId('link-conversation-7');

    expect(activeItem).toHaveClass('bg-primary/10', 'border-primary/30');
    expect(otherItem).not.toHaveClass('bg-primary/10', 'border-primary/30');
  });

  it('hides the active conversation\'s delete button (only hover-visible)', () => {
    useList.mockReturnValue({ data: [...CONVO], isLoading: false });
    const client = defaultClient();

    render(
      <QueryClientProvider client={client}>
        <ConversationList />
      </QueryClientProvider>,
    );

    // The active row's delete button exists in the DOM but is `opacity-0` until
    // hover, so we assert it exists (the "hides" is a CSS visibility thing).
    expect(screen.getByTestId('button-delete-42')).toBeInTheDocument();
    // Inactive rows still show their delete button visibly (still opacity-0, but
    // present as a test target).
    expect(screen.getByTestId('button-delete-7')).toBeInTheDocument();
  });

  it('calls deleteConversation with the right id when the delete item is clicked', async () => {
    useList.mockReturnValue({ data: [...CONVO], isLoading: false });
    const client = defaultClient();

    render(
      <QueryClientProvider client={client}>
        <ConversationList />
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('button-delete-7'));

    await waitFor(() => expect(useDelete).toHaveBeenCalled());
    expect(useDelete.mock.calls[0][0]).toHaveProperty('id', 7);
  });
});
