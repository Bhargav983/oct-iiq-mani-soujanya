import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { VoiceEngineHandle, VoiceEngineProps, VoiceSnapshot } from './VoiceEngine';
import { hasNativeVoice, listenNativeVoice, nativeVoiceDebug, requestNativeReady, startNativeVoice, voiceLocale } from '../services/nativeVoice';
import { playTTS, ttsService } from '../services/ttsService';
import { isPublicRoute } from '../utils/publicRoutes';

const idle: VoiceSnapshot = { supported: false, state: 'IDLE', listening: false, processing: false, transcript: '', done: false, errorMessage: null, wakeWordEnabled: false, audioLevel: 0 };

/** iOS owns capture and recognition; browser VAD/ONNX is never mounted here. */
export const NativeVoiceEngine = forwardRef<VoiceEngineHandle, VoiceEngineProps>(function NativeVoiceEngine(props, ref) {
  const { onSnapshot } = props;
  const latest = useRef(props);
  latest.current = props;
  const [snapshot, setSnapshot] = useState(idle);
  const [ready, setReady] = useState(hasNativeVoice);
  const wakeBlocked = useRef(false);
  const foreground = useRef(true);
  const mounted = useRef(true);
  const generation = useRef(0);
  const session = useRef<ReturnType<typeof startNativeVoice> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = useRef('');
  const dictating = useRef(false);
  const busy = useRef(false);
  const identity = useRef('');
  const armRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const eligible = useCallback(() => foreground.current && !document.hidden && Boolean(latest.current.auth?.userId && latest.current.auth?.companyId && latest.current.currentPathname && !isPublicRoute(latest.current.currentPathname)), []);
  const update = useCallback((patch: Partial<VoiceSnapshot>) => {
    if (mounted.current) setSnapshot(previous => ({ ...previous, ...patch }));
  }, []);
  const cancel = useCallback(() => {
    ++generation.current;
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
    session.current?.cancel();
    session.current = null;
    busy.current = false;
    ttsService.stopCurrentAudio();
    text.current = '';
    update({ ...idle, supported: hasNativeVoice() });
  }, [update]);

  const arm = useCallback(() => {
    if (wakeBlocked.current || !eligible() || dictating.current || busy.current || session.current || !hasNativeVoice()) return;
    let detected = false;
    let failed = false;
    const token = generation.current;
    session.current = startNativeVoice('wake', 'en-US', event => {
      if (generation.current !== token || !mounted.current) return;
      if (event.event === 'start') update({ wakeWordEnabled: true, errorMessage: null });
      if (event.event === 'result' && /\bhey[\s,]+(?:aira|ayra)\b/i.test(event.results?.[0]?.transcript || '')) {
        if (detected) return;
        detected = true;
        session.current?.cancel();
        session.current = null;
        busy.current = true;
        update({ wakeWordEnabled: false });
        if (latest.current.onWakeWordDetected) latest.current.onWakeWordDetected();
        else startRef.current();
      }
      if (event.event === 'error' && event.error !== 'no-speech' && event.error !== 'aborted') {
        failed = true;
        update({ wakeWordEnabled: false, errorMessage: event.message || event.error || 'Wake phrase recognition failed.' });
        wakeBlocked.current = true;
      }
      if (event.event === 'end' && !detected) {
        session.current = null;
        update({ wakeWordEnabled: false });
        if (!failed && !wakeBlocked.current && eligible()) retry.current = setTimeout(() => armRef.current(), 800);
      }
      if (event.event === 'interrupted') cancel();
    });
  }, [cancel, eligible, update]);
  armRef.current = arm;

  const processText = useCallback(async (value: string, token: number) => {
    const current = () => mounted.current && generation.current === token && eligible() && !dictating.current;
    if (!value.trim() || !current()) return;
    busy.current = true;
    update({ state: 'PROCESSING', processing: true, listening: false, transcript: value, done: true, audioLevel: 0 });
    try {
      const reply = await latest.current.onResult(value.trim());
      if (!current()) return;
      if (typeof reply === 'string' && reply.trim()) {
        update({ state: 'SYNTHESIZING' });
        await playTTS(reply, () => { if (current()) update({ state: 'SPEAKING' }); }, latest.current.auth);
      }
      if (!current()) return;
      busy.current = false;
      update({ state: 'IDLE', processing: false, transcript: '', done: false });
      if (latest.current.isSessionActive?.()) startRef.current();
      else armRef.current();
    } catch (error) {
      if (current()) busy.current = false;
      if (current()) update({ state: 'ERROR', processing: false, errorMessage: error instanceof Error ? error.message : 'Voice response failed.' });
    }
  }, [eligible, update]);

  const start = useCallback(() => {
    cancel();
    wakeBlocked.current = false;
    dictating.current = false;
    if (!eligible()) return;
    if (!hasNativeVoice()) {
      update({ state: 'ERROR', errorMessage: 'Install the updated iOS app to use native voice.' });
      return;
    }
    const token = generation.current;
    busy.current = true;
    let failed = false;
    let final = '';
    update({ supported: true, transcript: '', done: false, errorMessage: null });
    session.current = startNativeVoice('conversation', voiceLocale(latest.current.lang), event => {
      if (token !== generation.current || !mounted.current) return;
      if (event.event === 'start') update({ state: 'LISTENING', listening: true });
      if (event.event === 'volumechange') update({ audioLevel: Math.max(0, Math.min(1, (event.value || 0) / 10)) });
      if (event.event === 'result') {
        text.current = event.results?.[0]?.transcript || '';
        update({ transcript: text.current });
        if (event.isFinal) final = text.current;
      }
      if (event.event === 'error' && event.error !== 'no-speech' && event.error !== 'aborted') {
        failed = true;
        update({ state: 'ERROR', errorMessage: event.message || event.error || 'Recognition failed.' });
      }
      if (event.event === 'end') {
        session.current = null;
        update({ listening: false, audioLevel: 0 });
        if (failed) { busy.current = false; return; }
        if (final.trim()) void processText(final, token);
        else {
          busy.current = false;
          update({ state: 'IDLE', errorMessage: 'No speech detected. Tap the mic to try again.' });
          armRef.current();
        }
      }
      if (event.event === 'interrupted') {
        cancel();
        update({ errorMessage: 'Voice was interrupted. Use the microphone to continue.' });
      }
    });
  }, [cancel, eligible, processText, update]);
  startRef.current = start;

  const stop = useCallback(() => { cancel(); armRef.current(); }, [cancel]);
  useImperativeHandle(ref, () => ({
    start, stop, cancel: stop,
    accept: async (override?: string) => {
      if (override?.trim()) { cancel(); await processText(override, generation.current); }
      else session.current?.stop();
    },
    cancelPlayback: () => { cancel(); startRef.current(); },
  }), [cancel, processText, start, stop]);

  useEffect(() => { onSnapshot(snapshot); }, [onSnapshot, snapshot]);
  useEffect(() => {
    mounted.current = true;
    const onReady = () => { setReady(hasNativeVoice()); update({ supported: hasNativeVoice() }); };
    const onOwner = (event: Event) => {
      if ((event as CustomEvent).detail === 'dictation') { cancel(); dictating.current = true; }
    };
    const onReleased = () => { dictating.current = false; armRef.current(); };
    const unsubscribe = listenNativeVoice(event => {
      if (event.event === 'appState') {
        foreground.current = Boolean(event.active);
        if (!event.active) {
          const wasBusy = busy.current;
          cancel();
          if (wasBusy) update({ errorMessage: 'Voice is paused. Use the microphone when you return.' });
        }
        else { wakeBlocked.current = false; armRef.current(); }
      }
    });
    const onVisibility = () => {
      if (document.hidden) cancel();
      else if (foreground.current) { wakeBlocked.current = false; armRef.current(); }
    };
    window.addEventListener('airaNativeReady', onReady);
    window.addEventListener('airaVoiceOwner', onOwner);
    window.addEventListener('airaDictationEnd', onReleased);
    window.addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    requestNativeReady();
    onReady();
    return () => {
      mounted.current = false;
      cancel(); unsubscribe();
      window.removeEventListener('airaNativeReady', onReady);
      window.removeEventListener('airaVoiceOwner', onOwner);
      window.removeEventListener('airaDictationEnd', onReleased);
      window.removeEventListener('pagehide', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [cancel, update]);

  useEffect(() => {
    const nextIdentity = `${props.auth?.userId || ''}:${props.auth?.companyId || ''}`;
    if (identity.current !== nextIdentity || !eligible()) {
      cancel();
      identity.current = nextIdentity;
      wakeBlocked.current = false;
    }
    if (ready && eligible()) armRef.current();
  }, [ready, props.currentPathname, props.auth?.userId, props.auth?.companyId, cancel, eligible]);

  if (!nativeVoiceDebug() || !eligible()) return null;
  return <details aria-label="Voice diagnostics" style={{ position: 'fixed', right: 8, bottom: 100, zIndex: 1040, background: '#fff', padding: 8 }}>
    <summary>Voice diagnostics</summary>
    <pre>{JSON.stringify({ native: ready, foreground: foreground.current, state: snapshot.state, wake: snapshot.wakeWordEnabled, error: snapshot.errorMessage }, null, 2)}</pre>
  </details>;
});
