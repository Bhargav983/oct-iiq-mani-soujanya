import {
  canStartPullRefresh,
  getPullGesture,
  shouldIgnorePullRefreshTarget,
} from "./pullToRefreshGesture";

const targetInside = (selector) => ({
  closest: (query) => (query.includes(selector) ? {} : null),
});

test("ignores gestures that start in the machine dropdown", () => {
  const target = targetInside("data-pull-refresh-ignore");
  expect(shouldIgnorePullRefreshTarget(target)).toBe(true);
  expect(
    shouldIgnorePullRefreshTarget(targetInside("service-dropdown-list"))
  ).toBe(true);
  expect(canStartPullRefresh({ target, pageScrollTop: 0 })).toBe(false);
});

test("allows a page gesture only at the top and while idle", () => {
  const pageTarget = { closest: () => null };
  expect(canStartPullRefresh({ target: pageTarget, pageScrollTop: 0 })).toBe(true);
  expect(canStartPullRefresh({ target: pageTarget, pageScrollTop: 4 })).toBe(false);
  expect(
    canStartPullRefresh({ target: pageTarget, pageScrollTop: 0, isRefreshing: true })
  ).toBe(false);
});

test("accepts only downward primarily vertical movement", () => {
  expect(getPullGesture(20, 100, 24, 155).isDownwardVertical).toBe(true);
  expect(getPullGesture(20, 100, 20, 60).isDownwardVertical).toBe(false);
  expect(getPullGesture(20, 100, 90, 120).isDownwardVertical).toBe(false);
});

test("safely ignores common controls", () => {
  expect(shouldIgnorePullRefreshTarget(targetInside("button"))).toBe(true);
  expect(shouldIgnorePullRefreshTarget(targetInside("temp-container"))).toBe(true);
  expect(shouldIgnorePullRefreshTarget(null)).toBe(false);
});