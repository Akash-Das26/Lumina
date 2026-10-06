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

  it('renders a data:image/webp URI as an img', () => {
    const src = 'data:image/webp;base64,AAAA';
    render(<div>{renderMarkdown(`![webp pic](${src})`)}</div>);
    const img = screen.getByRole('img', { name: 'webp pic' });
    expect(img).toHaveAttribute('src', src);
  });

  it('does not render an img for external image URLs (Audit 3 F-12)', () => {
    render(<div>{renderMarkdown('![tracking](https://example.com/pixel.png)')}</div>);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The line stays visible as plain text rather than silently disappearing.
    expect(screen.getByText(/tracking/)).toBeInTheDocument();
  });

  it('does not render an img for non-image data URIs', () => {
    render(<div>{renderMarkdown('![x](data:text/html;base64,AAAA)')}</div>);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a server-held generated image reference (Audit 3 F-03)', () => {
    const src = '/api/openai/images/12.webp';
    render(<div>{renderMarkdown(`![Generated image](${src})`)}</div>);
    expect(screen.getByRole('img', { name: 'Generated image' })).toHaveAttribute('src', src);
  });

  it('does not render an img for a lookalike path outside the image route', () => {
    render(<div>{renderMarkdown('![x](/api/other/images/12.png)')}</div>);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders blank lines as breaks without dropping content', () => {
    render(<div>{renderMarkdown('first\n\nsecond')}</div>);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });
});
