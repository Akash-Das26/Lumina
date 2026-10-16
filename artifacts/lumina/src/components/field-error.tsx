import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * BUG-012: the single inline error slot rendered under a form input. Keeping it
 * in one component means every form wires `aria-describedby` to a real element
 * and styles the message the same way.
 */
export function FieldError({
  id,
  message,
  className,
  ...props
}: { id: string; message?: string } & Omit<ComponentProps<'p'>, 'id' | 'children'>) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className={cn('text-sm text-destructive', className)} {...props}>
      {message}
    </p>
  );
}
