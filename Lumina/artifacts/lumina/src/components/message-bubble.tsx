import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';
import { Bot, User, Loader2 } from 'lucide-react';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isGenerating?: boolean;
}

export function MessageBubble({ role, content, isStreaming, isGenerating }: MessageBubbleProps) {
  const isUser = role === 'user';
  const isImage = content.startsWith('![');

  return (
    <div
      className={cn(
        'flex gap-4 p-4 rounded-xl animate-slide-in',
        isUser ? 'bg-muted/30' : 'bg-card border border-card-border'
      )}
      data-testid={`message-${role}`}
    >
      <div
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-full shrink-0',
          isUser
            ? 'bg-primary/20 text-primary'
            : 'bg-accent/20 text-accent'
        )}
      >
        {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </div>

      <div className="flex-1 pt-2 text-sm leading-relaxed">
        {isGenerating ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{content}</span>
          </div>
        ) : (
          <>
            {renderMarkdown(content)}
            {isStreaming && !isImage && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse-glow rounded-sm" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
