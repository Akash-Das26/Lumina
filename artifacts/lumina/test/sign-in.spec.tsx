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

  it('shows inline messages (never raw Zod output) for an invalid email and short password', async () => {
    renderSignIn();

    await fillAndSubmit('bbjhbvb@ewfw', '123456');

    expect(await screen.findByTestId('email-error')).toHaveTextContent(
      'Please enter a valid email address (e.g. name@example.com)',
    );
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Password must be at least 8 characters',
    );
    expect(mocks.loginAuth).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-in-error')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/invalid_format|too_small|"code"/);
  });

  it('shows a message under each field for an empty form without calling the API', async () => {
    renderSignIn();

    await userEvent.setup().click(screen.getByTestId('button-sign-in'));

    expect(await screen.findByTestId('email-error')).toHaveTextContent(
      'Please enter a valid email address (e.g. name@example.com)',
    );
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Password must be at least 8 characters',
    );
    expect(mocks.loginAuth).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the user edits that field', async () => {
    renderSignIn();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('button-sign-in'));
    expect(await screen.findByTestId('email-error')).toBeInTheDocument();

    await user.type(screen.getByTestId('input-email'), 'ada@test.dev');

    expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('password-error')).toBeInTheDocument();
  });

  it('renders server-returned field errors inline instead of a banner', async () => {
    mocks.loginAuth.mockRejectedValue({
      status: 400,
      data: {
        error: 'Validation failed',
        fieldErrors: { password: ['Password must be at least 8 characters'] },
        formErrors: [],
      },
    });
    renderSignIn();

    await fillAndSubmit();

    expect(await screen.findByTestId('password-error')).toHaveTextContent(
      'Password must be at least 8 characters',
    );
    expect(screen.queryByTestId('sign-in-error')).not.toBeInTheDocument();
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
