/**
 * Tests for the streaming GeminiVoiceSocket WebSocket transport.
 *
 * A fake WebSocket class stands in for the browser implementation so the
 * transport can be driven synchronously: open, deliver binary PCM16 frames,
 * emit JSON transcript messages, close, and reconnect.
 */
class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: FakeWebSocket[] = [];

  url: string;
  binaryType: string = 'blob';
  readyState: number = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: ArrayBuffer[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer): void { this.sent.push(data); }
  close(): void { this.closed = true; this.readyState = 3; }

  open(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  emitMessage(data: unknown): void { this.onmessage?.({ data }); }
  emitError(): void { this.onerror?.(); }
  emitClose(): void { this.readyState = 3; this.onclose?.(); }
}

describe('GeminiVoiceSocket streaming transport', () => {
  let GeminiVoiceSocket: typeof import('./geminiVoiceSocket').GeminiVoiceSocket;

  const events: { transcript: string; isFinal: boolean }[] = [];
  const stateChanges: string[] = [];
  const errors: string[] = [];
  let socket: InstanceType<typeof GeminiVoiceSocket>;

  const lastPcm16 = (ws: FakeWebSocket): Int16Array =>
    new Int16Array(ws.sent[ws.sent.length - 1]);

  beforeAll(() => {
    // @ts-expect-error test double replaces the browser WebSocket
    global.WebSocket = FakeWebSocket;
  });

  beforeEach(() => {
    jest.resetModules();
    ({ GeminiVoiceSocket } = require('./geminiVoiceSocket'));
    FakeWebSocket.instances = [];
    events.length = 0;
    stateChanges.length = 0;
    errors.length = 0;
    jest.useFakeTimers();
    socket = new GeminiVoiceSocket({
      url: 'ws://gateway.test/api/aira-voice/stt?language=en',
      sampleRate: 16000,
      onTranscript: (event) => events.push(event),
      onStateChange: (state) => stateChanges.push(state),
      onError: (message) => errors.push(message),
      reconnectDelayMs: 50,
    });
  });

  afterEach(() => {
    socket.disconnect();
    jest.useRealTimers();
  });

  it('opens a WebSocket, streams PCM16 frames, and reports CONNECTED', () => {
    socket.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(stateChanges).toEqual(['CONNECTING']);

    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(stateChanges).toContain('CONNECTED');

    socket.sendAudioChunk(new Float32Array([0.5, -0.5]));
    expect(ws.sent).toHaveLength(1);
    const pcm = lastPcm16(ws);
    expect(pcm.length).toBe(2);
    // JS truncates toward zero: 0.5 * 0x7fff = 16383.5 -> 16383.
    expect(pcm[0]).toBe(16383);
    expect(pcm[1]).toBe(Math.round(-0.5 * 0x8000));
  });

  it('queues frames until the socket opens, then flushes them in order', () => {
    socket.sendAudioChunk(new Float32Array([0.25]));
    socket.sendAudioChunk(new Float32Array([0.75]));
    expect(FakeWebSocket.instances[0].sent).toHaveLength(0);

    FakeWebSocket.instances[0].open();
    const ws = FakeWebSocket.instances[0];
    expect(ws.sent).toHaveLength(2);
    expect(lastPcm16(ws)[0]).toBe(Math.round(0.75 * 0x7fff));
  });

  it('dispatches interim and final transcript events from JSON messages', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.emitMessage(JSON.stringify({ transcript: 'hello', is_final: false }));
    expect(events).toEqual([{ transcript: 'hello', isFinal: false }]);

    ws.emitMessage(JSON.stringify({ transcript: 'hello world', is_final: true }));
    expect(events).toEqual([
      { transcript: 'hello', isFinal: false },
      { transcript: 'hello world', isFinal: true },
    ]);
  });

  it('keeps the longest interim hypothesis before the final arrives', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.emitMessage(JSON.stringify({ transcript: 'hello world', is_final: false }));
    ws.emitMessage(JSON.stringify({ transcript: 'hello', is_final: false }));
    ws.emitMessage(JSON.stringify({ transcript: 'hello', is_final: true }));

    // Every non-final message dispatches a partial carrying the longest
    // hypothesis seen so far; the shorter text does not regress the interim.
    expect(events).toEqual([
      { transcript: 'hello world', isFinal: false },
      { transcript: 'hello world', isFinal: false },
      { transcript: 'hello world', isFinal: true },
    ]);
  });

  it('ignores malformed JSON and empty transcripts', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.emitMessage('not json');
    ws.emitMessage(JSON.stringify({ transcript: '   ' }));
    expect(events).toEqual([]);
  });

  it('endUtterance resets the interim accumulator for the next turn', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.emitMessage(JSON.stringify({ transcript: 'first turn', is_final: true }));
    socket.endUtterance();
    ws.emitMessage(JSON.stringify({ transcript: 'second', is_final: false }));
    expect(events).toEqual([
      { transcript: 'first turn', isFinal: true },
      { transcript: 'second', isFinal: false },
    ]);
  });

  it('schedules a reconnect after an unexpected close and recovers', () => {
    socket.connect();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.emitClose();

    expect(errors).toContain('Gemini speech connection closed.');
    expect(stateChanges).toContain('ERROR');

    jest.advanceTimersByTime(50);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(stateChanges).toContain('CONNECTED');

    FakeWebSocket.instances[1].emitMessage(JSON.stringify({ transcript: 'back', is_final: false }));
    expect(events).toEqual([{ transcript: 'back', isFinal: false }]);
  });

  it('disconnect closes the socket, drops queued frames, and stops reconnection', () => {
    socket.sendAudioChunk(new Float32Array([0.5]));
    const ws = FakeWebSocket.instances[0];
    socket.disconnect();

    expect(ws.closed).toBe(true);
    expect(socket.getState()).toBe('DISCONNECTED');

    // Queued frames were dropped; a later connect opens a fresh socket.
    socket.connect();
    FakeWebSocket.instances[1].open();
    expect(FakeWebSocket.instances[1].sent).toHaveLength(0);
  });

  it('whenConnected resolves once open and rejects on error state', async () => {
    socket.connect();
    const pending = socket.whenConnected(1000);
    FakeWebSocket.instances[0].open();
    // The waiter polls on a 25 ms timer; fire it now that the socket is open.
    jest.advanceTimersByTime(25);
    await expect(pending).resolves.toBeUndefined();

    FakeWebSocket.instances[0].emitClose();
    const rejected = socket.whenConnected(1000);
    await expect(rejected).rejects.toThrow('disconnected');
  });
});
