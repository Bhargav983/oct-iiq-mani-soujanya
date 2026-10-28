import { useBrowserDictation } from './useBrowserDictation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasNativeVoice, isIosApp, startNativeVoice, voiceLocale, requestNativeReady, listenNativeVoice } from '../services/nativeVoice';

export interface UseInlineDictationResult {
  supported: boolean;
  listening: boolean;
  interimText: string;
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
}

function useNativeDictation(lang: string, onText: (text: string) => void): UseInlineDictationResult {
  const [supported, setSupported] = useState(hasNativeVoice);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const session = useRef<ReturnType<typeof startNativeVoice> | null>(null);
  const callback = useRef(onText);
  callback.current = onText;
  const release = useCallback(() => {
    if (!session.current) return;
    session.current.cancel(); session.current = null;
    window.dispatchEvent(new Event('airaDictationEnd'));
  }, []);
  useEffect(() => {
    const ready = () => setSupported(hasNativeVoice());
    const owner = (event: Event) => {
      if ((event as CustomEvent).detail !== 'dictation') {
        release(); setListening(false); setInterimText('');
      }
    };
    const background = () => {
      if (document.hidden) { release(); setListening(false); setInterimText(''); }
    };
    const unsubscribe = listenNativeVoice(event => {
      if (event.event === 'appState' && !event.active) {
        release(); setListening(false); setInterimText('');
      }
    });
    window.addEventListener('airaNativeReady', ready);
    window.addEventListener('airaVoiceOwner', owner);
    document.addEventListener('visibilitychange', background);
    if (isIosApp()) requestNativeReady();
    return () => {
      window.removeEventListener('airaNativeReady', ready);
      window.removeEventListener('airaVoiceOwner', owner);
      document.removeEventListener('visibilitychange', background);
      unsubscribe();
      release();
    };
  }, [release]);
  const start = useCallback(() => {
    if (!hasNativeVoice() || session.current) return;
    setErrorMessage(null); setInterimText(''); setListening(true);
    let final = '';
    session.current = startNativeVoice('dictation', voiceLocale(lang), event => {
      if (event.event === 'result') {
        const text = event.results?.[0]?.transcript || '';
        setInterimText(text);
        if (event.isFinal) final = text;
      }
      if (event.event === 'error' && event.error !== 'aborted' && event.error !== 'no-speech') {
        setErrorMessage(event.message || event.error || 'Dictation failed.');
      }
      if (event.event === 'end' || event.event === 'interrupted') {
        session.current?.cancel(); session.current = null;
        setListening(false); setInterimText('');
        if (final.trim()) callback.current(final.trim());
        window.dispatchEvent(new Event('airaDictationEnd'));
      }
    });
  }, [lang]);
  return { supported, listening, interimText, errorMessage, start, stop: () => session.current?.stop() };
}

export function useInlineDictation(lang: string, onText: (text: string) => void): UseInlineDictationResult {
  const browser = useBrowserDictation(lang, onText);
  const native = useNativeDictation(lang, onText);
  return isIosApp() ? native : browser;
}
