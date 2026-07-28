import {
  ANDROID_WEBVIEW_SAFE_TOP_PX,
  getNativeSafeTop,
} from "./mobileSafeArea";

test("does not add a native inset in a normal browser", () => {
  expect(
    getNativeSafeTop({
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      visualViewportOffsetTop: 18,
    })
  ).toBe(0);
});

test("provides an Android WebView fallback when no inset is reported", () => {
  expect(
    getNativeSafeTop({
      isReactNativeWebView: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
    })
  ).toBe(ANDROID_WEBVIEW_SAFE_TOP_PX);
});

test("prefers a larger measured Android inset", () => {
  expect(
    getNativeSafeTop({
      isReactNativeWebView: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      visualViewportOffsetTop: 32,
    })
  ).toBe(32);
});

test("does not invent an iOS inset when CSS safe areas handle it", () => {
  expect(
    getNativeSafeTop({
      isReactNativeWebView: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    })
  ).toBe(0);
});