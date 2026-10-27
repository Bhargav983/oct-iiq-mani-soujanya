const path = require('node:path');
const assert = require('node:assert/strict');
const { run } = require('./voice-assets.cjs');

async function main() {
  run(false);
  const { WakeWordEngine } = await import('openwakeword-wasm-browser');
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const assets = require('../src/AiraAssistant/voiceAssets.json');
  const assetDir = relative => path.join(__dirname, '../public', relative).replaceAll('\\', '/');
  // Load conversation VAD alongside wake models to exercise the shared runtime.
  const vad = await ort.InferenceSession.create(assetDir(assets.vadPath + 'silero_vad_v5.onnx'), { executionProviders: ['wasm'] });
  try {
    const result = await vad.run({ input: new ort.Tensor('float32', new Float32Array(512), [1, 512]), state: new ort.Tensor('float32', new Float32Array(256), [2, 1, 128]), sr: new ort.Tensor('int64', [16000n], []) });
    assert(Number.isFinite(Number(result.output.data[0])));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const engine = new WakeWordEngine({ keywords: ['hey_aira'], modelFiles: { hey_aira: 'hey_aira.onnx' }, baseAssetUrl: assetDir(assets.wakePath) });
      const errors = [];
      engine.on('error', error => errors.push(String(error)));
      try {
        await engine.load();
        for (let frame = 0; frame < 40; frame += 1) await engine._processChunk(new Float32Array(1280), { emitEvents: false });
        assert.deepEqual(errors, []);
        const score = engine._keywordModels.hey_aira.scores.at(-1);
        assert(Number.isFinite(score) && score >= 0 && score <= 1);
        console.log(`Inference cycle ${cycle + 1}: all wake models ran, score=${score.toFixed(6)}`);
      } finally {
        await engine.stop();
        for (const session of [engine._melspecModel, engine._embeddingModel, engine._vadModel, engine._keywordModels?.hey_aira.session]) await session?.release();
        engine._vadState?.h?.dispose(); engine._vadState?.c?.dispose();
      }
    }
  } finally { await vad.release(); }
  console.log('Shared-runtime VAD/wake inference smoke test passed (synthetic silence, not recognition accuracy).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
