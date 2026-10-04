import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthGate from '@/components/auth-gate';

const authState = vi.hoisted(() => ({
  status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated',
}));

vi.mock('@/lib/auth-provider', () => ({ useAuth: () => authState }));
vi.mock('wouter', () => ({
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

describe('AuthGate', () => {
  it('shows a loading state while the session is being checked', () => {
    authState.status = 'loading';
    render(
      <AuthGate>
        <p>protected</p>
      </AuthGate>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders the protected content when authenticated', () => {
    authState.status = 'authenticated';
    render(
      <AuthGate>
        <p>protected</p>
      </AuthGate>,
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
    expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
  });

  it('redirects to /sign-in when unauthenticated', () => {
    authState.status = 'unauthenticated';
    render(
      <AuthGate>
        <p>protected</p>
      </AuthGate>,
    );
    expect(screen.getByTestId('redirect')).toHaveTextContent('/sign-in');
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });
});
