import type { STTTranscriptEvent, VoiceSocketConfig, VoiceSocketState } from '../types';

const RECONNECT_DELAYS_MS = [500, 1000, 2000];
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 45000;
const MAX_COMMITTED_TURNS = 20;

const WORD_TOKEN_REGEX = (() => {
  try {
    return new RegExp('[\\p{L}\\p{M}\\p{N}]+', 'gu');
  } catch {
    return /[^\s.,!?;:'"()[\]{}]+/g;
  }
})();

interface WordToken {
  norm: string;
  start: number;
  end: number;
}

function tokenizeTranscript(text: string): WordToken[] {
  WORD_TOKEN_REGEX.lastIndex = 0;
  const tokens: WordToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = WORD_TOKEN_REGEX.exec(text)) !== null) {
    tokens.push({
      norm: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

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
  private turnId = 0;
  private committedTurns: string[] = [];

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
   * Starts a fresh turn on the persistent STT socket: advances the turn
   * counter, clears locally buffered audio/text for any prior turn, and
   * instructs the gateway to drop accumulated per-connection transcript/PCM
   * buffers without closing the WebSocket or stopping heartbeats.
   */
  resetTurn(nextTurnId?: number): void {
    this.turnId = typeof nextTurnId === 'number' ? nextTurnId : this.turnId + 1;
    this.resetUtteranceState();
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: 'turn_reset', turnId: this.turnId }));
      } catch {
        // Best-effort control frame; close/reconnect handlers recover transport.
      }
    }
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
    this.committedTurns = [];
    this.turnId += 1;
    this.resetUtteranceState();
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
        this.committedTurns = [];
        this.latestTranscript = '';
        this.finalDispatched = false;
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
    let data: {
      type?: unknown;
      text?: unknown;
      transcript?: unknown;
      is_final?: unknown;
      isFinal?: unknown;
      confidence?: unknown;
      turnId?: unknown;
      turn_id?: unknown;
    };
    try {
      data = JSON.parse(message) as typeof data;
    } catch {
      return;
    }

    if (data.type === 'pong') {
      this.serverSupportsPong = true;
      return;
    }
    if (data.type === 'ping' || data.type === 'turn_reset_ack') return;

    const messageTurnId = typeof data.turnId === 'number'
      ? data.turnId
      : typeof data.turn_id === 'number'
        ? data.turn_id
        : undefined;
    if (messageTurnId !== undefined && messageTurnId !== this.turnId) return;

    const rawText = typeof data.text === 'string' ? data.text : typeof data.transcript === 'string' ? data.transcript : '';
    const isFinal = Boolean(data.is_final ?? data.isFinal);
    const transcript = this.stripCommittedPrefix(rawText, isFinal);
    if (!transcript) return;

    // Streaming STT may send incremental text; keep the longest hypothesis within this turn.
    if (!this.finalDispatched && transcript.length > this.latestTranscript.length) {
      this.latestTranscript = transcript;
    }

    if (isFinal) {
      if (this.finalDispatched) return;
      this.finalDispatched = true;
      const finalTranscript = this.latestTranscript || transcript;
      this.committedTurns.push(finalTranscript);
      if (this.committedTurns.length > MAX_COMMITTED_TURNS) {
        this.committedTurns.splice(0, this.committedTurns.length - MAX_COMMITTED_TURNS);
      }
      const event: STTTranscriptEvent = {
        transcript: finalTranscript,
        isFinal: true,
        turnId: this.turnId,
      };
      if (typeof data.confidence === 'number') event.confidence = data.confidence;
      this.config.onTranscript(event);
      this.resetUtteranceState();
      return;
    }

    const event: STTTranscriptEvent = {
      transcript: this.latestTranscript,
      isFinal: false,
      turnId: this.turnId,
    };
    if (typeof data.confidence === 'number') event.confidence = data.confidence;
    this.config.onTranscript(event);
  }

  /**
   * Defense-in-depth against gateways that re-emit cumulative transcript
   * history over a persistent WebSocket: strips any contiguous sequence of
   * previously committed turns matching a prefix of `rawText`.
   */
  private stripCommittedPrefix(rawText: string, isFinal: boolean): string {
    const trimmed = rawText.trim();
    if (!trimmed || this.committedTurns.length === 0) return trimmed;

    const incomingTokens = tokenizeTranscript(rawText);
    if (incomingTokens.length === 0) return trimmed;

    const committedTokenLists = this.committedTurns.map((turn) => tokenizeTranscript(turn));

    for (let spanLen = committedTokenLists.length; spanLen >= 1; spanLen -= 1) {
      for (let startIdx = 0; startIdx <= committedTokenLists.length - spanLen; startIdx += 1) {
        const prefixTokens: WordToken[] = [];
        for (let i = startIdx; i < startIdx + spanLen; i += 1) {
          prefixTokens.push(...committedTokenLists[i]);
        }
        if (prefixTokens.length === 0 || incomingTokens.length < prefixTokens.length) continue;

        let matches = true;
        for (let i = 0; i < prefixTokens.length; i += 1) {
          if (incomingTokens[i].norm !== prefixTokens[i].norm) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;

        if (incomingTokens.length > prefixTokens.length) {
          return rawText.slice(incomingTokens[prefixTokens.length].start).trim();
        }

        // Exact match to previously committed text: suppress stale interim echoes,
        // while allowing a legitimate identical repeat if explicitly finalized.
        return isFinal ? trimmed : '';
      }
    }

    return trimmed;
  }

  private resetUtteranceState(): void {
    this.pendingFrames = [];
    this.latestTranscript = '';
    this.finalDispatched = false;
  }

  private updateState(state: VoiceSocketState): void {
    this.currentState = state;
    this.config.onStateChange?.(state);
  }
}
