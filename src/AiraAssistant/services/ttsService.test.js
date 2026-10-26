import { playTTS, ttsService } from './ttsService';

let audio;
const originalAudio = global.Audio;
const originalFetch = global.fetch;
beforeEach(() => {
  global.Audio = jest.fn(() => {
    audio = { setAttribute: jest.fn(), play: jest.fn().mockResolvedValue(undefined), pause: jest.fn(), load: jest.fn() };
    return audio;
  });
  URL.createObjectURL = jest.fn(() => 'blob:voice');
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => {
  ttsService.stopCurrentAudio();
  global.Audio = originalAudio;
  global.fetch = originalFetch;
});
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

test('stopping response playback settles the turn promise and releases the URL', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['audio']) });
  const playback = playTTS('hello');
  await flush();
  expect(audio.play).toHaveBeenCalledTimes(1);
  ttsService.stopCurrentAudio();
  await playback;
  expect(audio.pause).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
});

test('synthesis that resolves after cancellation cannot start stale audio', async () => {
  let respond;
  global.fetch = jest.fn(() => new Promise(resolve => { respond = resolve; }));
  const playback = playTTS('hello');
  ttsService.stopCurrentAudio();
  respond({ ok: true, blob: async () => new Blob(['audio']) });
  await playback;
  expect(global.Audio).not.toHaveBeenCalled();
});
