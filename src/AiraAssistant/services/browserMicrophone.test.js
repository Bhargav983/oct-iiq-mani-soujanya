import { BrowserMicrophoneCoordinator, openBrowserMicrophone } from './browserMicrophone';

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
afterEach(() => { delete window.__AIRA_ANDROID_APP__; jest.useRealTimers(); });

test('conversation waits for wake release and wake cannot interrupt a conversation', async () => {
  const mic = new BrowserMicrophoneCoordinator();
  let end;
  const stopping = new Promise(resolve => { end = resolve; });
  const stopWake = jest.fn(() => stopping);
  await mic.acquire('wake', stopWake);
  const capture = mic.acquire('conversation', async () => {});
  await flush();
  expect(stopWake).toHaveBeenCalledTimes(1);
  expect(mic.mode).toBe('wake');
  end();
  const lease = await capture;
  expect(mic.mode).toBe('conversation');
  expect(await mic.acquire('wake', async () => {})).toBeNull();
  lease.release();
});

test('dictation waits for asynchronous VAD shutdown', async () => {
  const mic = new BrowserMicrophoneCoordinator();
  let end;
  await mic.acquire('conversation', () => new Promise(resolve => { end = resolve; }));
  const dictation = mic.acquire('dictation', async () => {});
  await flush();
  expect(mic.mode).toBe('conversation');
  end(); await dictation;
  expect(mic.mode).toBe('dictation');
});

test('failed shutdown never grants a second owner', async () => {
  const mic = new BrowserMicrophoneCoordinator();
  await mic.acquire('dictation', async () => { throw new Error('still recording'); });
  await expect(mic.acquire('conversation', async () => {})).rejects.toThrow('still recording');
  expect(mic.mode).toBe('dictation');
});

test('cancelled queued starts never acquire the microphone', async () => {
  const mic = new BrowserMicrophoneCoordinator();
  let valid = true, end;
  await mic.acquire('wake', () => new Promise(resolve => { end = resolve; }));
  const queued = mic.acquire('dictation', async () => {}, () => valid);
  await flush(); valid = false; end();
  await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
  expect(mic.mode).toBeNull();
});

test('Android retries a transient capture failure twice at most', async () => {
  window.__AIRA_ANDROID_APP__ = true;
  jest.useFakeTimers();
  const error = new DOMException('Could not start audio source', 'NotReadableError');
  const stream = { getTracks: () => [] };
  const getUserMedia = jest.fn().mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const pending = openBrowserMicrophone({ audio: true }, () => true);
  await flush(); jest.advanceTimersByTime(200); await flush(); jest.advanceTimersByTime(500);
  await expect(pending).resolves.toBe(stream);
  expect(getUserMedia).toHaveBeenCalledTimes(3);
});

test('permission errors are never retried', async () => {
  window.__AIRA_ANDROID_APP__ = true;
  const getUserMedia = jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  await expect(openBrowserMicrophone({ audio: true }, () => true)).rejects.toMatchObject({ name: 'NotAllowedError' });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

test('persistent Android capture failure stops after three attempts', async () => {
  window.__AIRA_ANDROID_APP__ = true;
  jest.useFakeTimers();
  const getUserMedia = jest.fn().mockRejectedValue(new DOMException('busy', 'NotReadableError'));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const pending = openBrowserMicrophone({ audio: true }, () => true);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'NotReadableError' });
  await flush(); jest.advanceTimersByTime(200); await flush(); jest.advanceTimersByTime(500);
  await rejected;
  expect(getUserMedia).toHaveBeenCalledTimes(3);
});

test('a microphone granted after cancellation has its tracks stopped', async () => {
  let resolve, valid = true;
  const stop = jest.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(done => { resolve = done; }) } });
  const pending = openBrowserMicrophone({ audio: true }, () => valid);
  valid = false; resolve({ getTracks: () => [{ stop }] });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(stop).toHaveBeenCalledTimes(1);
});
