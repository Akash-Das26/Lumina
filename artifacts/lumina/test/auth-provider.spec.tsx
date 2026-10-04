import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth-provider';

const api = vi.hoisted(() => ({
  getAuthMe: vi.fn(),
  logoutAuth: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  getAuthMe: api.getAuthMe,
  logoutAuth: api.logoutAuth,
}));

function Consumer() {
  const { user, status, signOut } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
      <button data-testid="sign-out" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient, invalidateSpy };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider', () => {
  it('resolves to authenticated when /auth/me returns a user', async () => {
    api.getAuthMe.mockResolvedValue({ id: 1, email: 'ada@test.dev', name: 'Ada' });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('email')).toHaveTextContent('ada@test.dev');
  });

  it('treats a 401 as signed out', async () => {
    api.getAuthMe.mockRejectedValue({ status: 401 });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('email')).toHaveTextContent('none');
  });

  it('ends up signed out (not stuck loading) when /auth/me fails unexpectedly', async () => {
    api.getAuthMe.mockRejectedValue({ status: 500 });
    renderProvider();

    await waitFor(() => expect(api.getAuthMe).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('signOut calls the logout endpoint, clears the user, and invalidates caches', async () => {
    const user = userEvent.setup();
    const account = { id: 1, email: 'ada@test.dev', name: 'Ada' };
    // After logout the session cookie is gone, so /auth/me starts returning 401.
    let signedIn = true;
    api.getAuthMe.mockImplementation(() =>
      signedIn ? Promise.resolve(account) : Promise.reject({ status: 401 }),
    );
    api.logoutAuth.mockImplementation(async () => {
      signedIn = false;
    });
    const { invalidateSpy } = renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    await user.click(screen.getByTestId('sign-out'));

    await waitFor(() => expect(api.logoutAuth).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
