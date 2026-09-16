import { WakeWordEngine } from 'openwakeword-wasm-browser';

export type WakeWordServiceOptions = {
  keywordPath: string;
  modelPath: string;
  onWakeWord: () => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
};

/**
 * Wrapper around openwakeword-wasm-browser's WakeWordEngine.
 *
 * The engine manages its own mic capture (AudioWorklet) and ONNX inference;
 * this service only handles lifecycle, event wiring and level metering.
 * Audio never leaves the device — the only network use is the browser
 * fetching the ONNX models.
 */
export class WakeWordService {
  private readonly options: WakeWordServiceOptions;
  private engine: WakeWordEngine | null = null;
  private animationFrame: number | null = null;
  private active = false;
  /** True while start() is between its async boundaries (engine init, getUserMedia, AudioContext). */
  private initializing = false;
  /** Set by stop() so start() bails out cleanly at the next await boundary. */
  private stopRequested = false;
  private fallbackMode = false;

  public constructor(options: WakeWordServiceOptions) {
    this.options = options;
  }

  /** True only when the engine finished initializing and is actively listening. */
  public get isActive(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    console.log('🔍 [Debug] WakeWordService.start() called', { options: this.options });
    console.log('🟣 [WakeWord] START requested', { active: this.active });
    if (this.active || this.initializing) return;
    this.stopRequested = false;
    this.initializing = true;

    try {
      // Derive keyword name from the model file, e.g. '.../hey_aira.onnx' -> 'hey_aira'
      const keywordName =
        this.options.keywordPath.split('/').pop()?.replace(/\.onnx$/i, '') || 'hey_aira';
      const baseAssetUrl = this.options.modelPath.replace(/\/+$/, '') || '/openwakeword/models';

      console.log(`🟣 [WakeWord] Creating WakeWordEngine for keyword: ${keywordName}`);
      const engine = new WakeWordEngine({
        keywords: [keywordName],
        // Map custom keyword -> actual .onnx file inside baseAssetUrl
        modelFiles: { [keywordName]: `${keywordName}.onnx` },
        baseAssetUrl,
        detectionThreshold: 0.5,
        cooldownMs: 2000,
      });

      // Event wiring (the engine uses an emitter, not constructor callbacks)
      engine.on('detect', () => {
        console.log('🟢 [WakeWord] DETECTED "HEY AIRA"');
        this.options.onWakeWord();
      });
      engine.on('error', (payload: unknown) => {
        const message = payload instanceof Error
          ? payload.message
          : (payload as { error?: Error })?.error?.message ?? 'Wake-word engine error';
        console.error('🔴 [WakeWord] Engine error:', message);
        this.options.onError?.(message);
      });

      await engine.load();
      console.log('🟢 [WakeWord] Engine loaded successfully');
      if (this.stopRequested) {
        console.log('🟣 [WakeWord] Stop requested during load — aborting start');
        await engine.stop();
        return;
      }

      // Engine start() acquires the mic + AudioWorklet internally.
      await engine.start();
      this.engine = engine;
      this.active = true;
      console.log('🟢 [WakeWord] LISTENING FOR "HEY AIRA"');
    } catch (error: unknown) {
      console.error('🔴 [WakeWord] start() threw — full error:', error);
      await this.stop();
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  public async stop(): Promise<void> {
    console.log('🟣 [WakeWord] STOP requested', {
      active: this.active,
      initializing: this.initializing,
    });
    // Flag any in-flight start() so it aborts at its next await boundary.
    this.stopRequested = true;
    this.active = false;

    // If start() is still running, wait for it to unwind before tearing down.
    while (this.initializing) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;

    try {
      // Engine stop() releases the AudioWorklet, closes the AudioContext and
      // stops the mic tracks it acquired internally.
      await this.engine?.stop();
    } catch (error) {
      console.warn('⚠️ [WakeWord] Engine stop ignored:', error);
    }
    this.engine = null;
    this.fallbackMode = false;
    this.stopRequested = false;
  }
}
