import { useCallback, useEffect, useRef, useState } from 'react';

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
export function useInlineDictation(
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
