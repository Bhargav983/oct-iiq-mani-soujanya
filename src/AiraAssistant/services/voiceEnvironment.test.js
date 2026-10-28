import { detectVoiceRuntime, voiceCapabilities } from './voiceEnvironment';
const original = navigator.userAgent;
const ua = value => Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
afterEach(() => { ua(original); delete window.ReactNativeWebView; delete window.__AIRA_IOS_APP__; delete window.__AIRA_ANDROID_APP__; });
test('Android APK selects the coordinated browser path', () => {
  ua('Mozilla/5.0 (Linux; Android 14; Phone; wv) AppleWebKit/537.36 Version/4.0 Chrome/125.0');
  expect(detectVoiceRuntime()).toBe('android-webview');
});
test('Android Chrome stays a normal browser', () => {
  ua('Mozilla/5.0 (Linux; Android 14; Phone) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36');
  expect(detectVoiceRuntime()).toBe('browser');
});
test('iOS bridge selects the existing native path', () => {
  window.__AIRA_IOS_APP__ = true;
  expect(detectVoiceRuntime()).toBe('ios-webview');
});
test('capabilities are checked independently of device detection', () => {
  window.__AIRA_ANDROID_APP__ = true;
  expect(voiceCapabilities().native).toBe(false);
});
