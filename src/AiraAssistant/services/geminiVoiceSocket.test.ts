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
  onclose: ((event: { code: number }) => void) | null = null;
  sent: (ArrayBuffer | string)[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer | string): void { this.sent.push(data); }
  close(): void { this.closed = true; this.readyState = 3; }

  open(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  emitMessage(data: unknown): void { this.onmessage?.({ data }); }
  emitError(): void { this.onerror?.(); }
  emitClose(code = 1006): void { this.readyState = 3; this.onclose?.({ code }); }
}

describe('GeminiVoiceSocket streaming transport', () => {
  let GeminiVoiceSocket: typeof import('./geminiVoiceSocket').GeminiVoiceSocket;

  const events: { transcript: string; isFinal: boolean }[] = [];
  const stateChanges: string[] = [];
  const errors: string[] = [];
  let socket: InstanceType<typeof GeminiVoiceSocket>;

  const lastPcm16 = (ws: FakeWebSocket): Int16Array =>
    new Int16Array(ws.sent[ws.sent.length - 1] as ArrayBuffer);

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
    expect(events).toEqual([{ transcript: 'hello', isFinal: false, turnId: 0 }]);

    ws.emitMessage(JSON.stringify({ transcript: 'hello world', is_final: true }));
    expect(events).toEqual([
      { transcript: 'hello', isFinal: false, turnId: 0 },
      { transcript: 'hello world', isFinal: true, turnId: 0 },
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
      { transcript: 'hello world', isFinal: false, turnId: 0 },
      { transcript: 'hello world', isFinal: false, turnId: 0 },
      { transcript: 'hello world', isFinal: true, turnId: 0 },
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
      { transcript: 'first turn', isFinal: true, turnId: 0 },
      { transcript: 'second', isFinal: false, turnId: 0 },
    ]);
  });

  it('resetTurn sends turn_reset on the persistent socket, drops queued frames, and preserves keepalive', () => {
    socket.sendAudioChunk(new Float32Array([0.5]));
    const ws = FakeWebSocket.instances[0];
    socket.resetTurn(1);
    ws.open();
    // Pre-reset pending frames were dropped before socket open.
    expect(ws.sent).toHaveLength(0);

    ws.emitMessage(JSON.stringify({ transcript: 'half baked', is_final: false }));
    socket.resetTurn(2);
    expect(JSON.parse(String(ws.sent.at(-1)))).toEqual({ type: 'turn_reset', turnId: 2 });
    expect(ws.closed).toBe(false);

    // Heartbeat continues on the same persistent socket.
    jest.advanceTimersByTime(15000);
    expect(JSON.parse(String(ws.sent.at(-1)))).toMatchObject({ type: 'ping' });

    ws.emitMessage(JSON.stringify({ transcript: 'fresh turn', is_final: true }));
    expect(events.at(-1)).toEqual({ transcript: 'fresh turn', isFinal: true, turnId: 2 });
  });

  it('strips accumulated prior-turn prefixes across 3 consecutive turns on a persistent socket', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    // Turn 1
    socket.resetTurn(1);
    ws.emitMessage(JSON.stringify({ transcript: 'Which machine is online?', is_final: true }));

    // Turn 2: unpatched gateway prepends Turn 1 (even with punctuation differences)
    socket.resetTurn(2);
    ws.emitMessage(JSON.stringify({ transcript: 'Which machine is online?', is_final: false }));
    ws.emitMessage(JSON.stringify({ transcript: 'Which machine is online? Is it sunny outside?', is_final: true }));

    // Turn 3: unpatched gateway prepends Turn 1 + Turn 2
    socket.resetTurn(3);
    ws.emitMessage(JSON.stringify({
      transcript: 'Which machine is online? Is it sunny outside? Please let me know maintenance steps for turning on AC.',
      is_final: true,
    }));

    expect(events).toEqual([
      { transcript: 'Which machine is online?', isFinal: true, turnId: 1 },
      { transcript: 'Is it sunny outside?', isFinal: true, turnId: 2 },
      { transcript: 'Please let me know maintenance steps for turning on AC.', isFinal: true, turnId: 3 },
    ]);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('preserves legitimate repeated final utterances and ignores stale turnId or turn_reset_ack frames', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    socket.resetTurn(1);
    ws.emitMessage(JSON.stringify({ type: 'turn_reset_ack', turnId: 1 }));
    ws.emitMessage(JSON.stringify({ transcript: 'Check status', is_final: true }));

    socket.resetTurn(2);
    ws.emitMessage(JSON.stringify({ transcript: 'stale turn one', is_final: true, turnId: 1 }));
    ws.emitMessage(JSON.stringify({ transcript: 'Check status', is_final: true, turnId: 2 }));

    expect(events).toEqual([
      { transcript: 'Check status', isFinal: true, turnId: 1 },
      { transcript: 'Check status', isFinal: true, turnId: 2 },
    ]);
  });

  it('strips Turn 1 prefix even after an intervening stray ignored final arrives mid-turn', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    socket.resetTurn(1);
    ws.emitMessage(JSON.stringify({ transcript: 'Which machine is online?', is_final: true }));

    // Simulate stray echo arriving mid-processing that useVoiceAssistant ignores cleanly
    socket.resetTurn(2);
    ws.emitMessage(JSON.stringify({ transcript: 'stale echo during processing', is_final: true }));

    // Turn 2 arrives with Turn 1 prepended on an unpatched gateway
    socket.resetTurn(3);
    ws.emitMessage(JSON.stringify({ transcript: 'Which machine is online? Is it sunny outside?', is_final: true }));

    expect(events.at(-1)).toEqual({
      transcript: 'Is it sunny outside?',
      isFinal: true,
      turnId: 3,
    });
  });

  it('schedules a reconnect after an unexpected close and recovers', () => {
    socket.connect();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.emitClose();

    expect(errors).toHaveLength(0);
    expect(stateChanges).toContain('RECONNECTING');

    jest.advanceTimersByTime(50);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(stateChanges).toContain('CONNECTED');

    FakeWebSocket.instances[1].emitMessage(JSON.stringify({ transcript: 'back', is_final: false }));
    expect(events).toEqual([{ transcript: 'back', isFinal: false, turnId: 0 }]);
  });

  it('retries three times before exposing a friendly terminal error', () => {
    socket.connect();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      FakeWebSocket.instances[attempt].emitClose();
      jest.advanceTimersByTime(50);
    }
    expect(FakeWebSocket.instances).toHaveLength(4);
    FakeWebSocket.instances[3].emitClose();
    expect(errors).toEqual(['Voice connection paused. Tap to reconnect.']);
    expect(stateChanges.at(-1)).toBe('ERROR');
    jest.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('sends application heartbeats and ignores pong control frames', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    jest.advanceTimersByTime(15000);
    expect(JSON.parse(String(ws.sent.at(-1)))).toMatchObject({ type: 'ping' });
    ws.emitMessage(JSON.stringify({ type: 'pong' }));
    expect(events).toEqual([]);
  });

  it('keeps idle socket open without pong and reconnects if pong stops arriving', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    jest.advanceTimersByTime(60000);
    expect(ws.closed).toBe(false);

    ws.emitMessage(JSON.stringify({ type: 'pong' }));
    jest.advanceTimersByTime(60000);
    expect(ws.closed).toBe(true);
    ws.emitClose();
    expect(stateChanges).toContain('RECONNECTING');
  });

  it('handles clean idle close (1000) without error and lazily reopens on next audio frame', () => {
    socket.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emitClose(1000);
    expect(errors).toEqual([]);
    expect(socket.getState()).toBe('DISCONNECTED');

    socket.sendAudioChunk(new Float32Array([0.25]));
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(FakeWebSocket.instances[1].sent).toHaveLength(1);
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

    socket.disconnect();
    const rejected = socket.whenConnected(1000);
    await expect(rejected).rejects.toThrow('disconnected');
  });
});
