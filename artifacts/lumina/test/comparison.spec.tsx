import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComparisonPage from '@/pages/comparison';

// Mutable wouter params so each test picks the slug the route would supply.
const route = vi.hoisted(() => ({
  params: { slug: 'monica' } as Record<string, string | undefined>,
}));

vi.mock('wouter', () => ({
  useParams: () => route.params,
  Link: ({
    children,
    href,
    ...rest
  }: {
    children?: unknown;
    href?: string;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  route.params = { slug: 'monica' };
  document.title = '';
});

describe('/compare/:slug (Audit 4 A2 / BUG-017)', () => {
  it('renders the matching comparison and its SEO title for a valid slug', () => {
    route.params = { slug: 'monica' };
    render(<ComparisonPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Lumina vs Monica/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('404 — Not Found')).not.toBeInTheDocument();
    expect(document.title).toContain('Lumina vs Monica');
  });

  it('renders a 404 for an unknown slug instead of silently showing Monica', () => {
    route.params = { slug: 'not-a-real-tool' };
    render(<ComparisonPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: '404 — Not Found' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Lumina vs Monica/)).not.toBeInTheDocument();
  });

  it('renders the same 404 when the route supplies no slug at all', () => {
    route.params = {};
    render(<ComparisonPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: '404 — Not Found' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('404 — Not Found');
  });
});