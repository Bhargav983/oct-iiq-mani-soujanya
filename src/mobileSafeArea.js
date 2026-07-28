export const ANDROID_WEBVIEW_SAFE_TOP_PX = 24;

export const getNativeSafeTop = ({
  isReactNativeWebView = false,
  userAgent = "",
  visualViewportOffsetTop = 0,
} = {}) => {
  if (!isReactNativeWebView) return 0;
  const measuredInset = Math.max(0, Number(visualViewportOffsetTop) || 0);
  return /android/i.test(userAgent)
    ? Math.max(measuredInset, ANDROID_WEBVIEW_SAFE_TOP_PX)
    : measuredInset;
};

export const installNativeSafeArea = (windowObject = window) => {
  const root = windowObject.document?.documentElement;
  if (!root) return () => {};

  const update = () => {
    const safeTop = getNativeSafeTop({
      isReactNativeWebView: Boolean(windowObject.ReactNativeWebView),
      userAgent: windowObject.navigator?.userAgent || "",
      visualViewportOffsetTop: windowObject.visualViewport?.offsetTop || 0,
    });
    root.style.setProperty("--airo-native-safe-top", `${safeTop}px`);
  };

  update();
  windowObject.addEventListener("orientationchange", update);
  windowObject.addEventListener("resize", update);
  windowObject.visualViewport?.addEventListener("resize", update);

  return () => {
    windowObject.removeEventListener("orientationchange", update);
    windowObject.removeEventListener("resize", update);
    windowObject.visualViewport?.removeEventListener("resize", update);
  };
};