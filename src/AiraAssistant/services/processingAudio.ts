import type { Language } from '../types';

const CHIME_DELAY_MS = 500;
const FILLER_DELAY_MS = 2500;
const FILLERS_BY_LANG: Record<Language, Array<{ text: string; url: string }>> = {
  en: [
    { text: 'Still checking that for you.', url: '/audio/aira/en/still-checking.mp3' },
    { text: 'One moment while I pull that up.', url: '/audio/aira/en/pull-up.mp3' },
    { text: 'Checking now.', url: '/audio/aira/en/checking.mp3' },
  ],
  hi: [
    { text: 'अभी आपके लिए जाँच जारी है।', url: '/audio/aira/hi/still-checking.mp3' },
    { text: 'एक पल रुकिए, मैं जानकारी निकाल रही हूँ।', url: '/audio/aira/hi/pull-up.mp3' },
    { text: 'अभी जाँच रही हूँ।', url: '/audio/aira/hi/checking.mp3' },
  ],
  ar: [
    { text: 'ما زلت أتحقق من ذلك من أجلك.', url: '/audio/aira/ar/still-checking.mp3' },
    { text: 'لحظة واحدة بينما أحضر لك المعلومات.', url: '/audio/aira/ar/pull-up.mp3' },
    { text: 'جاري التحقق الآن.', url: '/audio/aira/ar/checking.mp3' },
  ],
};

/** Local, cancellable latency cues. Real TTS owns the microphone-suppression state. */
export class ProcessingAudio {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private generation = 0;
  private lastFillerIndex = -1;

  start(lang: Language = 'en'): void {
    this.stop();
    const generation = ++this.generation;
    this.timers.push(setTimeout(() => { if (generation === this.generation) this.playChime(); }, CHIME_DELAY_MS));
    this.timers.push(setTimeout(() => { if (generation === this.generation) this.playFiller(lang); }, FILLER_DELAY_MS));
  }

  stop(): void {
    ++this.generation;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const audio = this.audio;
    this.audio = null;
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.volume = 0;
      audio.pause();
      audio.currentTime = 0;
    }
    if (this.gain && this.context) {
      try {
        this.gain.gain.setValueAtTime(0.0001, this.context.currentTime);
      } catch { /* context already closed */ }
    }
    this.gain = null;
    try { this.oscillator?.stop(); } catch { /* already stopped */ }
    this.oscillator = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private playChime(): void {
    if (typeof AudioContext === 'undefined') return;
    try {
      const context = new AudioContext();
      this.context = context;
      void context.resume?.().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      this.oscillator = oscillator;
      this.gain = gain;
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.13);
      oscillator.onended = () => { if (this.context === context) void context.close().catch(() => undefined); };
    } catch { /* Web Audio unavailable */ }
  }

  private nextFillerIndex(length: number): number {
    if (length <= 1) return 0;
    let index = Math.floor(Math.random() * length);
    if (index === this.lastFillerIndex) {
      index = (index + 1) % length;
    }
    this.lastFillerIndex = index;
    return index;
  }

  private playFiller(lang: Language): void {
    if (typeof Audio === 'undefined') return;
    const list = FILLERS_BY_LANG[lang] ?? FILLERS_BY_LANG.en;
    const filler = list[this.nextFillerIndex(list.length)];
    const audio = new Audio(filler.url);
    this.audio = audio;
    audio.preload = 'auto';
    audio.onerror = () => {
      if (this.audio !== audio || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(filler.text);
      utterance.lang = lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-US';
      utterance.volume = 0.35;
      window.speechSynthesis.speak(utterance);
    };
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => {
          if (this.audio !== audio) return;
          audio.onerror?.(new Event('error'));
        });
      }
    } catch {
      if (this.audio === audio) {
        audio.onerror?.(new Event('error'));
      }
    }
  }
}
