export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof WebSocket !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}