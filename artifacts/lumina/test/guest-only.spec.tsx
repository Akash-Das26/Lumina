import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuestOnly from '@/components/guest-only';

const authState = vi.hoisted(() => ({
  status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated',
}));

vi.mock('@/lib/auth-provider', () => ({ useAuth: () => authState }));
vi.mock('wouter', () => ({
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

describe('GuestOnly', () => {
  it('shows a loading state while the session is being checked', () => {
    authState.status = 'loading';
    render(
      <GuestOnly>
        <p>sign-in form</p>
      </GuestOnly>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('sign-in form')).not.toBeInTheDocument();
  });

  it('renders guest content when unauthenticated', () => {
    authState.status = 'unauthenticated';
    render(
      <GuestOnly>
        <p>sign-in form</p>
      </GuestOnly>,
    );
    expect(screen.getByText('sign-in form')).toBeInTheDocument();
  });

  it('redirects signed-in users to /chat', () => {
    authState.status = 'authenticated';
    render(
      <GuestOnly>
        <p>sign-in form</p>
      </GuestOnly>,
    );
    expect(screen.getByTestId('redirect')).toHaveTextContent('/chat');
    expect(screen.queryByText('sign-in form')).not.toBeInTheDocument();
  });
});
