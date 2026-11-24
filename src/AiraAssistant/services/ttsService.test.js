import { playTTS, ttsService } from './ttsService';

const originalFetch = global.fetch;
beforeEach(() => {
  ttsService.cache.clear();
});
afterEach(() => {
  ttsService.stopCurrentAudio();
  global.fetch = originalFetch;
});
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

/** Builds headerless mono 16-bit PCM bytes, matching the `audio/l16` response. */
function pcm(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(value, index * 2));
  return data;
}

/** Response whose body arrives as several chunks, like a streamed download. */
function streamedResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => (index < chunks.length
          ? { done: false, value: new Uint8Array(chunks[index++]) }
          : { done: true, value: undefined }),
        cancel: jest.fn().mockResolvedValue(undefined),
      }),
    },
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
      suspend: jest.fn().mockResolvedValue(undefined),
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

test('synthesis posts to the streaming endpoint with the detected language', async () => {
  const samples = Array.from({ length: 6000 }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([pcm(samples)]));
  const pending = playTTS('compressor is fine');
  await settle();
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toContain('/api/aira-voice/tts/stream');
  const body = JSON.parse(init.body);
  expect(body.language).toBe('en');
  expect(body.text).toBe('compressor is fine');
  audioContexts[0].scheduled.at(-1).onended();
  await pending;
});

test('Hindi synthesis preserves spoken Unicode', async () => {
  const samples = Array.from({ length: 6000 }, () => 1000);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([pcm(samples)]));
  const pending = playTTS('नमस्ते, मैं AIRA हूँ।');
  await settle();
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.language).toBe('hi');
  expect(body.text).toBe('नमस्ते, मैं Aira हूँ।');
  audioContexts[0].scheduled.at(-1).onended();
  await pending;
});

test('raw PCM is decoded at 24 kHz without a WAV container', async () => {
  const samples = Array.from({ length: 12000 }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([pcm(samples)]));
  const pending = playTTS('raw pcm reply');
  await settle();
  const [{ context, scheduled }] = audioContexts;
  expect(scheduled.length).toBeGreaterThan(0);
  // Every buffer is created at the fixed PCM rate; there is no fmt chunk to read.
  context.createBuffer.mock.calls.forEach(([, , rate]) => expect(rate).toBe(24000));
  audioContexts[0].scheduled.at(-1).onended();
  await pending;
});

test('streamed synthesis starts playback before the whole body arrives', async () => {
  const samples = Array.from({ length: 24000 }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  const bytes = pcm(samples);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([bytes.subarray(0, 20000), bytes.subarray(20000)]));
  let started = false;
  const pending = playTTS('streamed reply', () => { started = true; });
  await settle();
  const [{ context, scheduled }] = audioContexts;
  expect(scheduled.length).toBeGreaterThan(0);
  expect(started).toBe(true);
  expect(context.close).not.toHaveBeenCalled();
  scheduled.at(-1).onended();
  await pending;
  expect(context.close).toHaveBeenCalled();
});

test('odd-sized streamed chunks stay 16-bit aligned so the reply is not noise', async () => {
  // A chunk can end mid-sample. Decoding an odd-length buffer would pair each
  // byte with the wrong neighbour and corrupt every later sample.
  const samples = Array.from({ length: 24000 }, (_, i) => (i % 2 === 0 ? 12000 : -12000));
  const bytes = pcm(samples);
  const chunks = [bytes.subarray(0, 3001), bytes.subarray(3001, 3001 + 4003), bytes.subarray(3001 + 4003)];
  expect(chunks.some(chunk => chunk.length % 2 !== 0)).toBe(true);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse(chunks));
  const pending = playTTS('aligned reply');
  await settle();
  const [{ scheduled }] = audioContexts;
  expect(scheduled.length).toBeGreaterThan(0);

  // Reassemble everything handed to the audio graph and compare it to the
  // source PCM; misalignment shows up as a flipped-sign ramp.
  const total = scheduled.reduce((sum, source) => sum + source.buffer.length, 0);
  const decoded = new Float32Array(total);
  let offset = 0;
  scheduled.forEach((source) => {
    decoded.set(source.buffer.getChannelData(), offset);
    offset += source.buffer.length;
  });
  expect(total).toBe(samples.length);
  samples.forEach((value, index) => {
    expect(decoded[index]).toBeCloseTo(value / 32768, 6);
  });

  scheduled.at(-1).onended();
  await pending;
});

test('stopping streamed playback cancels the body, stops queued audio and closes the context', async () => {
  const samples = Array.from({ length: 24000 }, () => 1000);
  const reader = {
    read: jest.fn().mockResolvedValue({ done: false, value: new Uint8Array(pcm(samples)) }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    body: { getReader: () => reader },
  });
  const pending = playTTS('stop me');
  await settle();
  const [{ context, scheduled }] = audioContexts;
  expect(scheduled.length).toBeGreaterThan(0);
  ttsService.stopCurrentAudio();
  await pending;
  // The in-flight HTTP body is released rather than left downloading.
  expect(reader.cancel).toHaveBeenCalled();
  // Already-scheduled blocks are silenced so nothing plays after the stop.
  scheduled.forEach(source => expect(source.stop).toHaveBeenCalled());
  expect(context.close).toHaveBeenCalled();
  expect(ttsService.isPlaying()).toBe(false);
});

test('a streamed response with no audio data settles without scheduling playback', async () => {
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([Buffer.alloc(0)]));
  await playTTS('silent');
  expect(audioContexts[0].scheduled.length).toBe(0);
});

test('playback that finishes while the body is still downloading waits for the drain', async () => {
  const samples = Array.from({ length: 24000 }, () => 1000);
  const first = pcm(samples).subarray(0, 20000);
  let delivered = false;
  let releaseDrain;
  const drainGate = new Promise(resolve => { releaseDrain = () => resolve({ done: true, value: undefined }); });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
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

test('replaying the same reply reuses synthesis only for the same identity', async () => {
  const samples = Array.from({ length: 12000 }, (_, i) => Math.round(6000 * Math.sin(i / 6)));
  const bytes = pcm(samples);
  // Fresh reader per call: a shared response object would already be drained.
  global.fetch = jest.fn(() => Promise.resolve(streamedResponse([bytes])));

  const playOnce = async (auth) => {
    const index = audioContexts.length;
    const pending = playTTS('AIRA can help', undefined, auth);
    await settle();
    const scheduled = audioContexts[index].scheduled;
    expect(scheduled.length).toBeGreaterThan(0);
    scheduled.at(-1).onended();
    await pending;
  };

  await playOnce({ userId: 'u', companyId: 'c' });
  await playOnce({ userId: 'u', companyId: 'c' });
  // The second identical request replays cached PCM, so it never refetches.
  expect(global.fetch).toHaveBeenCalledTimes(1);

  await playOnce({ userId: 'other', companyId: 'c' });
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('a failing gateway rejects the turn promise', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
  await expect(playTTS('boom')).rejects.toThrow(/500/);
});
