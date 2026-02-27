import { authCredentials } from '@/lib/api-client';

const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? '';

interface SSEEvent {
  type: string;
  content?: string;
  finishReason?: string;
}

/**
 * Stream LLM chat via SSE.
 * Returns an AbortController that can be used to cancel the stream.
 */
export function streamLLMChat(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  documentId: string | undefined,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/llm/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authCredentials}`,
    },
    body: JSON.stringify({ message, history, documentId }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        onError((body as { message?: string }).message ?? 'Stream request failed');
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        onError('No stream reader available');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as SSEEvent;
            if (parsed.type === 'token' && parsed.content) onToken(parsed.content);
            else if (parsed.type === 'done') onDone();
            else if (parsed.type === 'error') onError(parsed.content ?? 'Unknown error');
          } catch {
            /* skip malformed SSE lines */
          }
        }
      }
      onDone();
    })
    .catch((err: unknown) => {
      if ((err as { name?: string }).name === 'AbortError') return;
      onError(err instanceof Error ? err.message : 'Stream failed');
    });

  return controller;
}
