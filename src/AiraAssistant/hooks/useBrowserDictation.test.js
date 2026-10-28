import { act, renderHook } from '@testing-library/react';
import { useInlineDictation } from './useInlineDictation';
import { browserMicrophone } from '../services/browserMicrophone';
let recognition;
beforeEach(() => {
  window.SpeechRecognition = jest.fn(() => {
    recognition = { start: jest.fn(), stop: jest.fn(), abort: jest.fn() };
    return recognition;
  });
});
afterEach(() => { recognition?.onend?.(); delete window.SpeechRecognition; });

test('wake stays stopped until dictation end, not merely stop()', async () => {
  const stopWake = jest.fn();
  await browserMicrophone.acquire('wake', async () => { stopWake(); });
  const { result } = renderHook(() => useInlineDictation('en', jest.fn()));
  await act(async () => { result.current.start(); });
  expect(stopWake).toHaveBeenCalledTimes(1);
  expect(recognition.start).toHaveBeenCalledTimes(1);
  act(() => { result.current.stop(); });
  expect(browserMicrophone.mode).toBe('dictation');
  expect(await browserMicrophone.acquire('wake', async () => {})).toBeNull();
  act(() => { recognition.onend(); });
  expect(browserMicrophone.mode).toBeNull();
});

test('conversation waits for recognizer end and cancelled results are ignored', async () => {
  const text = jest.fn();
  const { result } = renderHook(() => useInlineDictation('en', text));
  await act(async () => { result.current.start(); });
  let conversation;
  await act(async () => { conversation = browserMicrophone.acquire('conversation', async () => {}); });
  expect(recognition.abort).toHaveBeenCalled();
  expect(browserMicrophone.mode).toBe('dictation');
  act(() => { recognition.onresult({ results: [{ isFinal: true, 0: { transcript: 'stale' } }] }); recognition.onend(); });
  const lease = await conversation;
  expect(text).not.toHaveBeenCalled();
  expect(browserMicrophone.mode).toBe('conversation');
  lease.release();
});
