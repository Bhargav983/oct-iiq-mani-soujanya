import type {
  STTTranscriptEvent,
  VoiceSocketConfig,
  VoiceSocketState,
} from '../types';

type STTMessage = {
  text?: unknown;
  transcript?: unknown;
  is_final?: unknown;
  isFinal?: unknown;
  confidence?: unknown;
};

/**
 * WebSocket transport for faster-whisper live STT.
 *
 * IMPORTANT:
 * faster-whisper-server expects RAW BINARY PCM16 audio.
 * Do NOT send a JSON setup/config frame after WebSocket OPEN.
 */
export class VoiceSocket {
  private socket: WebSocket | null = null;
  private readonly config: VoiceSocketConfig;

  private currentState: VoiceSocketState = 'DISCONNECTED';

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  private explicitlyDisconnected = false;
  private utteranceEnded = false;
  private finalDispatched = false;
  private latestTranscript = '';

  private finalTranscriptTimer: ReturnType<typeof setTimeout> | null = null;

  private pcmQueue: Float32Array[] = [];

  private static readonly MAX_PCM_QUEUE = 50;

  private socketGeneration = 0;

  constructor(config: VoiceSocketConfig) {
    this.config = config;
  }

  // --------------------------------------------------
  // CONNECT
  // --------------------------------------------------

  public connect(): void {
    const readyState = this.socket?.readyState;

    if (
      readyState === WebSocket.OPEN ||
      readyState === WebSocket.CONNECTING
    ) {
      console.log(
        '🔌 [VoiceSocket] connect() skipped — socket already active',
        {
          readyState,
          state: this.currentState,
        }
      );

      return;
    }

    this.explicitlyDisconnected = false;
    this.clearReconnectTimer();

    console.log('🔌 [VoiceSocket] Opening WebSocket', {
      url: this.config.url,
      previousReadyState: readyState ?? null,
      previousState: this.currentState,
    });

    this.openSocket();
  }

  // --------------------------------------------------
  // SEND AUDIO
  // --------------------------------------------------

  public sendAudioChunk(pcmData: Float32Array): void {
    if (this.utteranceEnded || this.finalDispatched) {
      this.resetUtteranceState();
    }

    // Socket is still connecting
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      this.queuePCM(pcmData, 'CONNECTING');
      return;
    }

    // Socket doesn't exist or isn't open
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      if (this.explicitlyDisconnected) {
        console.warn(
          '⚠️ [VoiceSocket] Audio dropped — socket explicitly disconnected'
        );

        return;
      }

      this.queuePCM(pcmData, 'NOT_OPEN');

      this.connect();

