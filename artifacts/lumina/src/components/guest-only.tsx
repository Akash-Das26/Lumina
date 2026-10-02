import type { ReactNode } from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/lib/auth-provider';

/**
 * Wraps guest pages (sign-in / sign-up): signed-in visitors are redirected to
 * /chat, everyone else sees the page.
 */
export default function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Redirect to="/chat" />;
  }

  return <>{children}</>;
}
