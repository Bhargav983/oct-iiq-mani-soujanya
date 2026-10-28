import { detectVoiceRuntime } from './voiceEnvironment';

export const ANDROID_AUDIO_EVENT = 'aira-android-audio';
type AudioState = { version: 1; permission: 'pending' | 'granted' | 'denied'; foreground: boolean };

/** Older wrappers and ordinary browsers retain their existing capture path. */
export function browserAudioReady(): boolean {
  if (detectVoiceRuntime() !== 'android-webview') return true;
  const state = (window as any).__AIRA_ANDROID_AUDIO__ as AudioState | undefined;
  let bridged = /Air2oAndroidAudio\/1\b/.test(navigator.userAgent);
  try {
    bridged = bridged || JSON.parse((window as any).ReactNativeWebView?.injectedObjectJson?.() || '{}').airaAndroidAudioVersion === 1;
  } catch { /* Legacy wrappers have no readiness contract. */ }
  if (!state && bridged) return false;
  return !state || (state.version === 1 && state.permission === 'granted' && state.foreground === true);
}

export function requestAndroidAudioState() {
  if (detectVoiceRuntime() === 'android-webview') {
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'AIRA_ANDROID_AUDIO_STATE', version: 1 }));
  }
}
