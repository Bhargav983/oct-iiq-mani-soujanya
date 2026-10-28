import { detectVoiceRuntime } from './voiceEnvironment';

export type MicrophoneMode = 'wake' | 'conversation' | 'dictation';
export interface MicrophoneLease { mode: MicrophoneMode; isCurrent: () => boolean; release: () => void }
type Owner = { lease: MicrophoneLease; stop: () => Promise<void> };
export const audioCancelled = () => new DOMException('Voice session was cancelled.', 'AbortError');

/** A failed release leaves ownership in place: never open a second microphone. */
export class BrowserMicrophoneCoordinator {
  private owner: Owner | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private subscribers = new Set<() => void>();
  get mode(): MicrophoneMode | null { return this.owner?.lease.mode || null; }
  subscribe(listener: () => void) { this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; }
  private idle() { queueMicrotask(() => { if (!this.owner) this.subscribers.forEach(listener => listener()); }); }

  acquire(mode: MicrophoneMode, stop: () => Promise<void>, valid: () => boolean = () => true): Promise<MicrophoneLease | null> {
    const request = this.queue.catch(() => {}).then(async () => {
      if (!valid()) throw audioCancelled();
      if (mode === 'wake' && this.owner) return null;
      const previous = this.owner;
      if (previous) {
        await previous.stop();
        if (this.owner === previous) this.owner = null;
        if (detectVoiceRuntime() === 'android-webview') await new Promise(resolve => setTimeout(resolve, 150));
      }
      if (!valid()) { this.idle(); throw audioCancelled(); }
      const lease: MicrophoneLease = { mode, isCurrent: () => this.owner?.lease === lease,
        release: () => { if (this.owner?.lease === lease) { this.owner = null; this.idle(); } } };
      this.owner = { lease, stop };
      return lease;
    });
    this.queue = request;
    return request;
  }
}

export const browserMicrophone = new BrowserMicrophoneCoordinator();

/** Only Android capture-start failures are retried; model/permission errors are not. */
export async function openBrowserMicrophone(constraints: MediaStreamConstraints, valid: () => boolean): Promise<MediaStream> {
  const stream = await withCaptureRetry(() => navigator.mediaDevices.getUserMedia(constraints), valid);
  if (!valid()) { stream.getTracks().forEach(track => track.stop()); throw audioCancelled(); }
  return stream;
}

export async function withCaptureRetry<T>(operation: () => Promise<T>, valid: () => boolean, cleanup: () => Promise<void> = async () => {}): Promise<T> {
  const retries = detectVoiceRuntime() === 'android-webview' ? [200, 500] : [];
  for (let attempt = 0; ; attempt += 1) {
    if (!valid()) throw audioCancelled();
    try {
      return await operation();
    } catch (error) {
      if (!valid()) throw audioCancelled();
      if ((error as Error).name !== 'NotReadableError' || attempt >= retries.length) throw error;
      await cleanup();
      await new Promise(resolve => setTimeout(resolve, retries[attempt]));
    }
  }
}
