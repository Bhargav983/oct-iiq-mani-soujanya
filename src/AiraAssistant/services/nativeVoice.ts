export type NativeVoiceMode = 'wake' | 'conversation' | 'dictation';
export interface NativeVoiceEvent {
  event: string;
  requestId?: string;
  mode?: NativeVoiceMode;
  results?: { transcript: string }[];
  isFinal?: boolean;
  error?: string;
  message?: string;
  value?: number;
  active?: boolean;
}

type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  __AIRA_NATIVE_VOICE__?: boolean;
  __AIRA_IOS_APP__?: boolean;
  __AIRA_VOICE_DEBUG__?: boolean;
};

export function isIosApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as NativeWindow;
  return Boolean(w.__AIRA_IOS_APP__ || (w.ReactNativeWebView && /iPhone|iPad|iPod/.test(navigator.userAgent)));
}

export function hasNativeVoice(): boolean {
  return typeof window !== 'undefined' && Boolean((window as NativeWindow).__AIRA_NATIVE_VOICE__);
}

export function nativeVoiceDebug(): boolean {
  return Boolean((window as NativeWindow).__AIRA_VOICE_DEBUG__) || new URLSearchParams(window.location.search).has('voiceDebug');
}

function post(data: object) {
  (window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify(data));
}

export function requestNativeReady() { post({ type: 'AIRA_VOICE_READY' }); }

export function listenNativeVoice(handler: (event: NativeVoiceEvent) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<NativeVoiceEvent>).detail);
  window.addEventListener('airaNativeVoice', listener);
  return () => window.removeEventListener('airaNativeVoice', listener);
}

let sequence = 0;
/** Request-scoped listener prevents delayed native results reaching a newer session. */
export function startNativeVoice(mode: NativeVoiceMode, lang: string, handler: (event: NativeVoiceEvent) => void) {
  const requestId = `aira-${Date.now()}-${++sequence}`;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout>;
  const unsubscribe = listenNativeVoice(event => {
    if (event.requestId !== requestId || disposed) return;
    clearTimeout(timer);
    if (event.event === 'end') cleanup();
    handler(event);
  });
  function cleanup() {
    disposed = true;
    clearTimeout(timer);
    unsubscribe();
  }
  const command = (action: string) => post({ type: 'AIRA_VOICE', version: 1, action, requestId, mode, lang });
  window.dispatchEvent(new CustomEvent('airaVoiceOwner', { detail: mode }));
  timer = setTimeout(() => {
    if (disposed) return;
    command('cancel');
    cleanup();
    handler({ event: 'error', requestId, mode, message: 'Native microphone did not start. Check permissions and update the iOS app.' });
    handler({ event: 'end', requestId, mode });
  }, 20000);
  command('start');
  return {
    stop: () => { if (!disposed) command('stop'); },
    cancel: () => { if (!disposed) { cleanup(); command('cancel'); } },
  };
}

export function voiceLocale(lang: string): string {
  return lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-US';
}
