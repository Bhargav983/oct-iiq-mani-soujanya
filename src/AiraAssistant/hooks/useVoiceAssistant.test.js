import { GeminiVoiceSocket } from '../services/geminiVoiceSocket';
import { act, renderHook } from '@testing-library/react';
import { useVoiceAssistant } from './useVoiceAssistant';
import { WakeWordService } from '../services/wakeWordService';
import { useMicVAD } from '@ricky0123/vad-react';
import { browserMicrophone } from '../services/browserMicrophone';
import { playTTS } from '../services/ttsService';
import { useInlineDictation } from './useInlineDictation';
const mockSockets = [];
let mockVadOptions;
jest.mock('../services/geminiVoiceSocket', () => ({ GeminiVoiceSocket: jest.fn() }));
jest.mock('../services/wakeWordService', () => ({ WakeWordService: jest.fn() }));
jest.mock('@ricky0123/vad-react', () => {
  const vad = { loading: false, listening: false, errored: null, start: jest.fn(), pause: jest.fn(), destroy: jest.fn() };
  return { useMicVAD: options => {
    if (options.onSpeechStart) mockVadOptions = options;
    return vad;
  } };
});
jest.mock('../utils/voiceSupport', () => ({ isVoiceSupported: () => true }));
jest.mock('../utils/useAuth', () => ({ getAuthContext: () => ({ userId: 'u', companyId: 'c' }) }));
jest.mock('../services/ttsService', () => ({ ...jest.requireActual('../services/ttsService'), playTTS: jest.fn(), ttsService: { stopCurrentAudio: jest.fn(), pauseForBackground: jest.fn(), playbackInterruption: jest.fn() } }));

const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
beforeEach(() => {
  jest.clearAllMocks(); mockSockets.length = 0;
  useMicVAD({}).loading = false;
  GeminiVoiceSocket.mockImplementation(config => {
    const socket = { config, connect: () => config.onStateChange('CONNECTED'), getState: () => 'CONNECTED', isConnected: () => true,
      disconnect: jest.fn(), endUtterance: jest.fn(), resetTurn: jest.fn(), whenConnected: async () => {} };
    mockSockets.push(socket); return socket;
  });
  useMicVAD({}).start.mockResolvedValue(undefined);
  useMicVAD({}).pause.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [] })) },
  });
});
afterEach(() => {
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  else delete navigator.mediaDevices;
});
const mount = () => renderHook(() => useVoiceAssistant(jest.fn(), 'en', { currentPathname: '/dashboard' }));

test('model initialization failure does not retry on a generic page click', async () => {
  WakeWordService.mockImplementation(() => ({ start: () => Promise.reject(new Error('WASM code 16984200')), stop: jest.fn(), isActive: false }));
  const { result } = mount();
  await act(async () => {});
  expect(result.current.errorMessage).toContain('16984200');
  const attempts = WakeWordService.mock.calls.length;
  await act(async () => { window.dispatchEvent(new Event('click')); });
  expect(WakeWordService).toHaveBeenCalledTimes(attempts);
});

test('only microphone permission failure schedules a gesture retry', async () => {
  const denied = new Error('microphone requires permission'); denied.name = 'NotAllowedError';
  WakeWordService.mockImplementation(() => ({ start: () => Promise.reject(denied), stop: jest.fn(), isActive: false }));
  mount();
  await act(async () => {});
  const attempts = WakeWordService.mock.calls.length;
  await act(async () => { window.dispatchEvent(new Event('click')); });
  expect(WakeWordService).toHaveBeenCalledTimes(attempts + 1);
});

test('manual conversation waits for wake capture to stop', async () => {
  let released;
  const stop = jest.fn(() => new Promise(resolve => { released = resolve; }));
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop, isActive: true }));
  const { result } = mount();
  await act(async () => {});
  let pending;
  act(() => { pending = result.current.start(); });
  await act(async () => {});
  expect(stop).toHaveBeenCalled();
  expect(useMicVAD({}).start).not.toHaveBeenCalled();
  await act(async () => { released(); await pending; });
  expect(useMicVAD({}).start).toHaveBeenCalled();
  expect(browserMicrophone.mode).toBe('conversation');
});

test('voice can retry after locking during a pending microphone request', async () => {
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  let resolveOldCapture;
  navigator.mediaDevices.getUserMedia.mockImplementationOnce(() => new Promise(resolve => { resolveOldCapture = resolve; }));
  const { result } = mount();
  await act(async () => {});
  let interrupted;
  await act(async () => { interrupted = result.current.start(); });
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  expect(useMicVAD({}).start).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'));
    await interrupted;
  });
  expect(result.current.state).toBe('IDLE');
  await act(async () => { await result.current.start(); });
  expect(result.current.state).toBe('LISTENING');
  const stop = jest.fn();
  await act(async () => { resolveOldCapture({ getTracks: () => [{ stop }] }); });
  expect(stop).toHaveBeenCalledTimes(1);
});

