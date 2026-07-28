export const PULL_REFRESH_IGNORE_SELECTOR = [
  '[data-pull-refresh-ignore="true"]',
  ".service-dropdown-wrapper",
  ".service-dropdown-container",
  ".service-dropdown-list",
  ".service-dropdown-header",
  ".temp-container",
  ".temp-circle-control",
  ".service-switching-overlay",
  ".confirmation-overlay",
  "button",
  "input",
  "select",
  "textarea",
].join(", ");

export const shouldIgnorePullRefreshTarget = (target) =>
  Boolean(target?.closest?.(PULL_REFRESH_IGNORE_SELECTOR));

export const getPullGesture = (startX, startY, currentX, currentY) => {
  const deltaX = currentX - startX;
  const deltaY = currentY - startY;
  return {
    deltaX,
    deltaY,
    isDownwardVertical:
      deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX),
  };
};

export const canStartPullRefresh = ({
  target,
  pageScrollTop = 0,
  isRefreshing = false,
}) =>
  !isRefreshing &&
  pageScrollTop <= 0 &&
  !shouldIgnorePullRefreshTarget(target);