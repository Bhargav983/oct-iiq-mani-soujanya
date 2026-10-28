import { ANDROID_AUDIO_EVENT, browserAudioReady } from '../services/androidAudio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserMicrophone, type MicrophoneLease } from '../services/browserMicrophone';
import { voiceCapabilities } from '../services/voiceEnvironment';
import { isIosApp, voiceLocale } from '../services/nativeVoice';
import type { UseInlineDictationResult } from './useInlineDictation';

/** SpeechRecognition.stop() is asynchronous; ownership lasts until end. */
export function useBrowserDictation(lang: string, onText: (text: string) => void): UseInlineDictationResult {
  const active = useRef<{ recognition: any; lease: MicrophoneLease | null; cancelled: boolean; ended: boolean; end: () => void; done: Promise<void> } | null>(null);
  const callback = useRef(onText);
  callback.current = onText;
  const mounted = useRef(true);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abort = useCallback(async () => {
    const session = active.current;
    if (!session || session.ended) return;
    session.cancelled = true;
    if (!session.recognition) { session.end(); return; }
    session.recognition.abort();
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([session.done, new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Dictation microphone is still stopping. Reload the page before retrying.')), 5000);
      })]);
    } finally { clearTimeout(timer!); }
  }, []);

  const stop = useCallback(() => {
    const session = active.current;
    if (!session) return;
    if (!session.recognition) { void abort().catch(() => {}); return; }
    try { session.recognition.stop(); }
    catch (error) { setErrorMessage(String(error)); }
  }, [abort]);

  const start = useCallback(() => {
    const Api = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Api || active.current || isIosApp()) return;
    if (!browserAudioReady()) {
      setErrorMessage('Allow microphone access in Android settings and return to the app to use voice.');
      return;
    }
    let resolveEnd: () => void = () => {};
    const session = { recognition: null as any, lease: null as MicrophoneLease | null, cancelled: false, ended: false, end: () => {},
      done: new Promise<void>(resolve => { resolveEnd = resolve; }) };
    session.end = () => {
      if (session.ended) return;
      session.ended = true;
      session.lease?.release();
      if (active.current === session) {
        active.current = null;
        if (mounted.current) { setListening(false); setInterimText(''); }
      }
      resolveEnd();
    };
    active.current = session;
    setErrorMessage(null); setInterimText(''); setListening(true);
    void (async () => {
      try {
        session.lease = await browserMicrophone.acquire('dictation', abort, () => mounted.current && !session.cancelled && !document.hidden);
        if (!session.lease || session.cancelled || !mounted.current) { session.end(); return; }
        const recognition = new Api();
        session.recognition = recognition;
        recognition.lang = voiceLocale(lang);
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          if (session.cancelled || session.ended || !session.lease?.isCurrent() || !mounted.current) return;
          let final = '', interim = '';
          for (let i = 0; i < event.results.length; i += 1) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
          }
          setInterimText(interim.trim());
          if (final.trim()) callback.current(final.trim());
        };
        recognition.onerror = (event: any) => {
          if (mounted.current && !session.cancelled && event.error !== 'aborted' && event.error !== 'no-speech') setErrorMessage(event.error);
        };
        recognition.onend = session.end;
        recognition.start();
      } catch (error) {
        session.end();
        if (mounted.current && !session.cancelled && (error as Error).name !== 'AbortError') setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [abort, lang]);

  useEffect(() => {
    mounted.current = true;
    const background = (event: Event) => { if (document.hidden || event.type === 'pagehide' || !browserAudioReady()) void abort().catch(error => { if (mounted.current) setErrorMessage(String(error)); }); };
    window.addEventListener(ANDROID_AUDIO_EVENT, background);
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', background);
    return () => {
      mounted.current = false;
      window.removeEventListener(ANDROID_AUDIO_EVENT, background);
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', background);
      void abort().catch(() => {});
    };
  }, [abort]);
  return { supported: voiceCapabilities().dictation, listening, interimText, errorMessage, start, stop };
}
