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
  expect(body.language).toBe('hi');
  expect(body.text).toBe('नमस्ते, मैं Aira हूँ।');
  ttsService.stopCurrentAudio(); await pending;
});
/** Builds a mono 16-bit PCM WAV so the streaming parser reads a real header. */
function wav(samples, sampleRate = 24000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(value, index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Response whose body arrives as several chunks, like a streamed download. */
function streamedResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    blob: async () => new Blob([Buffer.concat(chunks)]),
    body: { getReader: () => ({ read: async () => (index < chunks.length
      ? { done: false, value: new Uint8Array(chunks[index++]) }
      : { done: true, value: undefined }) }) },
  };
}

let audioContexts;
const originalAudioContext = global.AudioContext;
beforeEach(() => {
  audioContexts = [];
  global.AudioContext = jest.fn(() => {
    const scheduled = [];
    const context = {
      currentTime: 0, state: 'running', destination: {},
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      createBuffer: jest.fn((channels, length, rate) => {
        const data = new Float32Array(length);
        return {
          length,
          sampleRate: rate,
          getChannelData: () => data,
          copyToChannel: jest.fn((source) => data.set(source)),
        };
      }),
      createBufferSource: jest.fn(() => {
        const source = { buffer: null, onended: null, connect: jest.fn(), start: jest.fn(), stop: jest.fn() };
        scheduled.push(source);
        return source;
      }),
    };
    audioContexts.push({ context, scheduled });
    return context;
  });
});
afterEach(() => { global.AudioContext = originalAudioContext; });
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };

test('streamed synthesis starts playback before the whole body arrives', async () => {
  const samples = Array.from({ length: 24000 }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([wav(samples).subarray(0, 20000), wav(samples).subarray(20000)]));
  let started = false;
  const pending = playTTS('streamed reply', () => { started = true; });
  await settle();
  const [{ context, scheduled }] = audioContexts;
  expect(scheduled.length).toBeGreaterThan(0);
  expect(started).toBe(true);
  // Playback is scheduled on the audio graph, not an <audio> element blob URL.
  expect(global.Audio).not.toHaveBeenCalled();
  expect(context.close).not.toHaveBeenCalled();
  scheduled.at(-1).onended();
  await pending;
  expect(context.close).toHaveBeenCalled();
});

test('stopping streamed playback closes the audio context and settles the turn', async () => {
  const samples = Array.from({ length: 24000 }, () => 1000);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([wav(samples)]));
  const pending = playTTS('stop me');
  await settle();
  ttsService.stopCurrentAudio();
  await pending;
  expect(audioContexts[0].context.close).toHaveBeenCalled();
  expect(ttsService.isPlaying()).toBe(false);
});

test('a streamed response with no audio data settles without scheduling playback', async () => {
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([Buffer.alloc(44)]));
  await playTTS('silent');
  expect(audioContexts[0].scheduled.length).toBe(0);
  expect(global.Audio).not.toHaveBeenCalled();
});

test('playback that finishes while the body is still downloading waits for the drain', async () => {
  const samples = Array.from({ length: 24000 }, () => 1000);
  const first = wav(samples).subarray(0, 20000);
  let delivered = false;
  let releaseDrain;
  const drainGate = new Promise(resolve => { releaseDrain = () => resolve({ done: true, value: undefined }); });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob([first]),
    body: { getReader: () => ({
      // First chunk arrives, then the download stalls until released.
      read: async () => (delivered ? drainGate : ((delivered = true), { done: false, value: new Uint8Array(first) })),
    }) },
  });
  let settled = false;
  const pending = playTTS('stalling reply').then(() => { settled = true; });
  await settle();
  const [{ scheduled }] = audioContexts;
  // Audio already scheduled, but the body has not signalled completion.
  expect(scheduled.length).toBeGreaterThan(0);
  scheduled.at(-1).onended();
  await settle();
  expect(settled).toBe(false);
  releaseDrain();
  await settle();
  // Drain completes, so the turn settles.
  expect(settled).toBe(true);
  await pending;
});

test('odd-sized streamed chunks stay 16-bit aligned so the reply is not noise', async () => {
  // A chunk can end mid-sample. Decoding an odd-length carry would pair each
  // byte with the wrong neighbour and corrupt every later sample.
  const samples = Array.from({ length: 24000 }, (_, i) => (i % 2 === 0 ? 12000 : -12000));
  const full = wav(samples);
  const chunks = [full.subarray(0, 45), full.subarray(45, 44 + 3001), full.subarray(44 + 3001)];
  expect(chunks.some(chunk => chunk.length % 2 !== 0)).toBe(true);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse(chunks));
  const pending = playTTS('aligned reply');
  await settle();
  const [{ context, scheduled }] = audioContexts;
  expect(scheduled.length).toBeGreaterThan(0);

  // Reassemble everything handed to the audio graph and check it matches the
  // source PCM exactly; misalignment shows up as a flipped-sign ramp.
  const lengths = scheduled.map(source => source.buffer.length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const decoded = new Float32Array(total);
  let offset = 0;
  scheduled.forEach((source, index) => {
    expect(source.buffer.sampleRate).toBe(context.createBuffer.mock.calls[index][2]);
    decoded.set(source.buffer.getChannelData(), offset);
    offset += source.buffer.length;
  });
  expect(total).toBe(samples.length);
  samples.forEach((value, index) => {
    expect(decoded[index]).toBeCloseTo(value / 0x8000, 6);
  });

  scheduled.at(-1).onended();
  await pending;
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
