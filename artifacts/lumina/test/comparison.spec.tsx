// @vitest-environment jsdom
// BUG-018 / Audit 4 A4: the comparison page's external anchors (vendor site,
// reference link) must be http(s)-only and carry rel="noopener noreferrer".
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComparisonPage from '@/pages/comparison';

const slug = vi.hoisted(() => ({ value: 'chatgpt' }));

vi.mock('@/lib/seo', () => ({ useSeo: () => {} }));
vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wouter')>();
  return { ...actual, useParams: () => ({ slug: slug.value }) };
});

describe('comparison page external links (BUG-018 / Audit 4 A4)', () => {
  it('opens the vendor site with noopener noreferrer', () => {
    slug.value = 'chatgpt';
    render(<ComparisonPage />);

    const vendor = screen.getByRole('link', { name: /visit chatgpt/i });
    expect(vendor).toHaveAttribute('target', '_blank');
    const rel = vendor.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(vendor.getAttribute('href')).toMatch(/^https:\/\//);
  });

  it('opens the reference link with noopener noreferrer', () => {
    slug.value = 'chatgpt';
    render(<ComparisonPage />);

    const reference = screen.getByRole('link', { name: /reference:/i });
    const rel = reference.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(reference.getAttribute('href')).toMatch(/^https:\/\//);
  });
});
