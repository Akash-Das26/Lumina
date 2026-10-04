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

  it('shows the API error message and stays put on failure', async () => {
    mocks.registerAuth.mockRejectedValue({ data: { error: 'Email already registered' } });
    renderSignUp();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('sign-up-error')).toHaveTextContent('Email already registered'),
    );
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error has no detail', async () => {
    mocks.registerAuth.mockRejectedValue(new Error('network down'));
    renderSignUp();

    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('sign-up-error')).toHaveTextContent(
        'Unable to create your account. Please try again.',
      ),
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
});
