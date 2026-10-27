import assets from '../voiceAssets.json';

/** VAD and wake inference share the same JS/WASM runtime and flags. */
export function configureVoiceRuntime(ort: any): void {
  ort.env.wasm.wasmPaths = assets.ortPath;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.simd = true;
}

export { assets as voiceAssets };