      return;
    }

    // Socket is OPEN
    this.sendPCM16(pcmData);
  }

  // --------------------------------------------------
  // END UTTERANCE
  // --------------------------------------------------

  public endUtterance(): void {
    console.log(
      '🛑 [VoiceSocket] Utterance ended — waiting for server final result'
    );

    this.utteranceEnded = true;

    this.clearFinalTranscriptTimer();
  }

  // --------------------------------------------------
  // DISCONNECT
  // --------------------------------------------------

  public disconnect(): void {
    console.log('🔴 [VoiceSocket] disconnect() called', {
      readyState: this.socket?.readyState ?? null,
      state: this.currentState,
    });

    this.explicitlyDisconnected = true;

    this.clearReconnectTimer();

    this.pcmQueue = [];

    const socket = this.socket;

    this.socket = null;

    this.socketGeneration += 1;

    if (socket) {
      try {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => {
            try {
              socket.close(
                1000,
                'Client disconnected before open'
              );
            } catch {
              // Ignore close errors
            }
          };
        } else if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CLOSING
        ) {
          socket.close(1000, 'Client disconnected');
        }
      } catch (error) {
        console.warn(
          '⚠️ [VoiceSocket] Error while closing socket:',
          error
        );
      }
    }

    this.updateState('DISCONNECTED');
  }

  // --------------------------------------------------
  // STATE
  // --------------------------------------------------

  public getState(): VoiceSocketState {
    return this.currentState;
  }

  public isConnected(): boolean {
    return (
      this.socket !== null &&
      this.socket.readyState === WebSocket.OPEN
    );
  }

  // --------------------------------------------------
  // WAIT FOR CONNECTION
  // --------------------------------------------------

  public whenConnected(timeoutMs = 8000): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    const socket = this.socket;

    if (
      !socket ||
      socket.readyState !== WebSocket.CONNECTING
    ) {
      return Promise.reject(
        new Error('WebSocket is not connecting')
      );
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;

        settled = true;

        clearTimeout(timer);

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const timer = setTimeout(() => {
        finish(
          new Error(
            'Timed out waiting for WebSocket OPEN'
          )
        );
      }, timeoutMs);

      const previousOpen = socket.onopen;
      const previousClose = socket.onclose;
      const previousError = socket.onerror;

      socket.onopen = (event) => {
        previousOpen?.call(socket, event);

        finish();
      };

      socket.onerror = (event) => {
        previousError?.call(socket, event);

        finish(
          new Error('WebSocket connection error')
        );
      };

      socket.onclose = (event) => {
        previousClose?.call(socket, event);

        finish(
          new Error(
            `WebSocket closed before OPEN (code ${event.code})`
          )
        );
      };
    });
  }

  // --------------------------------------------------
  // QUEUE PCM
  // --------------------------------------------------

  private queuePCM(
    pcmData: Float32Array,
    reason: string
  ): void {
    if (
      this.pcmQueue.length >=
      VoiceSocket.MAX_PCM_QUEUE
    ) {
      this.pcmQueue.shift();
    }

    this.pcmQueue.push(pcmData);

    console.log(
      `⏳ [VoiceSocket] Audio queued (${reason})`,
      {
        queueLength: this.pcmQueue.length,
        samples: pcmData.length,
      }
    );
  }

  // --------------------------------------------------
  // FLOAT32 -> PCM16
  // --------------------------------------------------

  private sendPCM16(
    pcmData: Float32Array
  ): void {
    const pcm16 = new Int16Array(
      pcmData.length
    );

    for (
      let index = 0;
      index < pcmData.length;
      index += 1
    ) {
      const sample = Math.max(
        -1,
        Math.min(1, pcmData[index])
      );

      pcm16[index] =
        sample < 0
          ? sample * 0x8000
          : sample * 0x7fff;
    }

    if (
      this.socket?.readyState !==
      WebSocket.OPEN
    ) {
      this.queuePCM(
        pcmData,
        'CLOSED_DURING_CONVERSION'
      );

      return;
    }

    // IMPORTANT:
    // Send BINARY PCM16.
    //
    // Do NOT use:
    // socket.send(JSON.stringify(...))
    //
    // faster-whisper-server expects binary audio.
    this.socket.send(pcm16.buffer);
  }

  // --------------------------------------------------
  // OPEN SOCKET
  // --------------------------------------------------

  private openSocket(): void {
    this.updateState('CONNECTING');

    const generation =
      ++this.socketGeneration;

    try {
      const socket = new WebSocket(
        this.config.url
      );

      this.socket = socket;

      socket.binaryType = 'arraybuffer';

      // ----------------------------------------------
      // OPEN
      // ----------------------------------------------

      socket.onopen = () => {
        if (
          generation !==
            this.socketGeneration ||
          this.socket !== socket ||
          this.explicitlyDisconnected
        ) {
          console.warn(
            '⚠️ [VoiceSocket] Stale/cancelled socket opened — closing it'
          );

          try {
            socket.close(
              1000,
              'Stale socket'
            );
          } catch {
            // Ignore
          }

          return;
        }

        console.log(
          '🟢 [VoiceSocket] WebSocket OPEN',
          {
            readyState: socket.readyState,
            generation,
            url: this.config.url,
          }
        );

        this.reconnectAttempts = 0;

        this.updateState('CONNECTED');

        /**
         * VERY IMPORTANT
         *
         * Do NOT send a JSON setup frame here.
         *
         * The faster-whisper-server implementation
         * calls:
         *
         *     ws.receive_bytes()
         *
         * Therefore the first data sent through this
         * WebSocket must be binary PCM audio.
         */

        console.log(
          '🎧 [VoiceSocket] STT WebSocket ready — binary PCM16 only'
        );

        // ------------------------------------------
        // FLUSH QUEUED AUDIO
        // ------------------------------------------

        if (
          this.pcmQueue.length > 0 &&
          socket.readyState === WebSocket.OPEN
        ) {
          console.log(
            '🚿 [VoiceSocket] Flushing queued PCM AFTER WebSocket OPEN',
            {
              count: this.pcmQueue.length,
            }
          );

          const queued =
            this.pcmQueue;

          this.pcmQueue = [];

          for (
            const frame of queued
          ) {
            if (
              socket.readyState !==
              WebSocket.OPEN
            ) {
              break;
            }

            this.sendPCM16(frame);
          }
        }
      };

      // ----------------------------------------------
      // MESSAGE
      // ----------------------------------------------

      socket.onmessage = (
        event: MessageEvent
      ) => {
        if (
          generation !==
            this.socketGeneration ||
          this.socket !== socket
        ) {
          return;
        }

        console.log(
          '📥 [VoiceSocket] Message received',
          {
            type: typeof event.data,
            data: event.data,
          }
        );

        this.handleMessage(
          event.data
        );
      };

      // ----------------------------------------------
      // ERROR
      // ----------------------------------------------

      socket.onerror = (
        event
      ) => {
        if (
          generation !==
            this.socketGeneration ||
          this.socket !== socket
        ) {
          return;
        }

        console.error(
          '🔴 [VoiceSocket] WebSocket ERROR',
          {
            event,
            readyState:
              socket.readyState,
            url: this.config.url,
            generation,
          }
        );

        this.updateState('ERROR');

        this.config.onError?.(
          'WebSocket connection error.'
        );
      };

      // ----------------------------------------------
      // CLOSE
      // ----------------------------------------------

      socket.onclose = (
        event
      ) => {
        if (
          generation !==
            this.socketGeneration ||
          this.socket !== socket
        ) {
          return;
        }

        console.error(
          '🔴 [VoiceSocket] WebSocket CLOSED',
          {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            readyStateAtClose:
              socket.readyState,
            explicitlyDisconnected:
              this.explicitlyDisconnected,
            utteranceEnded:
              this.utteranceEnded,
            latestTranscript:
              this.latestTranscript,
            generation,
            timestamp:
              new Date().toISOString(),
          }
        );

        // ------------------------------------------
        // FALLBACK FINAL TRANSCRIPT
        // ------------------------------------------

        if (
          !this.finalDispatched &&
          this.utteranceEnded &&
          this.latestTranscript
        ) {
          console.log(
            '🏁 [VoiceSocket] Close fallback — dispatching accumulated transcript'
          );

          const transcriptEvent: STTTranscriptEvent =
            {
              transcript:
                this.latestTranscript,
              isFinal: true,
            };

          this.config.onTranscript(
            transcriptEvent
          );

          this.resetUtteranceState();
        } else if (
          this.utteranceEnded &&
          !this.latestTranscript
        ) {
          console.warn(
            '⚠️ [VoiceSocket] Utterance ended with empty transcript'
          );

          this.resetUtteranceState();
        }

        this.socket = null;

        this.updateState(
          'DISCONNECTED'
        );

        /**
         * Do not automatically reconnect.
         *
         * The React voice pipeline will create
         * another connection when required.
         */
        if (event.code === 1006) {
          console.error(
            '🔴 [VoiceSocket] Abnormal close 1006. ' +
              'Socket will NOT automatically reconnect.'
          );
        } else {
          console.log(
            'ℹ️ [VoiceSocket] Socket is now DISCONNECTED',
            {
              code: event.code,
              reason: event.reason,
            }
          );
        }
      };
    } catch (error: unknown) {
      if (
        generation !==
        this.socketGeneration
      ) {
        return;
      }

      this.updateState('ERROR');

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to connect to speech-to-text service.';

      console.error(
        '🔴 [VoiceSocket] Failed to construct WebSocket:',
        error
      );

      this.config.onError?.(
        message
      );
    }
  }

  // --------------------------------------------------
  // HANDLE STT MESSAGE
  // --------------------------------------------------

  private handleMessage(
    message: string
  ): void {
    console.log(
      '📥 [VoiceSocket] RAW STT:',
      message
    );

    try {
      const data =
        JSON.parse(message) as STTMessage;

      // Some STT servers may return transcript
      // instead of text.
      const rawText =
        typeof data.text === 'string'
          ? data.text
          : typeof data.transcript === 'string'
          ? data.transcript
          : '';

      if (!rawText) {
        console.log(
          '⚠️ [VoiceSocket] No transcript field:',
          data
        );

        return;
      }

      const transcriptText =
        rawText.trim();

      if (!transcriptText) {
        console.log(
          'ℹ️ [VoiceSocket] Empty STT chunk received, ignoring'
        );

        return;
      }

      const serverIsFinal =
        Boolean(
          data.is_final ??
            data.isFinal
        );

      // Keep longest transcript because
      // streaming STT may send incremental text.
      if (
        !this.finalDispatched &&
        transcriptText.length >
          this.latestTranscript.length
      ) {
        this.latestTranscript =
          transcriptText;
      }

      // ------------------------------------------
      // FINAL
      // ------------------------------------------

      if (serverIsFinal) {
        if (
          this.finalDispatched
        ) {
          return;
        }

        this.finalDispatched =
          true;

        const event: STTTranscriptEvent =
          {
            transcript:
              this.latestTranscript ||
              transcriptText,
            isFinal: true,
          };

        if (
          typeof data.confidence ===
          'number'
        ) {
          event.confidence =
            data.confidence;
        }

        console.log(
          '🏁 [VoiceSocket] SERVER-FINAL transcript dispatched:',
          event
        );

        this.config.onTranscript(
          event
        );

        this.resetUtteranceState();

        return;
      }

      // ------------------------------------------
      // PARTIAL
      // ------------------------------------------

      const event: STTTranscriptEvent =
        {
          transcript:
            this.latestTranscript,
          isFinal: false,
        };

      if (
        typeof data.confidence ===
        'number'
      ) {
        event.confidence =
          data.confidence;
      }

      console.log(
        '📝 [VoiceSocket] Partial transcript:',
        event
      );

      this.config.onTranscript(
        event
      );
    } catch (error) {
      console.error(
        '⚠️ [VoiceSocket] Could not parse STT message:',
        {
          message,
          error,
        }
      );
    }
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(
        this.reconnectTimer
      );
    }

    this.reconnectTimer = null;
  }

  private clearFinalTranscriptTimer(): void {
    if (
      this.finalTranscriptTimer
    ) {
      clearTimeout(
        this.finalTranscriptTimer
      );
    }

    this.finalTranscriptTimer =
      null;
  }

  private resetUtteranceState(): void {
    this.utteranceEnded =
      false;

    this.finalDispatched =
      false;

    this.latestTranscript =
      '';
  }

  private updateState(
    state: VoiceSocketState
  ): void {
    this.currentState =
      state;

    this.config.onStateChange?.(
      state
    );
  }
}