test('wake re-arm waits for VAD pause to complete', async () => {
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  const { result } = mount();
  await act(async () => {});
  await act(async () => { await result.current.start(); });
  const wakeAttempts = WakeWordService.mock.calls.length;
  let released;
  useMicVAD({}).pause.mockImplementationOnce(() => new Promise(resolve => { released = resolve; }));
  act(() => { result.current.stop(); });
  await act(async () => {});
  expect(browserMicrophone.mode).toBe('conversation');
  expect(WakeWordService).toHaveBeenCalledTimes(wakeAttempts);
  await act(async () => { released(); });
  expect(browserMicrophone.mode).toBeNull();
  expect(WakeWordService.mock.calls.length).toBeGreaterThan(wakeAttempts);
});

test('cancel during chat response prevents stale playback', async () => {
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  let reply;
  const { result } = renderHook(() => useVoiceAssistant(() => new Promise(resolve => { reply = resolve; }), 'en', { currentPathname: '/dashboard' }));
  await act(async () => {});
  await act(async () => { await result.current.start(); });
  await act(async () => { mockSockets.at(-1).config.onTranscript({ transcript: 'hello', isFinal: true }); });
  act(() => { result.current.cancel(); });
  await act(async () => { reply('stale response'); });
  expect(playTTS).not.toHaveBeenCalled();
});

test('wake to dictation to wake works for ten successive cycles', async () => {
  let recognition;
  window.SpeechRecognition = jest.fn(() => {
    recognition = { start: jest.fn(), stop: jest.fn(), abort: jest.fn() };
    return recognition;
  });
  WakeWordService.mockImplementation(options => {
    let lease;
    const service = { isActive: false,
      start: async () => { lease = await browserMicrophone.acquire('wake', service.stop); service.isActive = Boolean(lease); },
      stop: async () => { service.isActive = false; lease?.release(); options.onStopped?.(); },
    };
    return service;
  });
  try {
    const { result } = renderHook(() => ({
      voice: useVoiceAssistant(jest.fn(), 'en', { currentPathname: '/dashboard' }),
      dictation: useInlineDictation('en', jest.fn()),
    }));
    await act(async () => {});
    for (let cycle = 0; cycle < 10; cycle += 1) {
      expect(browserMicrophone.mode).toBe('wake');
      await act(async () => { result.current.dictation.start(); });
      expect(browserMicrophone.mode).toBe('dictation');
      expect(result.current.voice.wakeWordEnabled).toBe(false);
      await act(async () => { recognition.onend(); });
      expect(browserMicrophone.mode).toBe('wake');
      expect(result.current.voice.wakeWordEnabled).toBe(true);
    }
  } finally { delete window.SpeechRecognition; }
});

test('wake re-arms if another owner finishes while wake initialization is cleaning up', async () => {
  WakeWordService.mockImplementationOnce(() => ({ start: async () => {}, stop: async () => {}, isActive: false }));
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  const { result } = mount();
  await act(async () => {});
  expect(result.current.wakeWordEnabled).toBe(true);
  expect(WakeWordService).toHaveBeenCalledTimes(2);
});


test('Android defers wake until native grant, stops on background and rearms on return', async () => {
  window.__AIRA_ANDROID_APP__ = true;
  window.__AIRA_ANDROID_AUDIO__ = { version: 1, permission: 'pending', foreground: true };
  const stop = jest.fn(async () => {});
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop, isActive: true }));
  const hook = mount();
  try {
    await act(async () => {});
    expect(WakeWordService).not.toHaveBeenCalled();
    await act(async () => {
      window.__AIRA_ANDROID_AUDIO__ = { version: 1, permission: 'granted', foreground: true };
      window.dispatchEvent(new Event('aira-android-audio'));
    });
    expect(hook.result.current.wakeWordEnabled).toBe(true);
    const attempts = WakeWordService.mock.calls.length;
    await act(async () => {
      window.__AIRA_ANDROID_AUDIO__.foreground = false;
      window.dispatchEvent(new Event('aira-android-audio'));
    });
    expect(stop).toHaveBeenCalled();
    expect(hook.result.current.wakeWordEnabled).toBe(false);
    expect(WakeWordService).toHaveBeenCalledTimes(attempts);
    await act(async () => {
      window.__AIRA_ANDROID_AUDIO__.foreground = true;
      window.dispatchEvent(new Event('aira-android-audio'));
    });
    expect(hook.result.current.wakeWordEnabled).toBe(true);
    expect(WakeWordService).toHaveBeenCalledTimes(attempts + 1);
  } finally {
    hook.unmount();
    delete window.__AIRA_ANDROID_APP__;
    delete window.__AIRA_ANDROID_AUDIO__;
  }
});


