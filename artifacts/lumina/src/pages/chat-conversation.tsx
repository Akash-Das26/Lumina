import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  useGetOpenaiConversation,
  useCreateOpenaiConversation,
  useGenerateOpenaiImage,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Menu, X, Loader2, Download, Copy, Check, ExternalLink, Search, FileText, LogOut } from 'lucide-react';
import { ConversationList } from '@/components/conversation-list';
import { ModeSelector } from '@/components/mode-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import { MessageBubble, extractImageSrc } from '@/components/message-bubble';
import { ImageLightbox } from '@/components/image-lightbox';
import { ChatInput } from '@/components/chat-input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ModeKey, getModeById } from '@/lib/modes';
import { useAuth } from '@/lib/auth-provider';
import { streamMessage } from '@/lib/stream-message';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSeo } from '@/lib/seo';

interface TempMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isGenerating?: boolean;
}

/** Closest earlier user message — the prompt behind a generated image. */
function findPrecedingUserMessage(messages: TempMessage[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return undefined;
}

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export default function ChatConversation() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  // Audit 3 F-13: /chat/abc yields NaN — redirect to /chat instead of
  // rendering a conversation page whose queries are disabled.
  const rawId = params.id ? Number(params.id) : null;
  const id = rawId !== null && Number.isNaN(rawId) ? null : rawId;
  useEffect(() => {
    if (params.id && id === null) setLocation('/chat');
  }, [params.id, id, setLocation]);
  const { data: conversation, isLoading } = useGetOpenaiConversation(id!, {
    query: { enabled: !!id, queryKey: getGetOpenaiConversationQueryKey(id!) },
  });
  const createConv = useCreateOpenaiConversation();
  const generateImage = useGenerateOpenaiImage();

  const [selectedMode, setSelectedMode] = useState<ModeKey>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tempMessages, setTempMessages] = useState<TempMessage[]>([]);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useSeo({
    title: conversation ? `${conversation.title} — Lumina AI` : 'Conversation — Lumina AI',
    description: 'Continue a focused Lumina AI conversation with streaming responses, source-backed Search, document context, and exports.',
    path: id ? `/chat/${id}` : '/chat',
  });

  useEffect(() => {
    if (conversation) {
      setSelectedMode(conversation.mode as ModeKey);
    }
  }, [conversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tempMessages, conversation?.messages]);

  const handleNewChat = () => {
    const mode = getModeById(selectedMode);
    createConv.mutate(
      { data: { title: `New ${mode.label} conversation`, mode: selectedMode } },
      {
        onSuccess: (conv) => {
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          setLocation(`/chat/${conv.id}`);
        },
      }
    );
  };

  const handleSendMessage = async (content: string, attachment?: { name: string; text: string }) => {
    if (!id) return;

    // Add user message immediately
    setTempMessages((prev) => [...prev, { role: 'user', content }]);

    // Artist mode: generate an image via the image API. Passing conversationId
    // makes the server persist the prompt + image, so the result survives a
    // reload instead of living only in local component state.
    if (selectedMode === 'artist') {
      setTempMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Generating image...', isGenerating: true },
      ]);

      generateImage.mutate(
        { data: { prompt: content, conversationId: id } },
        {
          onSuccess: async (result) => {
            // Render the image immediately for instant feedback...
            setTempMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                // The server sniffs the real format (Audit 2 F-04); fall back to
                // PNG when talking to an older API without media_type.
                content: `![Generated image](data:${result.media_type ?? 'image/png'};base64,${result.b64_json})`,
                isGenerating: false,
                isStreaming: false,
              };
              return updated;
            });
            // ...then drop the optimistic pair once the refetched conversation
            // already carries the persisted messages (avoids showing them twice).
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(id) }),
              queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() }),
            ]);
            setTempMessages([]);
          },
          onError: (error) => {
            setTempMessages((prev) => prev.slice(0, -1));
            toast({
              title: 'Image generation failed',
              description: error instanceof Error ? error.message : 'Unknown error',
              variant: 'destructive',
            });
          },
        }
      );
      return;
    }

    let context = attachment
      ? `Attached document: ${attachment.name}\n\n${attachment.text}`
      : '';

    if (selectedMode === 'search') {
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        const response = await fetch(`${base}/api/openai/search?q=${encodeURIComponent(content)}`);
        if (!response.ok) throw new Error('Live search is unavailable right now.');
        const result = (await response.json()) as { sources: SearchSource[] };
        setSources(result.sources || []);
        const sourceContext = (result.sources || [])
          .map((source, index) => `[Source ${index + 1}] ${source.title} (${source.url})\n${source.snippet}`)
          .join('\n\n');
        context = `${context ? `${context}\n\n` : ''}Live search sources:\n${sourceContext || 'No public sources were returned.'}`;
      } catch (error) {
        toast({
          title: 'Search unavailable',
          description: error instanceof Error ? error.message : 'Try again in a moment.',
          variant: 'destructive',
        });
        setTempMessages((prev) => prev.slice(0, -1));
        return;
      }
    } else {
      setSources([]);
    }

    // All other modes: stream text response
    setIsStreamingActive(true);
    setTempMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    await streamMessage(
      id,
      content,
      selectedMode,
      (chunk) => {
        setTempMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.content += chunk;
          }
          return [...updated];
        });
      },
      () => {
        setIsStreamingActive(false);
        setTempMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.isStreaming = false;
          }
          return updated;
        });
        queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      },
      (error) => {
        setIsStreamingActive(false);
        setTempMessages((prev) => prev.slice(0, -1));
        toast({
          title: 'Message failed',
          description: error.message,
          variant: 'destructive',
        });
      },
      context,
    );
  };

  const exportConversation = (format: 'markdown' | 'json') => {
    if (!conversation) return;
    const filename = `${conversation.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lumina-conversation'}.${format === 'markdown' ? 'md' : 'json'}`;
    const body = format === 'json'
      ? JSON.stringify({ ...conversation, messages: allMessages }, null, 2)
      : `# ${conversation.title}\n\n_${getModeById(conversation.mode).label} mode · Exported from Lumina AI_\n\n${allMessages.map((message) => `## ${message.role === 'user' ? 'You' : 'Lumina'}\n\n${message.content}`).join('\n\n')}`;
    const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyConversationLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      // On success AuthGate redirects to /sign-in, unmounting this page.
      await signOut();
    } catch (error) {
      setSigningOut(false);
      toast({
        title: 'Sign out failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRegenerateImage = (messageId: number, prompt: string) => {
    if (!id) return;
    setRegeneratingId(messageId);
    // replaceMessageId makes the server overwrite this image in place instead
    // of appending another prompt/image pair.
    generateImage.mutate(
      { data: { prompt, conversationId: id, replaceMessageId: messageId } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(id) });
          setRegeneratingId(null);
        },
        onError: (error) => {
          setRegeneratingId(null);
          toast({
            title: 'Image generation failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const allMessages: TempMessage[] = [
    ...(conversation?.messages || []).map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    ...tempMessages,
  ];

  // Every generated image in the conversation, in display order, plus a map
  // from message index to image index so a click can open the shared lightbox.
  const imageItems: { src: string }[] = [];
  const imageIndexByMessage: number[] = [];
  allMessages.forEach((msg) => {
    const src = msg.role === 'assistant' ? extractImageSrc(msg.content) : undefined;
    if (src) {
      imageIndexByMessage.push(imageItems.length);
      imageItems.push({ src });
    } else {
      imageIndexByMessage.push(-1);
    }
  });

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Sidebar - Mobile Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden transition-opacity',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-80 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">Lumina</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ConversationList onNewChat={handleNewChat} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-toggle-sidebar"
            >
              <Menu className="w-5 h-5" />
            </Button>
            {conversation && (
              <div>
                <h1 className="font-semibold text-sm truncate max-w-xs">{conversation.title}</h1>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {conversation && (
              <>
                <Button variant="outline" size="sm" onClick={() => exportConversation('markdown')} className="hidden gap-2 sm:flex" data-testid="button-export-markdown">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button variant="ghost" size="icon" onClick={copyConversationLink} title="Copy conversation link" data-testid="button-copy-conversation-link">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </>
            )}
            <ModeSelector selected={selectedMode} onChange={setSelectedMode} />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Account"
                    data-testid="button-account-menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {user.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="truncate text-sm font-medium">{user.name}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void handleSignOut()}
                    disabled={signingOut}
                    data-testid="button-sign-out"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && allMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <p>Start the conversation</p>
              </div>
            </div>
          )}

          {allMessages.map((msg, idx) => {
            const imagePrompt =
              msg.role === 'assistant' && msg.content.startsWith('![')
                ? findPrecedingUserMessage(allMessages, idx)
                : undefined;
            const imageIndex = imageIndexByMessage[idx] ?? -1;
            return (
              <MessageBubble
                key={msg.id ?? `temp-${idx}`}
                role={msg.role}
                content={msg.content}
                isStreaming={msg.isStreaming}
                isGenerating={msg.isGenerating}
                isRegenerating={msg.id != null && regeneratingId === msg.id}
                onOpenImage={imageIndex >= 0 ? () => setLightboxIndex(imageIndex) : undefined}
                onRegenerate={
                  msg.id != null && imagePrompt
                    ? () => handleRegenerateImage(msg.id as number, imagePrompt)
                    : undefined
                }
              />
            );
          })}
          {selectedMode === 'search' && sources.length > 0 && (
            <div className="mx-auto mt-5 w-full max-w-3xl rounded-2xl border border-primary/15 bg-primary/[0.03] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Search className="h-4 w-4 text-primary" />
                Sources used for this answer
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="group rounded-xl border border-border bg-card p-3 transition hover:border-primary/40">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold line-clamp-1">{source.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{source.snippet}</p>
                    <span className="mt-2 block text-[10px] text-primary">{source.domain}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSendMessage}
          disabled={isStreamingActive || generateImage.isPending}
          placeholder={
            selectedMode === 'artist'
              ? 'Describe the image you want to create...'
              : 'Type your message...'
          }
        />
      </main>

      <ImageLightbox
        images={imageItems}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}
