import { playTTS, ttsService } from './ttsService';

let audio;
const originalAudio = global.Audio;
const originalFetch = global.fetch;
beforeEach(() => {
  ttsService.cache.clear();
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


test('Hindi synthesis selects a Hindi voice and preserves spoken Unicode', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['audio']) });
  const pending = playTTS('नमस्ते, मैं AIRA हूँ।');
  await flush();
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.voice).toBe('hf_alpha');
  expect(body.input).toBe('नमस्ते, मैं Aira हूँ।');
  ttsService.stopCurrentAudio(); await pending;
});
test('replaying the same reply reuses synthesis only for the same identity', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['audio']) });
  let pending = playTTS('AIRA can help', undefined, { userId: 'u', companyId: 'c' });
  await flush(); audio.onended(); await pending;
  pending = playTTS('AIRA can help', undefined, { userId: 'u', companyId: 'c' });
  await flush(); audio.onended(); await pending;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  pending = playTTS('AIRA can help', undefined, { userId: 'other', companyId: 'c' });
  await flush(); audio.onended(); await pending;
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
