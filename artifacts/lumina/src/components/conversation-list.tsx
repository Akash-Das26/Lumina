import { useListOpenaiConversations, useDeleteOpenaiConversation, getListOpenaiConversationsQueryKey } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Trash2, Plus } from 'lucide-react';
import { getModeById } from '@/lib/modes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
  onNewChat: () => void;
}

export function ConversationList({ onNewChat }: ConversationListProps) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { data: conversations, isLoading } = useListOpenaiConversations();
  const deleteConv = useDeleteOpenaiConversation();

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteConv.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const sortedConvs = [...(conversations || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="flex flex-col gap-2 p-4">
      <Button
        onClick={onNewChat}
        className="w-full justify-start gap-2 mb-2"
        data-testid="button-new-chat"
      >
        <Plus className="w-4 h-4" />
        New Conversation
      </Button>

      {sortedConvs.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          No conversations yet
        </div>
      )}

      {sortedConvs.map((conv) => {
        const mode = getModeById(conv.mode);
        const Icon = mode.icon;
        const isActive = location === `/chat/${conv.id}`;

        return (
          <Link
            key={conv.id}
            href={`/chat/${conv.id}`}
            data-testid={`link-conversation-${conv.id}`}
            className={cn(
              'group relative flex items-start gap-3 p-3 rounded-lg border transition-all',
              isActive
                ? 'bg-primary/10 border-primary/30'
                : 'bg-card border-card-border hover:border-primary/20 hover:bg-muted/30'
            )}
          >
            <div className={cn(
              'flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
              isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Icon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{conv.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
              </div>
            </div>

            <button
              onClick={(e) => handleDelete(e, conv.id)}
              data-testid={`button-delete-${conv.id}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Link>
        );
      })}
    </div>
  );
}
