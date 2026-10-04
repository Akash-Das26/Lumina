import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SignIn from '@/pages/sign-in';

const mocks = vi.hoisted(() => ({ loginAuth: vi.fn(), setLocation: vi.fn() }));

vi.mock('@workspace/api-client-react', () => ({ loginAuth: mocks.loginAuth }));
vi.mock('wouter', () => ({
  useLocation: () => ['/sign-in', mocks.setLocation],
  Link: ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));
vi.mock('@/lib/seo', () => ({ useSeo: () => {} }));

afterEach(() => {
  vi.clearAllMocks();
});

function renderSignIn() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SignIn />
    </QueryClientProvider>,
  );
  return { queryClient };
}

async function fillAndSubmit(email = 'ada@test.dev', password = 'password123') {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('input-email'), email);
  await user.type(screen.getByTestId('input-password'), password);
  await user.click(screen.getByTestId('button-sign-in'));
}

describe('SignIn', () => {
  it('renders the credential fields', () => {
    renderSignIn();
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
    expect(screen.getByTestId('input-password')).toBeInTheDocument();
    expect(screen.getByTestId('button-sign-in')).toHaveTextContent('Sign In');
  });

  it('signs in, seeds the auth cache, and navigates to /chat', async () => {
    const user = { id: 1, email: 'ada@test.dev', name: 'Ada' };
    mocks.loginAuth.mockResolvedValue(user);
    const { queryClient } = renderSignIn();

    await fillAndSubmit();

    await waitFor(() =>
      expect(mocks.loginAuth).toHaveBeenCalledWith({
        email: 'ada@test.dev',
        password: 'password123',
      }),
    );
    expect(mocks.setLocation).toHaveBeenCalledWith('/chat');
    expect(queryClient.getQueryData(['auth', 'me'])).toEqual(user);
  });

  it('shows the API error message and stays put on failure', async () => {
    mocks.loginAuth.mockRejectedValue({ data: { error: 'Invalid email or password' } });
    renderSignIn();

    await fillAndSubmit('ada@test.dev', 'wrongpassword');

    await waitFor(() =>
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent('Invalid email or password'),
    );
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error has no detail', async () => {
    mocks.loginAuth.mockRejectedValue(new Error('network down'));
    renderSignIn();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent(
        'Unable to sign in. Please try again.',
      ),
    );
  });

  it('disables the submit button while the request is pending', async () => {
    let resolveLogin: (value: unknown) => void = () => {};
    mocks.loginAuth.mockImplementation(
      () => new Promise((resolve) => { resolveLogin = resolve; }),
    );
    renderSignIn();

    await fillAndSubmit();

    const button = screen.getByTestId('button-sign-in');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Signing in…');

    resolveLogin({ id: 1, email: 'ada@test.dev', name: 'Ada' });
    await waitFor(() => expect(mocks.setLocation).toHaveBeenCalledWith('/chat'));
  });
});
