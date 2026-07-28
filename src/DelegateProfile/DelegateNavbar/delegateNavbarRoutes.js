export const DELEGATE_SERVICE_SELECTOR_PATH = "/delegate-display-request";

export const shouldShowDelegateServiceSelector = (pathname = "") => {
  const normalizedPath = String(pathname).toLowerCase().replace(/\/+$/, "");
  return normalizedPath === DELEGATE_SERVICE_SELECTOR_PATH;
};