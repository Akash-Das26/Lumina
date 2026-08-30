import { MODES, ModeKey } from '@/lib/modes';
import { cn } from '@/lib/utils';

interface ModeSelectorProps {
  selected: ModeKey;
  onChange: (mode: ModeKey) => void;
  className?: string;
}

export function ModeSelector({ selected, onChange, className }: ModeSelectorProps) {
  return (
    <div className={cn('flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50', className)}>
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isSelected = selected === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            data-testid={`mode-${mode.id}`}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
