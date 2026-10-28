import { browserAudioReady, requestAndroidAudioState } from './androidAudio';
import { BrowserMicrophoneCoordinator, withCaptureRetry } from './browserMicrophone';

afterEach(() => {
  delete window.__AIRA_ANDROID_APP__;
  delete window.__AIRA_IOS_APP__;
  delete window.__AIRA_ANDROID_AUDIO__;
  delete window.ReactNativeWebView;
});
const android = () => {
  window.__AIRA_ANDROID_APP__ = true;
  window.ReactNativeWebView = { postMessage: jest.fn(), injectedObjectJson: () => JSON.stringify({ airaAndroidAudioVersion: 1 }) };
};
test('new Android wrapper waits for initial native state and requests it', () => {
  android();
  expect(browserAudioReady()).toBe(false);
  requestAndroidAudioState();
  expect(window.ReactNativeWebView.postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'AIRA_ANDROID_AUDIO_STATE', version: 1 }));
});
test.each([
  ['pending', true, false], ['denied', true, false], ['granted', false, false], ['granted', true, true],
])('Android permission %s foreground %s gives readiness %s', (permission, foreground, expected) => {
  android();
  window.__AIRA_ANDROID_AUDIO__ = { version: 1, permission, foreground };
  expect(browserAudioReady()).toBe(expected);
});
test('legacy Android, browsers, and native iOS retain their capture paths', () => {
  expect(browserAudioReady()).toBe(true);
  window.__AIRA_ANDROID_APP__ = true;
  expect(browserAudioReady()).toBe(true);
  delete window.__AIRA_ANDROID_APP__;
  window.__AIRA_IOS_APP__ = true;
  window.__AIRA_ANDROID_AUDIO__ = { version: 1, permission: 'denied', foreground: false };
  expect(browserAudioReady()).toBe(true);
});
test('pending native permission prevents capture and coordinator ownership; grant permits acquisition', async () => {
  android();
  const microphone = new BrowserMicrophoneCoordinator();
  const capture = jest.fn();
  await expect(microphone.acquire('wake', async () => {})).rejects.toMatchObject({ name: 'AbortError' });
  await expect(withCaptureRetry(capture, () => true)).rejects.toMatchObject({ name: 'AbortError' });
  expect(capture).not.toHaveBeenCalled();
  expect(microphone.mode).toBe(null);
  window.__AIRA_ANDROID_AUDIO__ = { version: 1, permission: 'granted', foreground: true };
  const lease = await microphone.acquire('wake', async () => {});
  expect(lease.isCurrent()).toBe(true);
  lease.release();
});


test('Android user agent identifies readiness before script injection runs', () => {
  const original = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android; wv Air2oAndroidAudio/1' });
  try { expect(browserAudioReady()).toBe(false); }
  finally { Object.defineProperty(navigator, 'userAgent', { configurable: true, value: original }); }
});
