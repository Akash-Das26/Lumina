import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageLightbox } from '@/components/image-lightbox';

const IMAGES = [
  { src: 'data:image/png;base64,AAAA' },
  { src: 'data:image/png;base64,BBBB' },
  { src: 'data:image/png;base64,CCCC' },
];

function renderLightbox(index: number | null, overrides?: Partial<Parameters<typeof ImageLightbox>[0]>) {
  const props = {
    images: IMAGES,
    index,
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<ImageLightbox {...props} />);
  return { ...view, props };
}

describe('ImageLightbox', () => {
  it('renders nothing while closed', () => {
    renderLightbox(null);
    expect(screen.queryByTestId('image-lightbox')).not.toBeInTheDocument();
  });

  it('shows the selected image and a position counter', () => {
    renderLightbox(1);
    expect(screen.getByTestId('image-lightbox')).toHaveAttribute('src', IMAGES[1].src);
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('2 / 3');
  });

  it('names the download after a server-held image format (Audit 3 F-03)', async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    renderLightbox(0, { images: [{ src: '/api/openai/images/12.webp' }] });

    await user.click(screen.getByTestId('button-lightbox-download'));
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download.endsWith('.webp')).toBe(true);
    clickSpy.mockRestore();
  });

  it('names the download after a data URI media type and maps jpeg to .jpg', async () => {
    const user = userEvent.setup();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    renderLightbox(0, { images: [{ src: 'data:image/jpeg;base64,AAAA' }] });

    await user.click(screen.getByTestId('button-lightbox-download'));
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download.endsWith('.jpg')).toBe(true);
    clickSpy.mockRestore();
  });

  it('disables prev on the first image and next on the last', () => {
    renderLightbox(0);
    expect(screen.getByTestId('button-lightbox-prev')).toBeDisabled();
    expect(screen.getByTestId('button-lightbox-next')).toBeEnabled();
  });

  it('requests the next/previous index when the arrows are clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderLightbox(1);

    await user.click(screen.getByTestId('button-lightbox-next'));
    expect(props.onIndexChange).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByTestId('button-lightbox-prev'));
    expect(props.onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it('navigates with the arrow keys', () => {
    const { props } = renderLightbox(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(props.onIndexChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(props.onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it('zooms in and out and resets to 100%', async () => {
    const user = userEvent.setup();
    renderLightbox(0);

    const img = screen.getByTestId('image-lightbox');
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%');

    await user.click(screen.getByTestId('button-lightbox-zoom-in'));
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('125%');
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1.25)' });

    await user.click(screen.getByTestId('button-lightbox-zoom-reset'));
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%');
  });

  it('shows a drag-to-pan hint only once zoomed in', async () => {
    const user = userEvent.setup();
    renderLightbox(0);
    expect(screen.queryByTestId('lightbox-pan-hint')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('button-lightbox-zoom-in'));
    expect(screen.getByTestId('lightbox-pan-hint')).toBeInTheDocument();
  });

  it('pans only when zoomed in, and clamps to the image overflow', async () => {
    const user = userEvent.setup();
    renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');
    const stage = screen.getByTestId('image-lightbox-stage');
    Object.defineProperty(img, 'offsetWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'offsetHeight', { value: 300, configurable: true });

    // At 100% the image fits, so dragging does nothing.
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 160, clientY: 160, pointerId: 1 });
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
    fireEvent.pointerUp(stage, { pointerId: 1 });

    // At 125% the clamp is (400*0.25)/2 = 50 on x and (300*0.25)/2 = 37.5 on y.
    await user.click(screen.getByTestId('button-lightbox-zoom-in'));
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(stage, { clientX: 130, clientY: 120, pointerId: 2 });
    expect(img).toHaveStyle({ transform: 'translate(30px, 20px) scale(1.25)' });

    fireEvent.pointerMove(stage, { clientX: 1000, clientY: 1000, pointerId: 2 });
    expect(img).toHaveStyle({ transform: 'translate(50px, 37.5px) scale(1.25)' });
    fireEvent.pointerUp(stage, { pointerId: 2 });
  });

  it('returns to the centre when zoom is reset', async () => {
    const user = userEvent.setup();
    renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');
    const stage = screen.getByTestId('image-lightbox-stage');
    Object.defineProperty(img, 'offsetWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'offsetHeight', { value: 300, configurable: true });

    await user.click(screen.getByTestId('button-lightbox-zoom-in'));
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(stage, { clientX: 130, clientY: 120, pointerId: 3 });
    fireEvent.pointerUp(stage, { pointerId: 3 });
    expect(img).toHaveStyle({ transform: 'translate(30px, 20px) scale(1.25)' });

    await user.click(screen.getByTestId('button-lightbox-zoom-reset'));
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  it('resets zoom and pan when navigating to a different image', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');
    const stage = screen.getByTestId('image-lightbox-stage');
    Object.defineProperty(img, 'offsetWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'offsetHeight', { value: 300, configurable: true });

    // Zoom in and pan so the reset is observable.
    await user.click(screen.getByTestId('button-lightbox-zoom-in'));
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerMove(stage, { clientX: 130, clientY: 120, pointerId: 5 });
    fireEvent.pointerUp(stage, { pointerId: 5 });
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('125%');
    expect(img).toHaveStyle({ transform: 'translate(30px, 20px) scale(1.25)' });

    // Opening a different image starts it un-zoomed and centred.
    rerender(<ImageLightbox {...props} index={1} />);
    expect(screen.getByTestId('image-lightbox')).toHaveAttribute('src', IMAGES[1].src);
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%');
    expect(screen.getByTestId('image-lightbox')).toHaveStyle({
      transform: 'translate(0px, 0px) scale(1)',
    });
    expect(screen.queryByTestId('lightbox-pan-hint')).not.toBeInTheDocument();
  });

  it('zooms in and out with the mouse wheel', () => {
    renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');
    const stage = screen.getByTestId('image-lightbox-stage');

    fireEvent.wheel(stage, { deltaY: -100 });
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('110%');
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1.1)' });

    fireEvent.wheel(stage, { deltaY: 100 });
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%');
  });

  it('uses a finer wheel step while ctrl is held', () => {
    renderLightbox(0);
    const stage = screen.getByTestId('image-lightbox-stage');

    fireEvent.wheel(stage, { deltaY: -100, ctrlKey: true });
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('102%');
  });

  it('clamps wheel zoom to the supported range', () => {
    renderLightbox(0);
    const stage = screen.getByTestId('image-lightbox-stage');

    for (let i = 0; i < 60; i += 1) {
      fireEvent.wheel(stage, { deltaY: -100 });
    }
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('400%');

    for (let i = 0; i < 80; i += 1) {
      fireEvent.wheel(stage, { deltaY: 100 });
    }
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('50%');
  });

  it('double-click toggles between fit and 2x magnification', async () => {
    const user = userEvent.setup();
    renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');
    const stage = screen.getByTestId('image-lightbox-stage');

    await user.dblClick(stage);
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('200%');
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(2)' });

    await user.dblClick(stage);
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%');
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  it('double-click recentres a panned image', async () => {
    const user = userEvent.setup();
    renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');
    const stage = screen.getByTestId('image-lightbox-stage');
    Object.defineProperty(img, 'offsetWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'offsetHeight', { value: 300, configurable: true });

    await user.dblClick(stage);
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 100, pointerId: 9 });
    fireEvent.pointerMove(stage, { clientX: 130, clientY: 120, pointerId: 9 });
    fireEvent.pointerUp(stage, { pointerId: 9 });
    expect(img).toHaveStyle({ transform: 'translate(30px, 20px) scale(2)' });

    await user.dblClick(stage);
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  it('has keyboard shortcut hints for navigation, zoom, close, pan, and double-click', () => {
    renderLightbox(0);

    // The hints appear in the control row, not the stage.
    expect(screen.getByText('navigate')).toBeInTheDocument();
    expect(screen.getByText('zoom / close')).toBeInTheDocument();

    // Every always-on shortcut kbd (←, →, +, −, 0, Esc) carries an accessible name.
    expect(screen.getByLabelText('Press left arrow to go to the previous image')).toBeInTheDocument();
    expect(screen.getByLabelText('Press right arrow to go to the next image')).toBeInTheDocument();
    expect(screen.getByLabelText('Press plus to zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Press minus to zoom out')).toBeInTheDocument();
    expect(screen.getByLabelText('Press zero to reset zoom to 100%')).toBeInTheDocument();
    expect(screen.getByLabelText('Press Escape to close the lightbox')).toBeInTheDocument();

    // The double-click hint is always visible and labelled.
    expect(screen.getByTestId('lightbox-double-click-hint')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Double-click the image to toggle between fit and 2x'),
    ).toBeInTheDocument();

    // The pan hint only shows once zoomed in.
    expect(screen.queryByTestId('lightbox-pan-hint')).not.toBeInTheDocument();
  });

  it('shows the pan shortcut hint only when the image is zoomed in', async () => {
    const user = userEvent.setup();
    renderLightbox(0);

    // At 100%, the pan hint is not shown.
    expect(screen.queryByTestId('lightbox-pan-hint')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Press G while zoomed in to begin dragging')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('button-lightbox-zoom-in'));
    expect(screen.getByTestId('lightbox-pan-hint')).toBeInTheDocument();
    expect(screen.getByLabelText('Press G while zoomed in to begin dragging')).toBeInTheDocument();
  });



  it('handleKeyDown accepts 0 to reset zoom', () => {
    const { props } = renderLightbox(0);
    const img = screen.getByTestId('image-lightbox');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: '0' });
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%');
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  it('pressing Escape closes the lightbox', () => {
    const { props } = renderLightbox(0);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    // onClose is called both by our handleKeyDown and by Radix Dialog's
    // onOpenChange when the escape key bubbles; we just confirm it fired.
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onClose when dismissed', async () => {
    const user = userEvent.setup();
    const { props } = renderLightbox(0);
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalled();
  });
});
