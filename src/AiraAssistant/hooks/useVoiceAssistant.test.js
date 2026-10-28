import { VoiceSocket } from '../services/voiceSocket';
import { act, renderHook } from '@testing-library/react';
import { useVoiceAssistant } from './useVoiceAssistant';
import { WakeWordService } from '../services/wakeWordService';
import { useMicVAD } from '@ricky0123/vad-react';
import { browserMicrophone } from '../services/browserMicrophone';
import { playTTS } from '../services/ttsService';
import { useInlineDictation } from './useInlineDictation';
const mockSockets = [];
jest.mock('../services/voiceSocket', () => ({ VoiceSocket: jest.fn() }));
jest.mock('../services/wakeWordService', () => ({ WakeWordService: jest.fn() }));
jest.mock('@ricky0123/vad-react', () => {
  const vad = { loading: false, listening: false, errored: null, start: jest.fn(), pause: jest.fn(), destroy: jest.fn() };
  return { useMicVAD: () => vad };
});
jest.mock('../utils/voiceSupport', () => ({ isVoiceSupported: () => true }));
jest.mock('../utils/useAuth', () => ({ getAuthContext: () => ({ userId: 'u', companyId: 'c' }) }));
jest.mock('../services/ttsService', () => ({ ttsService: { stopCurrentAudio: jest.fn() }, playTTS: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks(); mockSockets.length = 0;
  VoiceSocket.mockImplementation(config => {
    const socket = { config, connect: () => config.onStateChange('CONNECTED'), getState: () => 'CONNECTED', isConnected: () => true,
      disconnect: jest.fn(), endUtterance: jest.fn(), whenConnected: async () => {} };
    mockSockets.push(socket); return socket;
  });
  useMicVAD({}).start.mockResolvedValue(undefined);
  useMicVAD({}).pause.mockResolvedValue(undefined);
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
