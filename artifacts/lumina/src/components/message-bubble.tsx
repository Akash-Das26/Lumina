import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';
import { Bot, User, Loader2, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isGenerating?: boolean;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
  onOpenImage?: () => void;
}

// A generated image message is exactly one markdown image line whose src is a
// base64 data URI, e.g. `![Generated image](data:image/png;base64,...)`.
const IMAGE_MARKDOWN = /^!\[[^\]]*\]\(([^)]+)\)$/m;

/** The src of a generated-image message, or undefined for other content. */
export function extractImageSrc(content: string): string | undefined {
  if (!content.startsWith('![')) return undefined;
  return content.match(IMAGE_MARKDOWN)?.[1];
}

/**
 * Download extension for an image src. A data URI carries its media type
 * (Audit 2 F-04); a server-held reference carries the format as a `.ext`
 * suffix (Audit 3 F-03). Falls back to PNG.
 */
export function imageExtension(src: string): string {
  const dataUri = src.match(/^data:image\/([a-z0-9.+-]+);/i);
  if (dataUri) return dataUri[1] === 'jpeg' ? 'jpg' : dataUri[1];
  const suffix = src.match(/\.([a-z0-9]+)$/i);
  return suffix ? suffix[1] : 'png';
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  isGenerating,
  isRegenerating,
  onRegenerate,
  onOpenImage,
}: MessageBubbleProps) {
  const isUser = role === 'user';
  const imageSrc = extractImageSrc(content);
  const isImage = imageSrc !== undefined;

  const handleDownload = () => {
    if (!imageSrc) return;
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `lumina-image-${Date.now()}.${imageExtension(imageSrc)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

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
            {isImage && imageSrc ? (
              <button
                type="button"
                onClick={onOpenImage}
                className="block cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Click to view full size"
                aria-label="View generated image full size"
                data-testid="button-open-image-lightbox"
              >
                <img
                  src={imageSrc}
                  alt="Generated image"
                  className="h-auto max-w-full rounded-lg transition-opacity hover:opacity-90"
                />
              </button>
            ) : (
              renderMarkdown(content)
            )}
            {isStreaming && !isImage && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse-glow rounded-sm" />
            )}
            {isImage && imageSrc && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={handleDownload}
                  data-testid="button-download-image"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                {onRegenerate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    data-testid="button-regenerate-image"
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {isRegenerating ? 'Regenerating…' : 'Re-generate'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
