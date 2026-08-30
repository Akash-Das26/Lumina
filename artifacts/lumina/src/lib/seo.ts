import { useEffect } from 'react';

type SeoProps = {
  title: string;
  description: string;
  path: string;
  jsonLd?: unknown;
};

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export function useSeo({ title, description, path, jsonLd }: SeoProps) {
  useEffect(() => {
    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:url', window.location.origin + path);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:card', 'summary');

    const existing = document.head.querySelector('script[data-lumina-jsonld]');
    existing?.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.luminaJsonld = 'true';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.head.querySelector('script[data-lumina-jsonld]')?.remove();
    };
  }, [title, description, path, jsonLd]);
}