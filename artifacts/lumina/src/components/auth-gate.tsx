import type { ReactNode } from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/lib/auth-provider';

/**
 * Wraps authenticated routes: shows a loading state while the session is
 * being validated and redirects signed-out visitors to /sign-in.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect to="/sign-in" />;
  }

  return <>{children}</>;
}
