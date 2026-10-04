import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderMarkdown } from '@/lib/markdown';

describe('renderMarkdown', () => {
  it('renders plain text', () => {
    render(<div>{renderMarkdown('hello world')}</div>);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('renders fenced code blocks verbatim', () => {
    render(<div>{renderMarkdown('```\nconst a = 1;\n```')}</div>);
    expect(screen.getByText('const a = 1;')).toBeInTheDocument();
  });

  it('renders an image markdown line as an img with the given src', () => {
    const src = 'data:image/png;base64,AAAA';
    render(<div>{renderMarkdown(`![alt text](${src})`)}</div>);
    const img = screen.getByRole('img', { name: 'alt text' });
    expect(img).toHaveAttribute('src', src);
  });

  it('renders blank lines as breaks without dropping content', () => {
    render(<div>{renderMarkdown('first\n\nsecond')}</div>);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });
});
