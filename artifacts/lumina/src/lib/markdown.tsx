/**
 * The single allowlist for image sources rendered inside a message
 * (Audit 3 F-12, BUG-017 / Audit 4 A3).
 *
 * Allowed: in-session generated images (`data:image/*`, including the
 * optimistic Artist URI) and the same-origin, owner-scoped image route
 * (`/api/openai/images/<id>.<ext>`). Everything else — `javascript:`,
 * non-image `data:` payloads, remote http(s) images — stays plain text.
 *
 * Remote images are deliberately *not* loaded (no proxy either): fetching a
 * third-party image would leak the reader's IP/referer to that host (tracking
 * pixel, mixed content), and an image proxy would add SSRF surface plus a
 * hosting dependency for little gain. Model output that cites an image URL
 * still shows the URL as readable text.
 */
export function isAllowedImageSrc(src: string): boolean {
  if (src.startsWith('data:image/')) return true;
  return /^\/api\/openai\/images\/\d+(\.\w+)?$/.test(src);
}

export function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  lines.forEach((line, idx) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push(
          <pre key={`code-${idx}`} className="bg-muted rounded-lg p-4 my-3 overflow-x-auto">
            <code className="font-mono text-sm">{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      codeLines.push(line);
    } else {
      // Handle image markdown: ![alt](src)
      const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        const [, alt, src] = imageMatch;
        if (isAllowedImageSrc(src)) {
          result.push(
            <img
              key={idx}
              src={src}
              alt={alt}
              className="rounded-lg max-w-full h-auto my-3"
            />
          );
        } else {
          result.push(<span key={idx}>{line}<br /></span>);
        }
      } else if (line.trim()) {
        result.push(<span key={idx}>{line}<br /></span>);
      } else {
        result.push(<br key={idx} />);
      }
    }
  });

  if (inCodeBlock && codeLines.length > 0) {
    result.push(
      <pre key="code-final" className="bg-muted rounded-lg p-4 my-3 overflow-x-auto">
        <code className="font-mono text-sm">{codeLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className="whitespace-pre-wrap break-words">{result}</div>;
}
