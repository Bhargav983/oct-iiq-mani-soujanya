import { WakeWordEngine } from 'openwakeword-wasm-browser';
import * as ort from 'onnxruntime-web';
import { configureVoiceRuntime, voiceAssets } from './voiceRuntime';

configureVoiceRuntime(ort);

export type WakeWordServiceOptions = {
  keywordPath: string;
  modelPath: string;
  onWakeWord: () => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
};

/** 0.1.1 has no public disposal API. This adapter is pinned and tested. */
type Releasable = { release: () => Promise<void> | void };
type OwnedEngine = WakeWordEngine & {
  _processingQueue?: Promise<unknown>;
  _melspecModel?: Releasable;
  _embeddingModel?: Releasable;
  _vadModel?: Releasable;
  _keywordModels?: Record<string, { session: Releasable }>;
  _vadState?: { h?: { dispose?: () => void }; c?: { dispose?: () => void } };
};

export class WakeWordService {
  private engine: OwnedEngine | null = null;
  private active = false;
  private initialization: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private stopRequested = false;

  public constructor(private readonly options: WakeWordServiceOptions) {}
  public get isActive(): boolean { return this.active; }

  public async start(): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.active) return;
    if (this.initialization) return this.initialization;
    this.stopRequested = false;
    this.initialization = this.initialize();
    try { await this.initialization; }
    finally { this.initialization = null; }
  }

  private async initialize(): Promise<void> {
    let stage = 'creating the wake engine';
    try {
      configureVoiceRuntime(ort);
      const keyword = this.options.keywordPath.split('/').pop()?.replace(/\.onnx$/i, '') || 'hey_aira';
      const engine: OwnedEngine = new WakeWordEngine({
        keywords: [keyword], modelFiles: { [keyword]: keyword + '.onnx' },
        baseAssetUrl: this.options.modelPath.replace(/\/+$/, ''),
        ortWasmPath: voiceAssets.ortPath,
        executionProviders: ['wasm'], detectionThreshold: 0.5, cooldownMs: 2000,
      });
      this.engine = engine;
      engine.on('detect', () => {
        if (this.active && !this.stopRequested) this.options.onWakeWord();
      });
      engine.on('error', (payload: unknown) => {
        if (!this.active || this.stopRequested) return;
        const error = (payload as { error?: unknown })?.error ?? payload;
        this.options.onError?.('Wake inference failed: ' + describeError(error));
        void this.stop();
      });
      stage = 'loading wake models from ' + this.options.modelPath + ' (ONNX ' + voiceAssets.ortVersion + ')';
      await engine.load();
      if (this.stopRequested) return;
      stage = 'starting the microphone and AudioWorklet';
      await engine.start();
      if (!this.stopRequested) this.active = true;
    } catch (original: unknown) {
      this.active = false;
      await this.disposeEngine();
      if (this.stopRequested) return;
      const error = new Error('Wake word failed while ' + stage + ': ' + describeError(original));
      error.name = original instanceof Error ? original.name : 'WakeWordInitializationError';
      (error as Error & { cause?: unknown }).cause = original;
      throw error;
    }
  }

  private async disposeEngine(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    try { await engine.stop(); } catch (error) { console.warn('Wake microphone cleanup failed', error); }
    // Let the last inference finish before releasing its sessions.
    try { await engine._processingQueue; } catch { /* already reported */ }
    const sessions = new Set([
      engine._melspecModel, engine._embeddingModel, engine._vadModel,
      ...(Object.values(engine._keywordModels || {}) as { session: Releasable }[]).map(model => model.session),
    ]);
    for (const session of sessions) {
      try { await session?.release(); } catch (error) { console.warn('Wake model cleanup failed', error); }
    }
    engine._vadState?.h?.dispose?.();
    engine._vadState?.c?.dispose?.();
  }

  public async stop(): Promise<void> {
    this.stopRequested = true;
    this.active = false;
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      try { await this.initialization; } catch { /* start reports the failure */ }
      await this.disposeEngine();
    })();
    try { await this.stopping; }
    finally { this.stopping = null; }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.name + ': ' + error.message;
  return typeof error === 'number' ? 'ONNX/WASM error code ' + error : String(error);
}
