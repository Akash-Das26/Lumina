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
        // Audit 3 F-12: only render data: image URIs found in assistant output.
        // External URLs (e.g. tracking pixels, mixed content) stay as plain text.
        if (src.startsWith('data:image/')) {
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
