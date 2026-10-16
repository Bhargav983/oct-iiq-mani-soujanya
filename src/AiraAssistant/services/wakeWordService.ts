import { WakeWordEngine } from 'openwakeword-wasm-browser';
import * as ort from 'onnxruntime-web';

// Configure onnxruntime-web WebAssembly backend globally before engine instantiation
if (typeof window !== 'undefined') {
  ort.env.wasm.wasmPaths = '/vad/';
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = false; // Set to false to avoid WebKit WASM allocation limits
}

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
 */
export class WakeWordService {
  private readonly options: WakeWordServiceOptions;
  private engine: WakeWordEngine | null = null;
  private animationFrame: number | null = null;
  private active = false;
  /** True while start() is between its async boundaries. */
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
      // Re-affirm WASM path configuration right before loading
      ort.env.wasm.wasmPaths = '/vad/';
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;

      // Derive keyword name from the model file: '.../hey_aira.onnx' -> 'hey_aira'
      const keywordName =
        this.options.keywordPath.split('/').pop()?.replace(/\.onnx$/i, '') || 'hey_aira';
      const baseAssetUrl = this.options.modelPath.replace(/\/+$/, '') || '/openwakeword/models';

      console.log(`🟣 [WakeWord] Creating WakeWordEngine for keyword: ${keywordName}`);
      
      const engine = new WakeWordEngine({
        keywords: [keywordName],
        modelFiles: {
          [keywordName]: `${keywordName}.onnx`,
          melspectrogram: 'melspectrogram.onnx',
          embedding: 'embedding_model.onnx',
        },
        baseAssetUrl,
        detectionThreshold: 0.5,
        cooldownMs: 2000,
      });

      // Event wiring
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

      console.log('🟣 [WakeWord] Calling engine.load()...');
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
      // Handle fallback mode instead of crashing consumer contexts
      this.fallbackMode = true;
      this.options.onError?.('WakeWord could not initialize on this device backend.');
    } finally {
      this.initializing = false;
    }
  }

  public async stop(): Promise<void> {
    console.log('🟣 [WakeWord] STOP requested', {
      active: this.active,
      initializing: this.initializing,
    });
    this.stopRequested = true;
    this.active = false;

    while (this.initializing) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;

    try {
      await this.engine?.stop();
    } catch (error) {
      console.warn('⚠️ [WakeWord] Engine stop ignored:', error);
    }
    this.engine = null;
    this.fallbackMode = false;
    this.stopRequested = false;
  }
}