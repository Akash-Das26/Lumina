import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SignUp from '@/pages/sign-up';

const mocks = vi.hoisted(() => ({ registerAuth: vi.fn(), setLocation: vi.fn() }));

vi.mock('@workspace/api-client-react', () => ({ registerAuth: mocks.registerAuth }));
vi.mock('wouter', () => ({
  useLocation: () => ['/sign-up', mocks.setLocation],
  Link: ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));
vi.mock('@/lib/seo', () => ({ useSeo: () => {} }));

afterEach(() => {
  vi.clearAllMocks();
});

function renderSignUp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SignUp />
    </QueryClientProvider>,
  );
  return { queryClient };
}

async function fillAndSubmit(
  name = 'Ada Lovelace',
  email = 'ada@test.dev',
  password = 'password123',
) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('input-name'), name);
  await user.type(screen.getByTestId('input-email'), email);
  await user.type(screen.getByTestId('input-password'), password);
  await user.click(screen.getByTestId('button-sign-up'));
}

describe('SignUp', () => {
  it('renders the account fields', () => {
    renderSignUp();
    expect(screen.getByTestId('input-name')).toBeInTheDocument();
    expect(screen.getByTestId('input-email')).toBeInTheDocument();
    expect(screen.getByTestId('input-password')).toBeInTheDocument();
    expect(screen.getByTestId('button-sign-up')).toHaveTextContent('Create Account');
  });

  it('registers, seeds the auth cache, and navigates to /chat', async () => {
    const user = { id: 1, email: 'ada@test.dev', name: 'Ada Lovelace' };
    mocks.registerAuth.mockResolvedValue(user);
    const { queryClient } = renderSignUp();

    await fillAndSubmit();

    await waitFor(() =>
      expect(mocks.registerAuth).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'ada@test.dev',
        password: 'password123',
      }),
    );
    expect(mocks.setLocation).toHaveBeenCalledWith('/chat');
    expect(queryClient.getQueryData(['auth', 'me'])).toEqual(user);
  });

  it('tells the user to sign in when the email is already registered (409)', async () => {
    mocks.registerAuth.mockRejectedValue({
      status: 409,
      data: { error: 'An account with this email already exists' },
    });
    renderSignUp();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('sign-up-error')).toHaveTextContent(
        'An account with this email already exists. Try signing in.',
      ),
    );
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });

  it('says the server is unreachable when the request never arrives (BUG-013)', async () => {
    mocks.registerAuth.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSignUp();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('sign-up-error')).toHaveTextContent(
        "Can't reach the server. Check your connection and try again.",
      ),
    );
  });

  it('keeps the generic message for a server-side failure (500)', async () => {
    mocks.registerAuth.mockRejectedValue({
      status: 500,
      data: { error: 'Internal server error' },
    });
    renderSignUp();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('sign-up-error')).toHaveTextContent(
        'Unable to create your account. Please try again.',
      ),
    );
    // Nothing about the internals (or an HTML error page) reaches the banner.
    expect(screen.getByTestId('sign-up-error').textContent ?? '').not.toMatch(
      /Internal server error|<html|at |\.ts:/,
    );
  });

  it('disables the submit button while the request is pending', async () => {
    let resolveRegister: (value: unknown) => void = () => {};
    mocks.registerAuth.mockImplementation(
      () => new Promise((resolve) => { resolveRegister = resolve; }),
    );
    renderSignUp();

    await fillAndSubmit();

    const button = screen.getByTestId('button-sign-up');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Creating account…');

    resolveRegister({ id: 1, email: 'ada@test.dev', name: 'Ada Lovelace' });
    await waitFor(() => expect(mocks.setLocation).toHaveBeenCalledWith('/chat'));
  });

  it('links to the sign-in page', () => {
    renderSignUp();
    expect(screen.getByTestId('link-sign-in')).toHaveAttribute('href', '/sign-in');
  });

  it('shows inline messages (never raw Zod output) for an invalid email and short password', async () => {
    renderSignUp();

    await fillAndSubmit('Ada Lovelace', 'bbjhbvb@ewfw', '123456');

    expect(await screen.findByTestId('email-error')).toHaveTextContent(
      'Please enter a valid email address (e.g. name@example.com)',
    );
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Password must be at least 8 characters',
    );
    // No network request for a client-side failure, and no banner.
    expect(mocks.registerAuth).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sign-up-error')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(
      /invalid_format|too_small|"code"|origin|\/\(\?!/,
    );
  });

  it('shows a message under each field for an empty form without calling the API', async () => {
    renderSignUp();

    await userEvent.setup().click(screen.getByTestId('button-sign-up'));

    expect(await screen.findByTestId('name-error')).toHaveTextContent('Please enter your name');
    expect(screen.getByTestId('email-error')).toHaveTextContent(
      'Please enter a valid email address (e.g. name@example.com)',
    );
    expect(screen.getByTestId('password-error')).toHaveTextContent(
      'Password must be at least 8 characters',
    );
    expect(mocks.registerAuth).not.toHaveBeenCalled();
  });

  it('wires the inline error to its input for assistive technology', async () => {
    renderSignUp();

    await fillAndSubmit('Ada Lovelace', 'bbjhbvb@ewfw', 'password123');

    const email = await screen.findByTestId('input-email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByTestId('email-error')).toHaveAttribute('id', 'email-error');
    expect(screen.getByTestId('input-password')).toHaveAttribute('aria-invalid', 'false');
  });

  it('validates a field when the user leaves it, before any submit', async () => {
    renderSignUp();

    const user = userEvent.setup();
    await user.type(screen.getByTestId('input-email'), 'nope');
    await user.tab();

    expect(await screen.findByTestId('email-error')).toHaveTextContent(
      'Please enter a valid email address (e.g. name@example.com)',
    );
    expect(mocks.registerAuth).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the user edits that field', async () => {
    renderSignUp();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('button-sign-up'));
    expect(await screen.findByTestId('name-error')).toBeInTheDocument();

    await user.type(screen.getByTestId('input-name'), 'Ada');

    expect(screen.queryByTestId('name-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('email-error')).toBeInTheDocument();
  });

  it('renders server-returned field errors inline instead of a banner', async () => {
    mocks.registerAuth.mockRejectedValue({
      status: 400,
      data: {
        error: 'Validation failed',
        fieldErrors: { email: ['Please enter a valid email address (e.g. name@example.com)'] },
        formErrors: [],
      },
    });
    renderSignUp();

    await fillAndSubmit();

    expect(await screen.findByTestId('email-error')).toHaveTextContent(
      'Please enter a valid email address (e.g. name@example.com)',
    );
    expect(screen.queryByTestId('sign-up-error')).not.toBeInTheDocument();
  });
});
