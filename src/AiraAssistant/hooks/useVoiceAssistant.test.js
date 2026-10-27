import { act, renderHook } from '@testing-library/react';
import { useVoiceAssistant } from './useVoiceAssistant';
import { WakeWordService } from '../services/wakeWordService';
jest.mock('../services/wakeWordService', () => ({ WakeWordService: jest.fn() }));
jest.mock('@ricky0123/vad-react', () => {
  const vad = { loading: false, listening: false, errored: null, start: jest.fn(), pause: jest.fn(), destroy: jest.fn() };
  return { useMicVAD: () => vad };
});
jest.mock('../utils/voiceSupport', () => ({ isVoiceSupported: () => true }));
jest.mock('../utils/useAuth', () => ({ getAuthContext: () => ({ userId: 'u', companyId: 'c' }) }));
jest.mock('../services/ttsService', () => ({ ttsService: { stopCurrentAudio: jest.fn() }, playTTS: jest.fn() }));

beforeEach(() => { jest.clearAllMocks(); });
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
