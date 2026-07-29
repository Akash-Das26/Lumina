const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function streamMessage(
  conversationId: number,
  content: string,
  mode: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void
) {
  try {
    const res = await fetch(`${BASE}/api/openai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mode }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.content) onChunk(evt.content);
            if (evt.done) {
              onDone();
              return;
            }
          } catch (e) {
            console.warn('Failed to parse SSE event:', line, e);
          }
        }
      }
    }
    onDone();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
