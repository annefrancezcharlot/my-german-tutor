import { afterEach, describe, expect, it, vi } from 'vitest';

import { setAuthTokenProvider, streamMessage } from './index';

const sseResponse = (chunks: string[]) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
    controller.close();
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

describe('controlled discussion SSE', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAuthTokenProvider(async () => null);
  });

  it('renders deltas split across network chunks and reports completion', async () => {
    setAuthTokenProvider(async () => 'token');
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'event: session\ndata: {"session_id":4,"user_message_id":9}\n\nevent: del',
      'ta\ndata: {"text":"Gu"}\n\nevent: delta\ndata: {"text":"t"}\n\n',
      'event: done\ndata: {"assistant_message_id":10}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];
    let doneId = 0;

    await streamMessage(4, 'Hallo', new AbortController().signal, {
      onDelta: text => deltas.push(text),
      onDone: data => { doneId = data.assistant_message_id; },
    });

    expect(deltas.join('')).toBe('Gut');
    expect(doneId).toBe(10);
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer token');
  });

  it('surfaces provider failures after preserving partial deltas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: delta\ndata: {"text":"Teil"}\n\n',
      'event: error\ndata: {"message":"interrupted"}\n\n',
    ])));
    const deltas: string[] = [];
    const errors: string[] = [];

    await expect(streamMessage(4, 'Hallo', new AbortController().signal, {
      onDelta: text => deltas.push(text),
      onError: message => errors.push(message),
    })).rejects.toThrow('interrupted');

    expect(deltas).toEqual(['Teil']);
    expect(errors).toEqual(['interrupted']);
  });
});
