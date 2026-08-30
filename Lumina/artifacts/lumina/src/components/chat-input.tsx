import { useState, useRef, useEffect } from 'react';
import { FileText, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string, attachment?: { name: string; text: string }) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Type your message...' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; text: string }>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim(), attachment);
      setValue('');
      setAttachment(undefined);
    }
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '').slice(0, 24000);
      setAttachment({ name: file.name, text });
    };
    reader.readAsText(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative p-4 bg-card border-t border-border">
      {attachment && (
        <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[260px] truncate">{attachment.name}</span>
          <span className="text-muted-foreground">ready</span>
          <button type="button" onClick={() => setAttachment(undefined)} aria-label="Remove attachment">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.html,.log"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="h-12 w-12 shrink-0 rounded-xl"
        title="Attach a text document"
        data-testid="button-attach-file"
      >
        <Paperclip className="h-5 w-5" />
      </Button>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        data-testid="input-chat-message"
        rows={1}
        className={cn(
          'flex-1 resize-none bg-background border border-input rounded-xl px-4 py-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
          'placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed',
          'max-h-32 overflow-y-auto'
        )}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        data-testid="button-send-message"
        className="rounded-xl w-12 h-12 shrink-0"
      >
        <Send className="w-5 h-5" />
      </Button>
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        Attach .txt, .md, .csv, .json, .html, or .log files for grounded answers.
      </p>
    </div>
  );
}