test('first activation waits for VAD readiness before claiming to listen', async () => {
  jest.useFakeTimers();
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  const hook = mount();
  try {
    await act(async () => {});
    useMicVAD({}).loading = true;
    let pending;
    act(() => { pending = hook.result.current.start(); });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(hook.result.current.listening).toBe(false);
    expect(useMicVAD({}).start).not.toHaveBeenCalled();
    useMicVAD({}).loading = false;
    for (let i = 0; i < 10; i++) await act(async () => { jest.advanceTimersByTime(100); });
    await act(async () => { await pending; });
    expect(useMicVAD({}).start).toHaveBeenCalledTimes(1);
    expect(hook.result.current.listening).toBe(true);
  } finally { hook.unmount(); jest.useRealTimers(); }
});

test('capture warms up before the speech socket opens', async () => {
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  let openSocket;
  GeminiVoiceSocket.mockImplementationOnce(config => {
    let connected = false;
    openSocket = () => { connected = true; config.onStateChange('CONNECTED'); };
    return { connect: jest.fn(), isConnected: () => connected, disconnect: jest.fn(), sendAudioChunk: jest.fn() };
  });
  const hook = mount();
  let pending;
  await act(async () => { pending = hook.result.current.start(); });
  expect(useMicVAD({}).start).toHaveBeenCalledTimes(1);
  expect(hook.result.current.listening).toBe(false);
  await act(async () => { openSocket(); await pending; });
  expect(hook.result.current.listening).toBe(true);
});

test.each([false, true])('silence exits after four seconds unless speech starts (speech: %s)', async speech => {
  jest.useFakeTimers();
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  const onSessionEnded = jest.fn();
  const hook = renderHook(() => useVoiceAssistant(jest.fn(), 'en', { currentPathname: '/chat-bot', onSessionEnded }));
  try {
    await act(async () => { await hook.result.current.start(); });
    await act(async () => { jest.advanceTimersByTime(3900); });
    expect(hook.result.current.listening).toBe(true);
    if (speech) act(() => { mockVadOptions.onSpeechStart(); });
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(hook.result.current.listening).toBe(speech);
    expect(onSessionEnded).toHaveBeenCalledTimes(speech ? 0 : 1);
    if (!speech) expect(browserMicrophone.mode).not.toBe('conversation');
  } finally {
    hook.unmount();
    jest.useRealTimers();
  }
});

test('isolates 3 consecutive multi-turn utterances and ignores STT during thinking/speaking', async () => {
  WakeWordService.mockImplementation(() => ({ start: async () => {}, stop: async () => {}, isActive: true }));
  const onResult = jest.fn(async (text) => `Reply to: ${text}`);
  let resolveSecondTts;
  playTTS.mockImplementation(async (_text, onStart) => {
    onStart?.();
    if (onResult.mock.calls.length === 2) {
      await new Promise(resolve => { resolveSecondTts = resolve; });
    }
  });

  const hook = renderHook(() =>
    useVoiceAssistant(onResult, 'en', {
      currentPathname: '/chat-bot',
      isSessionActive: () => true,
    }),
  );

  try {
    await act(async () => {});
    await act(async () => { await hook.result.current.start(); });
    expect(mockSockets).toHaveLength(1);
    const socket = mockSockets[0];
    expect(socket.resetTurn).toHaveBeenCalled();

    // Turn 1
    await act(async () => {
      socket.config.onTranscript({ transcript: 'Which machine is online?', isFinal: false });
    });
    expect(hook.result.current.transcript).toBe('Which machine is online?');
    await act(async () => {
      socket.config.onTranscript({ transcript: 'Which machine is online?', isFinal: true });
    });
    expect(hook.result.current.state).toBe('LISTENING');
    expect(hook.result.current.transcript).toBe('');

    // Turn 2: pause during SPEAKING and inject a stray STT event
    act(() => {
      socket.config.onTranscript({ transcript: 'Is it sunny outside?', isFinal: true });
    });
    await act(async () => {});
    await act(async () => {
      // Stray event while TTS SPEAKING must be ignored
      socket.config.onTranscript({ transcript: 'echo while speaking', isFinal: false });
      socket.config.onTranscript({ transcript: 'echo while speaking', isFinal: true });
    });
    expect(hook.result.current.transcript).toBe('');
    await act(async () => { resolveSecondTts(); });
    expect(hook.result.current.state).toBe('LISTENING');

    // Turn 3
    await act(async () => {
      socket.config.onTranscript({ transcript: 'Please let me know maintenance steps for turning on AC.', isFinal: true });
    });
    expect(hook.result.current.state).toBe('LISTENING');
    expect(hook.result.current.transcript).toBe('');

    expect(onResult.mock.calls.map(([msg]) => msg)).toEqual([
      'Which machine is online?',
      'Is it sunny outside?',
      'Please let me know maintenance steps for turning on AC.',
    ]);
    // Reset called with strictly increasing turnIds across turns
    const sentTurnIds = socket.resetTurn.mock.calls.map(([id]) => id);
    expect(sentTurnIds.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < sentTurnIds.length; i += 1) {
      expect(sentTurnIds[i]).toBeGreaterThan(sentTurnIds[i - 1]);
    }
  } finally {
    hook.unmount();
  }
});
