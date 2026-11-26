import type { STTTranscriptEvent, VoiceSocketConfig, VoiceSocketState } from '../types';

const RECONNECT_DELAYS_MS = [500, 1000, 2000];
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 45000;

/**
 * Real-time streaming transport for the AiraAssistant Gemini speech gateway.
 *
 * The browser opens a WebSocket to the STT endpoint and streams raw binary
 * PCM16 (16 kHz mono) frames as the local VAD produces them. The gateway
 * relays them into a Gemini Live transcription session and streams back JSON
 * transcript messages (`{ transcript, is_final }`), both interim hypotheses
 * and finalized turns, which are surfaced through `config.onTranscript`.
 *
 * The gateway owns the Gemini API key; no Google credential is shipped to the
 * browser. Microphone capture, VAD and wake-word detection stay local.
 */
export class GeminiVoiceSocket {
  private readonly config: VoiceSocketConfig;
  private currentState: VoiceSocketState = 'DISCONNECTED';
  private socket: WebSocket | null = null;
  private socketGeneration = 0;
  private explicitlyDisconnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private lastMessageAt = 0;
  private serverSupportsPong = false;
  private pendingFrames: Float32Array[] = [];
  private latestTranscript = '';
  private finalDispatched = false;

  constructor(config: VoiceSocketConfig) { this.config = config; }

  connect(): void {
    if (this.socket || this.currentState === 'CONNECTING') return;
    this.explicitlyDisconnected = false;
    this.openSocket();
  }

  isConnected(): boolean { return this.socket?.readyState === WebSocket.OPEN; }
  getState(): VoiceSocketState { return this.currentState; }

  whenConnected(timeoutMs?: number): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const deadline = timeoutMs ? Date.now() + timeoutMs : null;
      const poll = () => {
        if (this.isConnected()) { resolve(); return; }
        if (this.currentState === 'ERROR' || this.currentState === 'DISCONNECTED') {
          reject(new Error('Gemini speech transport is disconnected'));
          return;
        }
        if (deadline && Date.now() > deadline) {
          reject(new Error('Gemini speech transport connection timed out'));
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
  }

  sendAudioChunk(frame: Float32Array): void {
    if (this.explicitlyDisconnected) return;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendPcm16(frame);
      return;
    }
    this.pendingFrames.push(new Float32Array(frame));
    this.connect();
  }

  /**
   * VAD speech end. Gemini Live finalizes turns server-side: the final
   * message resets the accumulator when it arrives, so this only guards
   * against stale text bleeding into the next turn if no final comes.
   */
  endUtterance(): void {
    this.resetUtteranceState();
  }

  disconnect(): void {
    this.explicitlyDisconnected = true;
    this.socketGeneration += 1;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.serverSupportsPong = false;
    this.pendingFrames = [];
    this.latestTranscript = '';
    this.finalDispatched = false;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
    this.updateState('DISCONNECTED');
  }

  private openSocket(): void {
    this.updateState('CONNECTING');
    const generation = ++this.socketGeneration;
    try {
      const socket = new WebSocket(this.config.url);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        if (generation !== this.socketGeneration || this.socket !== socket || this.explicitlyDisconnected) {
          socket.close();
          return;
        }
        this.reconnectAttempts = 0;
        this.lastMessageAt = Date.now();
        this.serverSupportsPong = false;
        this.startHeartbeat();
        this.updateState('CONNECTED');
        const pending = this.pendingFrames;
        this.pendingFrames = [];
        for (const frame of pending) this.sendPcm16(frame);
      };

      socket.onmessage = (messageEvent) => {
        if (generation !== this.socketGeneration || this.socket !== socket) return;
        this.lastMessageAt = Date.now();
        this.handleMessage(String(messageEvent.data));
      };

      socket.onerror = () => {
        if (generation !== this.socketGeneration || this.socket !== socket) return;
        console.warn('[VoiceSocket] Transient speech transport error; waiting for close before reconnecting.');
      };

      socket.onclose = (event) => {
        if (generation !== this.socketGeneration || this.socket !== socket) return;
        this.socket = null;
        this.stopHeartbeat();
        if (this.explicitlyDisconnected || event?.code === 1000) {
          this.updateState('DISCONNECTED');
          return;
        }
        this.scheduleReconnect(event?.code);
      };

    } catch (error) {
      console.warn('[VoiceSocket] Could not open speech transport', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(closeCode?: number): void {
    if (this.explicitlyDisconnected || this.reconnectTimer) return;
    if (this.reconnectAttempts >= RECONNECT_DELAYS_MS.length) {
      this.updateState('ERROR');
      this.config.onError?.('Voice connection paused. Tap to reconnect.');
      return;
    }
    const delay = this.config.reconnectDelayMs ?? RECONNECT_DELAYS_MS[this.reconnectAttempts];
    this.reconnectAttempts += 1;
    console.info('[VoiceSocket] Reconnecting speech transport', { attempt: this.reconnectAttempts, delay, closeCode });
    this.updateState('RECONNECTING');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.explicitlyDisconnected || this.socket) return;
      this.openSocket();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return;
      if (this.serverSupportsPong && Date.now() - this.lastMessageAt > HEARTBEAT_TIMEOUT_MS) {
        console.warn('[VoiceSocket] Speech transport heartbeat timed out; reconnecting.');
        this.socket?.close();
        return;
      }
      try {
        this.socket?.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } catch {
        this.socket?.close();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendPcm16(frame: Float32Array): void {
    const pcm16 = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      const sample = Math.max(-1, Math.min(1, frame[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    this.socket?.send(pcm16.buffer);
  }

  private handleMessage(message: string): void {
    let data: { type?: unknown; text?: unknown; transcript?: unknown; is_final?: unknown; isFinal?: unknown; confidence?: unknown };
    try {
      data = JSON.parse(message) as typeof data;
    } catch {
      return;
    }

    if (data.type === 'pong') {
      this.serverSupportsPong = true;
      return;
    }
    if (data.type === 'ping') return;
    const rawText = typeof data.text === 'string' ? data.text : typeof data.transcript === 'string' ? data.transcript : '';
    const transcript = rawText.trim();
    if (!transcript) return;

    const isFinal = Boolean(data.is_final ?? data.isFinal);

    // Streaming STT may send incremental text; keep the longest hypothesis.
    if (!this.finalDispatched && transcript.length > this.latestTranscript.length) {
      this.latestTranscript = transcript;
    }

    if (isFinal) {
      if (this.finalDispatched) return;
      this.finalDispatched = true;
      const event: STTTranscriptEvent = { transcript: this.latestTranscript || transcript, isFinal: true };
      if (typeof data.confidence === 'number') event.confidence = data.confidence;
      this.config.onTranscript(event);
      this.resetUtteranceState();
      return;
    }

    const event: STTTranscriptEvent = { transcript: this.latestTranscript, isFinal: false };
    if (typeof data.confidence === 'number') event.confidence = data.confidence;
    this.config.onTranscript(event);
  }

  private resetUtteranceState(): void {
    this.latestTranscript = '';
    this.finalDispatched = false;
  }

  private updateState(state: VoiceSocketState): void {
    this.currentState = state;
    this.config.onStateChange?.(state);
  }
}
