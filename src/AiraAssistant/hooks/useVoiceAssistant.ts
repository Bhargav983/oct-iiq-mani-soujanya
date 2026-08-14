import { useMicVAD } from '@ricky0123/vad-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceState } from '../types';
import { VoiceSocket } from '../services/voiceSocket';
import { WakeWordService } from '../services/wakeWordService';

const SAMPLE_RATE = 16000;
const VAD_ASSET_PATH = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/';
const ONNX_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const DEFAULT_STT_URL = 'wss://n8ncustomer.air2o.net/ws/stt';
const WAKE_WORD_ACCESS_KEY = process.env.REACT_APP_OPENWAKEWORD_ACCESS_KEY || '';
const WAKE_WORD_KEYWORD_PATH = process.env.REACT_APP_OPENWAKEWORD_KEYWORD_PATH || '/hey-aira.onnx';
const WAKE_WORD_MODEL_PATH = process.env.REACT_APP_OPENWAKEWORD_MODEL_PATH || '/openwakeword/models/';

/** Streams VAD-detected PCM16 to STT and keeps a local OpenWakeWord wake-word listener armed between turns. */

type VoiceWindow = Window & {
  __airaVoiceAudioSources__?: Set<AudioBufferSourceNode>;
  __airaVoiceAudioContexts__?: Set<AudioContext>;
};

export interface UseVoiceAssistantResult {
  supported: boolean;
  wakeWordEnabled: boolean;
  state: VoiceState;
  listening: boolean;
  processing: boolean;
  transcript: string;
  done: boolean;
  errorMessage: string | null;
  audioLevel: number;
  start: () => void | Promise<void>;
  stop: () => void;
  cancel: () => void;
  accept: (textOverride?: string) => Promise<void>;
}

