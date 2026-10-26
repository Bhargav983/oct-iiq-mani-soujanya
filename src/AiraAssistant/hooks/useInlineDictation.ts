import { useCallback, useEffect, useRef, useState } from 'react';
import { hasNativeVoice, isIosApp, startNativeVoice, voiceLocale, requestNativeReady, listenNativeVoice } from '../services/nativeVoice';

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export interface UseInlineDictationResult {
  supported: boolean;
  listening: boolean;
  interimText: string;
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
}

/** A short, browser-native dictation session intended for filling a text input. */
function useBrowserDictation(
  lang: string,
  onText: (text: string) => void,
): UseInlineDictationResult {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supported = typeof window !== 'undefined' && Boolean(
    (window as SpeechRecognitionWindow).SpeechRecognition
      || (window as SpeechRecognitionWindow).webkitSpeechRecognition,
  );

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // The browser may already have finished the single-shot session.
    }
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionApi = (window as SpeechRecognitionWindow).SpeechRecognition
      || (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognitionApi || recognitionRef.current) return;

    setErrorMessage(null);
    setInterimText('');
    const recognition = new SpeechRecognitionApi();
    recognition.lang = lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = '';
      let partialText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else partialText += result[0].transcript;
      }
      setInterimText(partialText.trim());
      if (finalText.trim()) onTextRef.current(finalText.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setErrorMessage(event.error);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterimText('');
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setErrorMessage('Unable to start browser dictation.');
    }
  }, [lang]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
  }, []);

  return { supported, listening, interimText, errorMessage, start, stop };
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
