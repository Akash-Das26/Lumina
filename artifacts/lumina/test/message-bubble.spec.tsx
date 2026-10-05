import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble, extractImageSrc } from '@/components/message-bubble';

const IMAGE_SRC = 'data:image/png;base64,AAAA';
const IMAGE_CONTENT = `![Generated image](${IMAGE_SRC})`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractImageSrc', () => {
  it('returns the src of a generated-image message', () => {
    expect(extractImageSrc(IMAGE_CONTENT)).toBe(IMAGE_SRC);
  });

  it('returns undefined for non-image content', () => {
    expect(extractImageSrc('just text')).toBeUndefined();
    expect(extractImageSrc('![alt](https://example.com/a.png) trailing')).toBeUndefined();
  });
});

describe('MessageBubble', () => {
  it('renders plain assistant text through the markdown renderer', () => {
    render(<MessageBubble role="assistant" content="hello there" />);
    expect(screen.getByText('hello there')).toBeInTheDocument();
  });

  it('shows the generating state with the given label and no image', () => {
    render(<MessageBubble role="assistant" content="Generating image..." isGenerating />);
    expect(screen.getByText('Generating image...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view generated image/i })).not.toBeInTheDocument();
  });

  it('renders a generated image and opens the lightbox on click', async () => {
    const user = userEvent.setup();
    const onOpenImage = vi.fn();
    render(<MessageBubble role="assistant" content={IMAGE_CONTENT} onOpenImage={onOpenImage} />);

    expect(screen.getByRole('img')).toHaveAttribute('src', IMAGE_SRC);
    await user.click(screen.getByTestId('button-open-image-lightbox'));
    expect(onOpenImage).toHaveBeenCalledTimes(1);
  });

  it('downloads the image via an anchor click', async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<MessageBubble role="assistant" content={IMAGE_CONTENT} />);

    await user.click(screen.getByTestId('button-download-image'));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('names the download after the data URI media type (Audit 2 F-04)', async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const webpContent = `![Generated image](data:image/webp;base64,AAAA)`;
    render(<MessageBubble role="assistant" content={webpContent} />);

    await user.click(screen.getByTestId('button-download-image'));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download.endsWith('.webp')).toBe(true);
  });

  it('maps jpeg data URIs to the .jpg download extension', async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const jpegContent = `![Generated image](data:image/jpeg;base64,AAAA)`;
    render(<MessageBubble role="assistant" content={jpegContent} />);

    await user.click(screen.getByTestId('button-download-image'));
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download.endsWith('.jpg')).toBe(true);
  });

  it('only offers re-generate when a handler is provided', async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const { rerender } = render(<MessageBubble role="assistant" content={IMAGE_CONTENT} />);
    expect(screen.queryByTestId('button-regenerate-image')).not.toBeInTheDocument();

    rerender(<MessageBubble role="assistant" content={IMAGE_CONTENT} onRegenerate={onRegenerate} />);
    await user.click(screen.getByTestId('button-regenerate-image'));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('disables re-generate and shows progress while regenerating', () => {
    render(<MessageBubble role="assistant" content={IMAGE_CONTENT} isRegenerating onRegenerate={() => {}} />);
    const button = screen.getByTestId('button-regenerate-image');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Regenerating');
  });
});
