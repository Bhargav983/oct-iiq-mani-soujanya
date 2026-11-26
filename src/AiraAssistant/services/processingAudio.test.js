import { ProcessingAudio } from './processingAudio';

const close = jest.fn();
const stop = jest.fn();
const originalAudioContext = global.AudioContext;
const originalAudio = global.Audio;
const play = jest.fn();
const pause = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  close.mockResolvedValue(undefined);
  play.mockResolvedValue(undefined);
  global.AudioContext = jest.fn(() => ({
    currentTime: 0,
    destination: {},
    resume: jest.fn().mockResolvedValue(undefined),
    close,
    createOscillator: () => ({ frequency: { setValueAtTime: jest.fn() }, connect: () => ({ connect: jest.fn() }), start: jest.fn(), stop }),
    createGain: () => ({ gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: () => ({ connect: jest.fn() }) }),
  }));
  global.Audio = jest.fn(() => ({ play, pause, volume: 1, currentTime: 0, onended: null, onerror: null }));
  window.speechSynthesis = { cancel: jest.fn(), speak: jest.fn() };
});

afterEach(() => {
  jest.useRealTimers();
  global.AudioContext = originalAudioContext;
  global.Audio = originalAudio;
});

test('fast responses play no latency cues', () => {
  const cues = new ProcessingAudio();
  cues.start();
  jest.advanceTimersByTime(499);
  cues.stop();
  jest.advanceTimersByTime(3000);
  expect(global.AudioContext).not.toHaveBeenCalled();
  expect(global.Audio).not.toHaveBeenCalled();
});

test('medium responses play only the subtle chime and no spoken filler', () => {
  const cues = new ProcessingAudio();
  cues.start();
  jest.advanceTimersByTime(1500);
  expect(global.AudioContext).toHaveBeenCalledTimes(1);
  expect(global.Audio).not.toHaveBeenCalled();
  cues.stop();
  jest.advanceTimersByTime(3000);
  expect(global.Audio).not.toHaveBeenCalled();
});

test('slow responses play one chime and one locally bundled Gemini Kore mp3 filler in the active language', () => {
  const cues = new ProcessingAudio();
  cues.start('en');
  jest.advanceTimersByTime(2500);
  expect(global.AudioContext).toHaveBeenCalledTimes(1);
  expect(global.Audio).toHaveBeenCalledTimes(1);
  expect(global.Audio.mock.calls[0][0]).toMatch(/^\/audio\/aira\/en\/.+\.mp3$/);
  jest.advanceTimersByTime(5000);
  expect(global.Audio).toHaveBeenCalledTimes(1);
  cues.stop();
  expect(pause).toHaveBeenCalled();

  cues.start('hi');
  jest.advanceTimersByTime(2500);
  expect(global.Audio.mock.calls[1][0]).toMatch(/^\/audio\/aira\/hi\/.+\.mp3$/);
  cues.stop();

  cues.start('ar');
  jest.advanceTimersByTime(2500);
  expect(global.Audio.mock.calls[2][0]).toMatch(/^\/audio\/aira\/ar\/.+\.mp3$/);
  cues.stop();
});

test('real response audio cancels pending and playing cues', () => {
  const cues = new ProcessingAudio();
  cues.start();
  jest.advanceTimersByTime(2500);
  cues.stop();
  expect(stop).toHaveBeenCalled();
  expect(pause).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  jest.advanceTimersByTime(5000);
  expect(global.Audio).toHaveBeenCalledTimes(1);
});