export function useVoiceAssistant(
  onResult: (text: string) => void | Promise<void>,
  _lang: string,
): UseVoiceAssistantResult {
  const supported = typeof window !== 'undefined'
    && typeof WebSocket !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);

  const socketRef = useRef<VoiceSocket | null>(null);
  const wakeWordRef = useRef<WakeWordService | null>(null);
  const stateRef = useRef<VoiceState>('IDLE');
  const transcriptRef = useRef('');
  const shouldListenRef = useRef(false);
  const streamingRef = useRef(false);
  const onResultRef = useRef(onResult);
  const isUnmountedRef = useRef(false);
  onResultRef.current = onResult;

  const updateState = useCallback((nextState: VoiceState) => {
    if (isUnmountedRef.current) return;
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const updateTranscript = useCallback((nextTranscript: string) => {
    if (isUnmountedRef.current) return;
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
  }, []);

  const bargeIn = useCallback(() => {
    if (typeof window === 'undefined' || isUnmountedRef.current) return;
    window.speechSynthesis?.cancel();
    const voiceWindow = window as VoiceWindow;
    voiceWindow.__airaVoiceAudioSources__?.forEach((source) => {
      try { source.stop(); } catch { /* source already stopped */ }
    });
    voiceWindow.__airaVoiceAudioSources__?.clear();
    voiceWindow.__airaVoiceAudioContexts__?.forEach((context) => {
      if (context.state === 'running') void context.suspend();
    });
  }, []);

  const stopWakeWord = useCallback(async () => {
    const listener = wakeWordRef.current;
    wakeWordRef.current = null;
    setWakeWordEnabled(false);
    await listener?.stop();
  }, []);

  const playChime = useCallback(() => {
    if (isUnmountedRef.current) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(720, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.19);
    oscillator.onended = () => { void context.close(); };
  }, []);

  const createSocket = useCallback(() => {
    if (isUnmountedRef.current) return;
    console.log('🔵 createSocket() called');
    const currentState = socketRef.current?.getState();
    console.log('🔵 existing socket state:', currentState);

    // Prevent tearing down an active connection if it's already CONNECTING or CONNECTED.
    if (socketRef.current && (currentState === 'CONNECTED' || currentState === 'CONNECTING')) {
      console.log('🔵 Socket already active or connecting, reusing existing instance');
      return;
    }

    // Only disconnect if the existing socket is actually CLOSED or in an ERROR state.
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    console.log('🔵 [VoiceAssistant] Creating NEW VoiceSocket');
    console.log('🔵 [VoiceAssistant] URL:',
      process.env.REACT_APP_STT_SOCKET_URL || DEFAULT_STT_URL
    );
    const socket = new VoiceSocket({
      url: process.env.REACT_APP_STT_SOCKET_URL || DEFAULT_STT_URL,
      sampleRate: SAMPLE_RATE,
      onTranscript: (event) => {
        if (isUnmountedRef.current) return;
        console.log('📝 [STT] Transcript event received:', event);

        if (event.transcript) {
          console.log('📝 [STT] Transcript:', event.transcript);
          updateTranscript(event.transcript);
        } else {
          console.log('⚠️ [STT] Empty transcript received');
        }

        if (event.isFinal) {
          console.log('🏁 [STT] FINAL TRANSCRIPT');

          streamingRef.current = false;
          shouldListenRef.current = false;
          setDone(true);
          updateState('IDLE');
        }
      },
      onError: (message) => {
        if (isUnmountedRef.current) return;
        if (shouldListenRef.current) {
          setErrorMessage(message);
          updateState('ERROR');
        }
      },
      onStateChange: (socketState) => {
        if (isUnmountedRef.current) return;
        if (socketState === 'CONNECTED' && shouldListenRef.current) {
          setErrorMessage(null);
          updateState('LISTENING');
        }
      },
    });
    socketRef.current = socket;
    socket.connect();
  }, [updateState, updateTranscript]);

  console.log('🧠 [VAD] Creating useMicVAD instance');
  const vad = useMicVAD({
    startOnLoad: false,
    model: 'v5',
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: ONNX_WASM_PATH,
    onSpeechStart: () => {
      if (isUnmountedRef.current) return;
      console.log('🎤 [VAD] SPEECH START', {
        shouldListen: shouldListenRef.current,
        streamingBefore: streamingRef.current,
        socketState: socketRef.current?.getState(),
      });

      if (!shouldListenRef.current) {
        console.log('⚠️ [VAD] Speech started but listening is disabled');
        return;
      }

      bargeIn();
      streamingRef.current = true;
      updateState('LISTENING');

      console.log('🎤 [VAD] NOW STREAMING AUDIO');
    },
    onFrameProcessed: (_probabilities, frame) => {
      if (isUnmountedRef.current) return;
      if (shouldListenRef.current && socketRef.current) {
        const audioFrame = resampleTo16k(frame, SAMPLE_RATE);

        if (streamingRef.current) {
          socketRef.current.sendAudioChunk(audioFrame);
        }
      }
    },
    onSpeechEnd: () => {
      if (isUnmountedRef.current) return;
      console.log('🛑 [VAD] SPEECH END', {
        streaming: streamingRef.current,
        shouldListen: shouldListenRef.current,
        socketState: socketRef.current?.getState(),
        transcript: transcriptRef.current,
      });

      if (!streamingRef.current) {
        console.log('⚠️ [VAD] Speech end ignored - was not streaming');
        return;
      }

      streamingRef.current = false;
      shouldListenRef.current = false;

      console.log('🛑 [VAD] Stopped sending audio, ending utterance');

      socketRef.current?.endUtterance();
      updateState('PROCESSING');
    },
    onVADMisfire: () => { streamingRef.current = false; },
  });
  console.log('🧠 [VAD] Hook state:', {
    loading: vad.loading,
    listening: vad.listening,
    userSpeaking: vad.userSpeaking,
    errored: vad.errored,
  });

  const armWakeWord = useCallback(async () => {
    if (isUnmountedRef.current) return;
    if (!supported || !WAKE_WORD_ACCESS_KEY || wakeWordRef.current || shouldListenRef.current) return;
    const listener = new WakeWordService({
      accessKey: WAKE_WORD_ACCESS_KEY,
      keywordPath: WAKE_WORD_KEYWORD_PATH,
      modelPath: WAKE_WORD_MODEL_PATH,
      onWakeWord: () => {
        if (isUnmountedRef.current) return;
        if (shouldListenRef.current) return;
        void stopWakeWord();
        playChime();
        shouldListenRef.current = true;
        streamingRef.current = false;
        setDone(false);
        setErrorMessage(null);
        updateTranscript('');
        updateState('LISTENING');
        createSocket();
        vad.start();
      },
      onLevel: setAudioLevel,
      onError: (message) => {
        if (isUnmountedRef.current) return;
        setErrorMessage(message);
      },
    });
    wakeWordRef.current = listener;
    try {
      await listener.start();
      setWakeWordEnabled(true);
    } catch (error: unknown) {
      if (wakeWordRef.current === listener) wakeWordRef.current = null;
      setWakeWordEnabled(false);
      // Browsers commonly require the first microphone grant to come from a user gesture.
      if (error instanceof Error && error.name !== 'NotAllowedError') setErrorMessage(error.message);
    }
  }, [createSocket, playChime, stopWakeWord, supported, updateState, updateTranscript, vad]);

  const start = useCallback(async () => {
    if (isUnmountedRef.current) return;
    console.log('🎙️ [VoiceAssistant] START called');

    if (!supported) {
      console.error('❌ [VoiceAssistant] Voice is not supported');
      return;
    }

    console.log('🎙️ [VoiceAssistant] Before stopping wake word');

    console.log('🟣 [WakeWord] NOT involved in manual voice test');

    console.log('🎙️ [VoiceAssistant] Starting voice session');

    shouldListenRef.current = true;
    streamingRef.current = false;

    setDone(false);
    setErrorMessage(null);
    updateTranscript('');
    updateState('LISTENING');

    console.log('🎙️ [VoiceAssistant] Creating STT socket');
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      console.log('🎤 [MIC] Available devices:', devices.map(device => ({
        kind: device.kind,
        label: device.label,
        deviceId: device.deviceId ? 'present' : 'missing',
      })));
    } catch (error) {
      console.error('🔴 [MIC] Could not enumerate devices:', error);
    }
    createSocket();

    console.log('🎙️ [VoiceAssistant] Starting VAD');

    try {
      vad.start();
      console.log('🟢 [VAD] vad.start() called successfully');
    } catch (error) {
      console.error('🔴 [VAD] vad.start() threw an error:', error);
    }
  }, [
    createSocket,
    stopWakeWord,
    supported,
    updateState,
    updateTranscript,
    vad,
  ]);

  const stop = useCallback(() => {
    if (isUnmountedRef.current) return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    vad.pause();
    socketRef.current?.endUtterance();
    socketRef.current?.disconnect();
    if (transcriptRef.current.trim()) setDone(true);
    updateState('IDLE');
    void armWakeWord();
  }, [armWakeWord, updateState, vad]);

  const cancel = useCallback(() => {
    if (isUnmountedRef.current) return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    vad.pause();
    socketRef.current?.disconnect();
    socketRef.current = null;
    updateTranscript('');
    setDone(false);
    setErrorMessage(null);
    updateState('IDLE');
    void armWakeWord();
  }, [armWakeWord, updateState, updateTranscript, vad]);

  const accept = useCallback(async (textOverride?: string) => {
    if (isUnmountedRef.current) return;
    const text = (textOverride ?? transcriptRef.current).trim();
    if (!text || stateRef.current === 'PROCESSING') return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    vad.pause();
    socketRef.current?.disconnect();
    updateState('PROCESSING');
    setDone(false);
    try {
      await onResultRef.current(text);
      updateTranscript('');
      updateState('IDLE');
      void armWakeWord();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send voice message.');
      updateState('ERROR');
    }
  }, [armWakeWord, updateState, updateTranscript, vad]);

  useEffect(() => { void armWakeWord(); }, [armWakeWord]);
  useEffect(() => {
    console.log('🧠 [VAD] Error state changed:', vad.errored);

    if (vad.errored && shouldListenRef.current) {
      console.error('🔴 [VAD] ERROR:', vad.errored);
      setErrorMessage(vad.errored);
      updateState('ERROR');
    }
  }, [updateState, vad.errored]);
  
  useEffect(() => {
    console.log('🧠 [VAD] Loading state changed:', vad.loading);
  }, [vad.loading]);
  
  useEffect(() => {
    console.log('🧠 [VAD] Listening state changed:', vad.listening);
  }, [vad.listening]);
  
  useEffect(() => {
    console.log('🟢 [VoiceAssistant] COMPONENT MOUNTED');
    
    // Mark component as mounted
    isUnmountedRef.current = false;

    return () => {
      console.log('🔴 [VoiceAssistant] COMPONENT UNMOUNTED');
      isUnmountedRef.current = true;
      
      // Cleanup with error handling
      shouldListenRef.current = false;
      streamingRef.current = false;
      
      // Clean up VAD with try-catch to prevent errors
      try {
        if (vad && typeof vad.pause === 'function') {
          vad.pause();
        }
      } catch (error) {
        console.warn('Error pausing VAD during unmount:', error);
      }
      
      // Clean up socket
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (error) {
          console.warn('Error disconnecting socket during unmount:', error);
        }
        socketRef.current = null;
      }
      
      // Clean up wake word
      void stopWakeWord();
    };
  }, []); // Empty array = run cleanup ONLY on unmount

  return { 
    supported, 
    wakeWordEnabled, 
    state, 
    listening: state === 'LISTENING', 
    processing: state === 'PROCESSING', 
    transcript, 
    done, 
    errorMessage, 
    audioLevel, 
    start, 
    stop, 
    cancel, 
    accept 
  };
}

function resampleTo16k(samples: Float32Array, sourceSampleRate: number): Float32Array {
  if (sourceSampleRate === SAMPLE_RATE) return samples;
  const targetLength = Math.round(samples.length * SAMPLE_RATE / sourceSampleRate);
  const output = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * SAMPLE_RATE / sourceSampleRate;
    const before = Math.floor(sourceIndex);
    const after = Math.min(before + 1, samples.length - 1);
    output[index] = samples[before] * (1 - (sourceIndex - before)) + samples[after] * (sourceIndex - before);
  }
  return output;
}