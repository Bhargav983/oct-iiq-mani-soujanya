import { browserMicrophone } from './browserMicrophone';
import { isIosApp, listenNativeVoice } from './nativeVoice';
import { playTTS, ttsService } from './ttsService';
import type { AuthParamsInput } from './api';
export const MESSAGE_PLAYBACK_EVENT = 'airaMessagePlayback';
let generation = 0;
export const messagePlaybackActive = () => Boolean((window as any).__airaMessagePlayback__);
const signal = (active: boolean) => {
  (window as any).__airaMessagePlayback__ = active;
  window.dispatchEvent(new Event(MESSAGE_PLAYBACK_EVENT));
};
export function stopMessagePlayback() { ++generation; ttsService.stopCurrentAudio(); if (messagePlaybackActive()) signal(false); }
export async function playMessage(text: string, onStart?: () => void, auth?: AuthParamsInput) {
  stopMessagePlayback();
  const token = generation;
  signal(true);
  let lease;
  try {
    if (isIosApp()) {
      await new Promise<void>((resolve, reject) => {
        const requestId = `playback-${token}`;
        const timer = setTimeout(() => { off(); reject(new Error('Audio is not ready. Update the app and try again.')); }, 5000);
        const off = listenNativeVoice(event => {
          if (event.requestId !== requestId) return;
          clearTimeout(timer); off();
          if (event.event === 'playbackReady') resolve();
          else reject(new Error(event.message || 'Microphone could not stop.'));
        });
        (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'AIRA_PREPARE_PLAYBACK', requestId }));
      });
    } else {
      lease = await browserMicrophone.acquire('playback', async () => { stopMessagePlayback(); }, () => token === generation);
    }
    if (token === generation && !document.hidden) await playTTS(text, onStart, auth);
  } finally {
    lease?.release();
    if (token === generation) signal(false);
  }
}
