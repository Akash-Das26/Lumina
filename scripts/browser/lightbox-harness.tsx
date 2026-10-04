// Browser-verification harness for the ImageLightbox.
//
// Bundled by scripts/browser/verify-lightbox.mjs (esbuild) and served to a
// headless Chrome that is driven over the DevTools Protocol. It mounts the
// real component so interactions are exercised exactly as they ship, and
// exposes small hooks on `window` for the driver to read state and change the
// displayed image.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageLightbox } from '@/components/image-lightbox';

function svg(fill: string, w: number, h: number): string {
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(body)}`;
}

// 400x300 fixtures keep the pan-clamp maths obvious: max offset per axis is
// imageSize * (zoom - 1) / 2.
const IMAGES = [
  { src: svg('#cccccc', 400, 300) },
  { src: svg('#888888', 400, 300) },
  { src: svg('#444444', 400, 300) },
];

declare global {
  interface Window {
    __log: { closed: number; indexChanges: number[] };
    __setIndex: (index: number | null) => void;
    __pointers: { type: string; pointerType: string }[];
  }
}

window.__log = { closed: 0, indexChanges: [] };
window.__pointers = [];

// Record the pointer events the lightbox stage receives so the driver can
// confirm touch input really arrives as touch pointer events.
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
  document.addEventListener(
    type,
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-testid="image-lightbox-stage"]')) {
        window.__pointers.push({ type: event.type, pointerType: (event as PointerEvent).pointerType });
      }
    },
    true,
  );
}

function App() {
  const [index, setIndex] = useState<number | null>(0);
  window.__setIndex = setIndex;
  return (
    <ImageLightbox
      images={IMAGES}
      index={index}
      onIndexChange={(i) => {
        // Mirror the app: the shared lightbox is controlled, so a navigation
        // request actually switches the displayed image.
        window.__log.indexChanges.push(i);
        setIndex(i);
      }}
      onClose={() => {
        window.__log.closed += 1;
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
