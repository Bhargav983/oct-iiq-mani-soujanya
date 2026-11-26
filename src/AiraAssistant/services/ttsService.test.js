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
let initialContextState = 'running';
let resumeImplementation;
const originalAudioContext = global.AudioContext;
beforeEach(() => {
  audioContexts = [];
  initialContextState = 'running';
  resumeImplementation = undefined;
  global.AudioContext = jest.fn(() => {
    const scheduled = [];
    const context = {
      currentTime: 0, state: initialContextState, destination: {},
      resume: jest.fn(() => resumeImplementation?.() ?? Promise.resolve()),
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

test('the first PCM block fades in over 10 ms', async () => {
  const samples = Array.from({ length: 6000 }, () => 16384);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([pcm(samples)]));
  const pending = playTTS('fade in');
  await settle();
  const [{ scheduled }] = audioContexts;
  const decoded = scheduled[0].buffer.getChannelData();
  expect(decoded[0]).toBe(0);
  expect(decoded[120]).toBeCloseTo(0.25, 6);
  expect(decoded[239]).toBeCloseTo((239 / 240) * 0.5, 6);
  expect(decoded[240]).toBeCloseTo(0.5, 6);
  scheduled.at(-1).onended();
  await pending;
});

test('the final PCM block fades out and is followed by 40 ms of silence', async () => {
  const samples = Array.from({ length: 6000 }, () => 16384);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([pcm(samples)]));
  const pending = playTTS('fade out');
  await settle();
  const [{ scheduled }] = audioContexts;
  expect(scheduled).toHaveLength(2);
  const finalPcm = scheduled[0].buffer.getChannelData();
  const silence = scheduled[1].buffer.getChannelData();
  expect(finalPcm[5639]).toBeCloseTo(0.5, 6);
  expect(finalPcm[5640]).toBeCloseTo(0.5, 6);
  expect(finalPcm[5820]).toBeCloseTo(0.5 * (179 / 359), 6);
  expect(finalPcm[5999]).toBe(0);
  expect(silence).toHaveLength(960);
  expect(silence.every(sample => sample === 0)).toBe(true);
  scheduled.at(-1).onended();
  await pending;
});

test('a suspended context resumes before PCM is read and scheduled', async () => {
  initialContextState = 'suspended';
  const samples = Array.from({ length: 6000 }, () => 1000);
  let releaseResume;
  const resumeGate = new Promise(resolve => { releaseResume = resolve; });
  resumeImplementation = () => resumeGate;
  const read = jest.fn(streamedResponse([pcm(samples)]).body.getReader().read);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: { getReader: () => ({ read }) } });
  const pending = playTTS('resume first');
  await settle();
  const [{ context, scheduled }] = audioContexts;
  expect(context.resume).toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(scheduled).toHaveLength(0);
  releaseResume();
  await settle();
  expect(read).toHaveBeenCalled();
  expect(scheduled.length).toBeGreaterThan(0);
  expect(context.resume.mock.invocationCallOrder[0]).toBeLessThan(scheduled[0].start.mock.invocationCallOrder[0]);
  scheduled.at(-1).onended();
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
  const pcmSources = scheduled.slice(0, -1);
  const total = pcmSources.reduce((sum, source) => sum + source.buffer.length, 0);
  const decoded = new Float32Array(total);
  let offset = 0;
  pcmSources.forEach((source) => {
    decoded.set(source.buffer.getChannelData(), offset);
    offset += source.buffer.length;
  });
  expect(total).toBe(samples.length);
  samples.forEach((value, index) => {
    const fadeIn = index < 240 ? index / 240 : 1;
    const fadeOut = index >= samples.length - 360 ? (samples.length - 1 - index) / 359 : 1;
    expect(decoded[index]).toBeCloseTo((value / 32768) * fadeIn * fadeOut, 6);
  });

  scheduled.at(-1).onended();
  await pending;
});

test('a trailing odd byte is discarded rather than decoded as a partial sample', async () => {
  const samples = Array.from({ length: 6000 }, () => 1000);
  const bytes = pcm(samples);
  global.fetch = jest.fn().mockResolvedValue(streamedResponse([bytes, Uint8Array.of(255)]));
  const pending = playTTS('odd final byte');
  await settle();
  const [{ scheduled }] = audioContexts;
  const decodedSamples = scheduled.slice(0, -1).reduce((sum, source) => sum + source.buffer.length, 0);
  expect(decodedSamples).toBe(samples.length);
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
  // Draining appends the tail silence; the turn settles only after it ends.
  expect(settled).toBe(false);
  scheduled.at(-1).onended();
  await settle();
  expect(settled).toBe(true);
  await pending;
});

test('late PCM after an underrun re-anchors and waits for the new final block', async () => {
  const first = pcm(Array.from({ length: 6000 }, () => 1000));
  const second = pcm(Array.from({ length: 6000 }, () => 2000));
  let releaseSecond;
  const secondGate = new Promise(resolve => { releaseSecond = () => resolve({ done: false, value: new Uint8Array(second) }); });
  let reads = 0;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    body: { getReader: () => ({
      read: async () => {
        reads += 1;
        if (reads === 1) return { done: false, value: new Uint8Array(first) };
        if (reads === 2) return secondGate;
        return { done: true, value: undefined };
      },
    }) },
  });
  let settled = false;
  const pending = playTTS('recover after a stall').then(() => { settled = true; });
  await settle();
  const [{ context, scheduled }] = audioContexts;
  scheduled[0].onended();
  context.currentTime = 2;
  releaseSecond();
  await settle();
  expect(scheduled).toHaveLength(3);
  expect(scheduled[1].start).toHaveBeenCalledWith(2.03);
  expect(context.close).not.toHaveBeenCalled();
  expect(settled).toBe(false);
  scheduled[0].onended();
  expect(settled).toBe(false);
  scheduled[1].onended();
  expect(settled).toBe(false);
  scheduled[2].onended();
  await pending;
  expect(context.close).toHaveBeenCalled();
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
