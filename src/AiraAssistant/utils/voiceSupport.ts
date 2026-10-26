import { hasNativeVoice, isIosApp } from '../services/nativeVoice';

export function isVoiceSupported(): boolean {
  if (isIosApp()) return hasNativeVoice();
  return typeof window !== 'undefined'
    && typeof WebSocket !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}
