import { useEffect, useRef } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

const VAD_ASSET_PATH =
  'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/';

const ONNX_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

export default function VADTest() {
  const vadRef = useRef<MicVAD | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      console.log('🧪 [DIRECT-VAD] Starting direct MicVAD test');

      try {
        console.log('🧪 [DIRECT-VAD] Creating MicVAD');

        const vad = await MicVAD.new({
          model: 'v5',

          baseAssetPath: VAD_ASSET_PATH,
          onnxWASMBasePath: ONNX_WASM_PATH,

          startOnLoad: false,

          onSpeechStart: () => {
            console.log('🎤 [DIRECT-VAD] SPEECH START');
          },

          onSpeechEnd: () => {
            console.log('🛑 [DIRECT-VAD] SPEECH END');
          },

          onFrameProcessed: (_probabilities, frame) => {
            console.log('🎵 [DIRECT-VAD] FRAME', {
              samples: frame.length,
            });
          },
        });

        if (cancelled) {
          console.log('🧹 [DIRECT-VAD] Test cancelled before VAD became ready');
          await vad.destroy();
          return;
        }

        console.log('🟢 [DIRECT-VAD] MicVAD.new() SUCCESS');

        vadRef.current = vad;

        console.log('🟡 [DIRECT-VAD] Calling vad.start()');

        await vad.start();

        console.log('🟢 [DIRECT-VAD] vad.start() SUCCESS');
      } catch (error) {
        console.error('🔴 [DIRECT-VAD] FAILED:', error);
      }
    };

    void init();

    return () => {
      cancelled = true;

      const vad = vadRef.current;
      vadRef.current = null;

      if (vad) {
        console.log('🧹 [DIRECT-VAD] Destroying VAD');

        void vad.destroy().catch((error) => {
          console.error(
            '🔴 [DIRECT-VAD] Destroy failed:',
            error
          );
        });
      }
    };
  }, []);

  return (
    <div>
      <h2>Direct VAD Test</h2>
      <p>Check the browser console for VAD diagnostics.</p>
    </div>
  );
}