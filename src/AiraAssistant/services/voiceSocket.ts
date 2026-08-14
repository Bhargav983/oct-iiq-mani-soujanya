import type { STTTranscriptEvent, VoiceSocketConfig, VoiceSocketState } from '../types';

type STTMessage = {
  text?: unknown;
  transcript?: unknown;
  is_final?: unknown;
  isFinal?: unknown;
  confidence?: unknown;
};

/** A reconnecting WebSocket transport for linear16 streaming speech-to-text. */
export class VoiceSocket {
  private socket: WebSocket | null = null;
  private readonly config: VoiceSocketConfig;
  private currentState: VoiceSocketState = 'DISCONNECTED';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private explicitlyDisconnected = false;

  constructor(config: VoiceSocketConfig) {
    this.config = config;
  }

  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log('[Voice] WebSocket already connecting or connected, skipping connect()');
      return;
    }

    console.log('🔌 [VoiceSocket] WebSocket connecting', {
      url: this.config.url,
      currentState: this.currentState,
    });
    this.explicitlyDisconnected = false;
    this.clearReconnectTimer();
    this.openSocket();
  }

  public sendAudioChunk(pcmData: Float32Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.log('⚠️ [VoiceSocket] Audio NOT sent - socket not open', {
        socketExists: Boolean(this.socket),
        readyState: this.socket?.readyState,
      });
      return;
    }

    const pcm16 = new Int16Array(pcmData.length);

    for (let index = 0; index < pcmData.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, pcmData[index]));
      pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    console.log('🎵 [VoiceSocket] Sending PCM audio', {
      floatSamples: pcmData.length,
      pcm16Samples: pcm16.length,
      bytes: pcm16.byteLength,
      firstSamples: Array.from(pcm16.slice(0, 5)),
    });

    this.socket.send(pcm16.buffer);
  }

  /** Signals the end of the current utterance without dropping the connection. */
  public endUtterance(): void {
    // faster-whisper-server detects the end of audio
    // when no more binary PCM frames are received.
  }

  public disconnect(): void {
    console.log('🔴 VoiceSocket.disconnect() called');
    console.log('🔴 socket readyState:', this.socket?.readyState);
    this.explicitlyDisconnected = true;
    this.clearReconnectTimer();

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      // Guard against closing while CONNECTING (readyState 0)
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          socket.close(1000, 'Client disconnected after connecting');
        };
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Client disconnected');
      }
    }
    this.updateState('DISCONNECTED');
  }

  public getState(): VoiceSocketState {
    return this.currentState;
  }

  private openSocket(): void {
    this.updateState('CONNECTING');

    try {
      const socket = new WebSocket(this.config.url);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        console.log('🟢 [VoiceSocket] WebSocket OPEN');
        console.log('🟢 [VoiceSocket] readyState:', socket.readyState);
        if (this.socket !== socket) {
          socket.close();
          return;
        }
        console.log('[Voice] WebSocket connected successfully');
        this.reconnectAttempts = 0;
        this.updateState('CONNECTED');
        // Send initial whisper parameters frame
        const configPayload = {
          uid: "user-" + Math.random().toString(36).substring(7),
          language: "en",
          task: "transcribe",
          model: "base.en"
        };
        // Send a silent PCM buffer immediately so faster-whisper-server stays alive
        //const silentChunk = new Float32Array(512);
        //this.sendAudioChunk(silentChunk);
        
      };

      socket.onmessage = (event: MessageEvent) => {
        console.log('📥 [VoiceSocket] Message received', {
          type: typeof event.data,
          data: event.data,
        });

        this.handleMessage(event.data);
      };
      socket.onerror = (event) => {
        console.error('🔴 [VoiceSocket] WebSocket ERROR', event);

        if (this.socket !== socket) return;

        this.updateState('ERROR');
        this.config.onError?.('WebSocket connection error.');

        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
      socket.onclose = (event) => {
        console.log('🔴 [VoiceSocket] WebSocket CLOSED', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          explicitlyDisconnected: this.explicitlyDisconnected,
        });

        if (this.socket !== socket) return;

        this.socket = null;
        this.updateState('DISCONNECTED');

        console.log('⚠️ [VoiceSocket] Server closed connection - reconnect disabled for debugging');

      // TEMPORARILY disabled while debugging
      // if (!this.explicitlyDisconnected) {
      //   this.scheduleReconnect();
      // }
      };
    } catch (error: unknown) {
      this.updateState('ERROR');
      this.config.onError?.(error instanceof Error ? error.message : 'Failed to connect to speech-to-text service.');
      if (!this.explicitlyDisconnected) this.scheduleReconnect();
    }
  }

  private handleMessage(message: string): void {
    console.log('📥 [VoiceSocket] RAW STT:', message);

    try {
      const data: STTMessage = JSON.parse(message) as STTMessage;

      console.log('📥 [VoiceSocket] Parsed STT:', data);

      if (typeof data.text !== 'string') {
        console.log('⚠️ [VoiceSocket] No transcript field:', data);
        return;
      }

      const event: STTTranscriptEvent = {
        transcript: data.text.trim(),
        isFinal: Boolean(data.is_final ?? data.isFinal),
      };

      console.log('📝 [VoiceSocket] Sending transcript to React:', event);

      if (typeof data.confidence === 'number') {
        event.confidence = data.confidence;
      }

      this.config.onTranscript(event);
    } catch (error) {
      console.log('⚠️ [VoiceSocket] Could not parse STT message:', {
        message,
        error,
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.explicitlyDisconnected) return;

    const baseDelay = this.config.reconnectDelayMs ?? 1000;
    const delay = Math.min(baseDelay * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private sendJSON(data: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data));
  }

  private updateState(state: VoiceSocketState): void {
    this.currentState = state;
    this.config.onStateChange?.(state);
  }
}
