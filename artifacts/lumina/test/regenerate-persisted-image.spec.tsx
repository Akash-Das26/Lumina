import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatConversation from '@/pages/chat-conversation';

const IMAGE_SRC = 'data:image/png;base64,QUJD';
const IMAGE_CONTENT = `![Generated image](${IMAGE_SRC})`;

const mocks = vi.hoisted(() => ({
  generateImageMutate: vi.fn(),
}));

// Mutable per-test conversation fixture.
const conversation = vi.hoisted(() => ({
  data: null as
    | {
        id: number;
        title: string;
        mode: string;
        createdAt: string;
        messages: Array<{ id: number; conversationId: number; role: string; content: string; createdAt: string }>;
      }
    | undefined,
}));

vi.mock('@workspace/api-client-react', () => ({
  useGetOpenaiConversation: () => ({ data: conversation.data, isLoading: false }),
  useCreateOpenaiConversation: () => ({ mutate: vi.fn() }),
  useGenerateOpenaiImage: () => ({ mutate: mocks.generateImageMutate, isPending: false }),
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

const userMessage = (id: number, content: string) => ({
  id,
  conversationId: 1,
  role: 'user',
  content,
  createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0, 0)).toISOString(),
});
const assistantImageMessage = (id: number, content = IMAGE_CONTENT) => ({
  id,
  conversationId: 1,
  role: 'assistant',
  content,
  createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0, 1)).toISOString(),
});

beforeEach(() => {
  conversation.data = {
    id: 1,
    title: 'A painting of the moon',
    mode: 'artist',
    createdAt: new Date(Date.UTC(2026, 9, 5, 11, 59, 0)).toISOString(),
    messages: [],
  };
});

afterEach(() => {
  vi.clearAllMocks();
  conversation.data = undefined;
});

describe('re-generate for persisted images (Audit 2 F-03)', () => {
  it('shows Re-generate on a persisted image and regenerates it in place', async () => {
    conversation.data!.messages = [userMessage(10, 'A painting of the moon'), assistantImageMessage(11)];
    renderPage();

    const user = userEvent.setup();
    const button = await screen.findByTestId('button-regenerate-image');
    await user.click(button);

    await waitFor(() =>
      expect(mocks.generateImageMutate).toHaveBeenCalledTimes(1),
    );
    const call = mocks.generateImageMutate.mock.calls[0][0] as {
      data: { prompt: string; conversationId: number; replaceMessageId: number };
    };
    expect(call.data.prompt).toBe('A painting of the moon');
    expect(call.data.conversationId).toBe(1);
    expect(call.data.replaceMessageId).toBe(11);
  });

  it('hides Re-generate when no preceding user message supplies a prompt', () => {
    conversation.data!.messages = [assistantImageMessage(12)];
    renderPage();

    return waitFor(() => expect(screen.getByTestId('button-download-image')).toBeInTheDocument()).then(() => {
      expect(screen.queryByTestId('button-regenerate-image')).not.toBeInTheDocument();
    });
  });
});
