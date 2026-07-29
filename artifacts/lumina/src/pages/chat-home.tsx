import { useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateOpenaiConversation, getListOpenaiConversationsQueryKey, useGetOpenaiStats } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, TrendingUp, MessageSquare, Clock } from 'lucide-react';
import { ConversationList } from '@/components/conversation-list';
import { ModeSelector } from '@/components/mode-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { ModeKey, MODES } from '@/lib/modes';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChatHome() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createConv = useCreateOpenaiConversation();
  const { data: stats } = useGetOpenaiStats();
  const [selectedMode, setSelectedMode] = useState<ModeKey>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNewChat = () => {
    const mode = MODES.find((m) => m.id === selectedMode) || MODES[0];
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

        {stats && (
          <div className="p-4 border-t border-sidebar-border bg-sidebar/50">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="w-4 h-4" />
                <span>{stats.totalConversations} chats</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="w-4 h-4" />
                <span>{stats.totalMessages} msgs</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-toggle-sidebar"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="hidden lg:block" />
          <ModeSelector selected={selectedMode} onChange={setSelectedMode} />
        </header>

        {/* Welcome Area */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl text-center space-y-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>

            <div>
              <h1 className="text-4xl font-bold mb-4">Ready to Think</h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Select a mode above and start a new conversation, or choose from your recent chats in the sidebar.
              </p>
            </div>

            <div className="pt-4">
              <Button
                size="lg"
                onClick={handleNewChat}
                disabled={createConv.isPending}
                data-testid="button-start-conversation"
                className="gap-2 text-lg h-14 px-8"
              >
                <MessageSquare className="w-5 h-5" />
                Start New Conversation
              </Button>
            </div>

            {stats && stats.recentConversations.length > 0 && (
              <div className="pt-8">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Clock className="w-4 h-4" />
                  <span>Recent Activity</span>
                </div>
                <div className="grid gap-2">
                  {stats.recentConversations.slice(0, 3).map((conv) => {
                    const mode = MODES.find((m) => m.id === conv.mode) || MODES[0];
                    const Icon = mode.icon;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setLocation(`/chat/${conv.id}`)}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-left"
                        data-testid={`button-recent-${conv.id}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium truncate">{conv.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
