import WakeWordEngine from 'openwakeword-wasm-browser';

const TARGET_SAMPLE_RATE = 16000;

export type WakeWordServiceOptions = {
  accessKey: string;
  keywordPath: string;
  modelPath: string;
  onWakeWord: () => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
};

export class WakeWordService {
  private readonly options: WakeWordServiceOptions;
  private engine: WakeWordEngine | null = null;
  private active = false;
  private fallbackMode = false;
  private unsubscribeDetect: (() => void) | null = null;
  private unsubscribeError: (() => void) | null = null;
  private unsubscribeSpeechStart: (() => void) | null = null;
  private unsubscribeSpeechEnd: (() => void) | null = null;

  public constructor(options: WakeWordServiceOptions) {
    this.options = options;
  }

  public async start(): Promise<void> {
    console.log('🟣 [WakeWord] START requested', {
      active: this.active,
      hasAccessKey: Boolean(this.options.accessKey),
    });

    if (this.active) {
      return;
    }

    if (!this.options.accessKey) {
      throw new Error('Wake-word detection is not configured.');
    }

    try {
      this.engine = new WakeWordEngine({
        baseAssetUrl: '/openwakeword/models',
        ortWasmPath: '/openwakeword/ort/',
        keywords: ['hey_jarvis'],
        detectionThreshold: 0.5,
        cooldownMs: 2000,
      });

      console.log('🟣 [WakeWord] Loading OpenWakeWord models...');

      await this.engine.load();

      console.log('🟢 [WakeWord] Models loaded');

      this.unsubscribeDetect = this.engine.on(
        'detect',
        ({ keyword, score }) => {
          console.log('🟢 [WakeWord] Detected:', {
            keyword,
            score,
          });

          this.options.onWakeWord();
        }
      );

      this.unsubscribeSpeechStart = this.engine.on(
        'speech-start',
        () => {
          this.options.onLevel?.(1);
        }
      );

      this.unsubscribeSpeechEnd = this.engine.on(
        'speech-end',
        () => {
          this.options.onLevel?.(0);
        }
      );

      this.unsubscribeError = this.engine.on(
        'error',
        (error) => {
          console.error('🔴 [WakeWord] Error:', error);

          const message =
            error instanceof Error
              ? error.message
              : String(error);

          this.options.onError?.(message);
        }
      );

      console.log('🟣 [WakeWord] Starting microphone...');

      await this.engine.start();

      this.active = true;
      this.fallbackMode = false;

      console.log('🟢 [WakeWord] Listening for "hey jarvis"');
    } catch (error: unknown) {
      console.error('🔴 [WakeWord] Start failed:', error);

      await this.stop();

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to start wake-word detection.';

      this.options.onError?.(message);

      throw error;
    }
  }

  public async stop(): Promise<void> {
    console.log('🟣 [WakeWord] STOP requested', {
      active: this.active,
    });

    this.active = false;

    this.unsubscribeDetect?.();
    this.unsubscribeError?.();
    this.unsubscribeSpeechStart?.();
    this.unsubscribeSpeechEnd?.();

    this.unsubscribeDetect = null;
    this.unsubscribeError = null;
    this.unsubscribeSpeechStart = null;
    this.unsubscribeSpeechEnd = null;

    if (this.engine) {
      try {
        await this.engine.stop();
      } catch (error) {
        console.warn(
          '⚠️ [WakeWord] Error while stopping engine:',
          error
        );
      }
    }

    this.engine = null;
    this.fallbackMode = false;

    console.log('🟢 [WakeWord] Stopped');
  }

  public isActive(): boolean {
    return this.active;
  }

  public isFallbackMode(): boolean {
    return this.fallbackMode;
  }
}