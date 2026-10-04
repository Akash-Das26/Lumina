import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { ChevronLeft, ChevronRight, Download, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
// Wheel zoom is finer than the buttons so a trackpad does not leap past a
// useful zoom level in a single gesture.
const WHEEL_ZOOM_STEP = 0.1;
const WHEEL_ZOOM_STEP_FINE = 0.02;

interface ImageLightboxProps {
  images: { src: string }[];
  /** Index of the image to show, or null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

type Pan = { x: number; y: number };

/**
 * Full-size viewer for generated images. A single instance lives in the chat
 * page so it can page through every image in the conversation, rather than one
 * dialog per message. Supports zoom and (when zoomed in) drag-to-pan.
 */
export function ImageLightbox({ images, index, onIndexChange, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const wheelCleanup = useRef<(() => void) | null>(null);
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index as number] : undefined;
  const pannable = zoom > 1;

  // A new image always starts un-zoomed and centred.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  // Keep the pan inside the area the scaled image can actually travel: at most
  // half the overflow in each axis, so an edge never detaches from the frame.
  const clampPan = (next: Pan, zoomLevel: number): Pan => {
    const img = imgRef.current;
    if (!img) return next;
    const maxX = Math.max(0, (img.offsetWidth * (zoomLevel - 1)) / 2);
    const maxY = Math.max(0, (img.offsetHeight * (zoomLevel - 1)) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const applyZoom = (next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))));
    setZoom(clamped);
    setPan((p) => clampPan(p, clamped));
  };

  const zoomBy = (delta: number) => applyZoom(zoom + delta);

  // Double-click toggles between fit and a 2x magnification; a second
  // double-click resets to 100% (which also recentres via clampPan).
  const handleDoubleClick = () => applyZoom(zoom === 1 ? 2 : 1);

  // Wheel zoom needs a non-passive listener (React's synthetic onWheel is
  // passive) so the page behind the dialog does not scroll while zooming. A
  // callback ref is used because Radix mounts the dialog contents a commit
  // after the first render, so a mount effect would find no node.
  const setStageRef = useCallback((node: HTMLDivElement | null) => {
    wheelCleanup.current?.();
    wheelCleanup.current = null;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const step = event.ctrlKey ? WHEEL_ZOOM_STEP_FINE : WHEEL_ZOOM_STEP;
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoom((current) => {
        const clamped = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, Number((current + direction * step).toFixed(2))),
        );
        setPan((p) => clampPan(p, clamped));
        return clamped;
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    wheelCleanup.current = () => node.removeEventListener('wheel', onWheel);
  }, []);

  const goTo = (next: number) => onIndexChange(Math.max(0, Math.min(images.length - 1, next)));

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo((index ?? 0) - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo((index ?? 0) + 1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomBy(-ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      applyZoom(1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'g' || event.key === 'G') {
      // nop — pan is pointer-driven; reserved so the hint reads "G".
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!pannable) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const moved = {
      x: drag.current.originX + (event.clientX - drag.current.startX),
      y: drag.current.originY + (event.clientY - drag.current.startY),
    };
    setPan(clampPan(moved, zoom));
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const handleDownload = () => {
    if (!current) return;
    const link = document.createElement('a');
    link.href = current.src;
    link.download = `lumina-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="max-w-[95vw] p-2 sm:max-w-5xl sm:p-3"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Generated image</DialogTitle>
          <DialogDescription>
            Full-size preview with navigation, zoom, drag-to-pan, and keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        {current && (
          <>
            <div
              ref={setStageRef}
              className={cn(
                'flex items-center justify-center overflow-hidden rounded-lg bg-muted/20 select-none',
                pannable && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
              )}
              style={{ maxHeight: '78vh', touchAction: pannable ? 'none' : 'auto' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerLeave={endDrag}
              onDoubleClick={handleDoubleClick}
              data-testid="image-lightbox-stage"
            >
              <img
                ref={imgRef}
                src={current.src}
                alt="Generated image full size"
                draggable={false}
                className={cn('origin-center', !dragging && 'transition-transform duration-150')}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  maxWidth: '100%',
                  maxHeight: '72vh',
                }}
                data-testid="image-lightbox"
              />
            </div>          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <kbd
                    className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-[11px] font-medium text-foreground shadow-sm"
                    aria-label="Press left arrow to go to the previous image"
                  >
                    ←
                  </kbd>
                  <kbd
                    className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-[11px] font-medium text-foreground shadow-sm"
                    aria-label="Press right arrow to go to the next image"
                  >
                    →
                  </kbd>
                  <span className="text-muted-foreground">navigate</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <kbd
                    className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-[11px] font-medium text-foreground shadow-sm"
                    aria-label="Press plus to zoom in"
                  >
                    +
                  </kbd>
                  <kbd
                    className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-[11px] font-medium text-foreground shadow-sm"
                    aria-label="Press minus to zoom out"
                  >
                    −
                  </kbd>
                  <kbd
                    className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-[11px] font-medium text-foreground shadow-sm"
                    aria-label="Press zero to reset zoom to 100%"
                  >
                    0
                  </kbd>
                  <kbd
                    className="inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-[11px] font-medium text-foreground shadow-sm"
                    aria-label="Press Escape to close the lightbox"
                  >
                    Esc
                  </kbd>
                  <span className="text-muted-foreground">zoom / close</span>
                </div>
                <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goTo((index ?? 0) - 1)}
                  disabled={(index ?? 0) <= 0}
                  aria-label="Previous image"
                  data-testid="button-lightbox-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span
                  className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground"
                  data-testid="lightbox-counter"
                >
                  {(index ?? 0) + 1} / {images.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goTo((index ?? 0) + 1)}
                  disabled={(index ?? 0) >= images.length - 1}
                  aria-label="Next image"
                  data-testid="button-lightbox-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                {pannable && (
                  <span
                    className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex"
                    data-testid="lightbox-pan-hint"
                  >
                    <Move className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground">Drag to pan</span>
                    <kbd
                      className="ml-1 inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-muted px-0.5 font-[10px] text-foreground shadow-sm"
                      aria-label="Press G while zoomed in to begin dragging"
                    >
                      <span className="text-[9px]">G</span>
                    </kbd>
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                  data-testid="lightbox-double-click-hint"
                >
                  <span className="text-muted-foreground">Double-click</span>
                  <kbd
                    className="inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-muted px-0.5 font-[10px] text-foreground shadow-sm"
                    aria-label="Double-click the image to toggle between fit and 2x"
                  >
                    <span className="text-[9px]">↻</span>
                  </kbd>
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => zoomBy(-ZOOM_STEP)}
                  disabled={zoom <= MIN_ZOOM}
                  aria-label="Zoom out"
                  data-testid="button-lightbox-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span
                  className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted-foreground"
                  data-testid="lightbox-zoom"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => zoomBy(ZOOM_STEP)}
                  disabled={zoom >= MAX_ZOOM}
                  aria-label="Zoom in"
                  data-testid="button-lightbox-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => applyZoom(1)}
                  disabled={zoom === 1}
                  data-testid="button-lightbox-zoom-reset"
                >
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handleDownload}
                  data-testid="button-lightbox-download"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
