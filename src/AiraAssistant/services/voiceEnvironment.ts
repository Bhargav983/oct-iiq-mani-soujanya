export type VoiceRuntime = 'ios-webview' | 'android-webview' | 'browser';
type VoiceHost = Window & { __AIRA_IOS_APP__?: boolean; __AIRA_ANDROID_APP__?: boolean; ReactNativeWebView?: unknown };

export function detectVoiceRuntime(): VoiceRuntime {
  if (typeof window === 'undefined') return 'browser';
  const host = window as VoiceHost;
  const ua = navigator.userAgent;
  const embedded = Boolean(host.ReactNativeWebView) || /; wv\)|\bwv\b/.test(ua);
  if (host.__AIRA_ANDROID_APP__ || (embedded && /Android/i.test(ua))) return 'android-webview';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (host.__AIRA_IOS_APP__ || (embedded && ios)) return 'ios-webview';
  return 'browser';
}

export function voiceCapabilities() {
  const host = typeof window === 'undefined' ? undefined : window as any;
  return { runtime: detectVoiceRuntime(), capture: Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia),
    dictation: Boolean(host?.SpeechRecognition || host?.webkitSpeechRecognition), native: Boolean(host?.__AIRA_NATIVE_VOICE__) };
}
