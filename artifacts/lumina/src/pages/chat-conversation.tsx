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
import { Sparkles, Menu, X, Loader2 } from 'lucide-react';
import { ConversationList } from '@/components/conversation-list';
import { ModeSelector } from '@/components/mode-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import { MessageBubble } from '@/components/message-bubble';
import { ChatInput } from '@/components/chat-input';
import { Button } from '@/components/ui/button';
import { ModeKey, getModeById } from '@/lib/modes';
import { streamMessage } from '@/lib/stream-message';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface TempMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export default function ChatConversation() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const id = params.id ? Number(params.id) : null;
  const { data: conversation, isLoading } = useGetOpenaiConversation(id!, {
    query: { enabled: !!id, queryKey: getGetOpenaiConversationQueryKey(id!) },
  });
  const createConv = useCreateOpenaiConversation();
  const generateImage = useGenerateOpenaiImage();

  const [selectedMode, setSelectedMode] = useState<ModeKey>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tempMessages, setTempMessages] = useState<TempMessage[]>([]);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSendMessage = async (content: string) => {
    if (!id) return;

    // Add user message immediately
    setTempMessages((prev) => [...prev, { role: 'user', content }]);

    // Artist mode: generate image
    if (selectedMode === 'artist') {
      setTempMessages((prev) => [...prev, { role: 'assistant', content: 'Generating image...', isStreaming: true }]);
      
      generateImage.mutate(
        { data: { prompt: content } },
        {
          onSuccess: (result) => {
            setTempMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: `![Generated image](data:image/png;base64,${result.b64_json})`,
                isStreaming: false,
              };
              return updated;
            });
            queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
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
      }
    );
  };

  const allMessages = [
    ...(conversation?.messages || []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ...tempMessages,
  ];

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
          <ModeSelector selected={selectedMode} onChange={setSelectedMode} />
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

          {allMessages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              role={msg.role}
              content={msg.content}
              isStreaming={msg.isStreaming}
            />
          ))}
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
    </div>
  );
}
