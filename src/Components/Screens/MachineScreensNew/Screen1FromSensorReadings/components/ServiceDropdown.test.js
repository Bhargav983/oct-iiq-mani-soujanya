import { formatAlarmCount, getDropdownScrollState } from "./ServiceDropdown";

test("shows the scroll cue when more machines are below", () => {
  expect(
    getDropdownScrollState({
      scrollHeight: 420,
      clientHeight: 200,
      scrollTop: 0,
    })
  ).toEqual({ isScrollable: true, hasMoreBelow: true });
});

test("hides the scroll cue at the bottom of an overflowing list", () => {
  expect(
    getDropdownScrollState({
      scrollHeight: 420,
      clientHeight: 200,
      scrollTop: 220,
    })
  ).toEqual({ isScrollable: true, hasMoreBelow: false });
});

test("does not show a scroll cue for a short machine list", () => {
  expect(
    getDropdownScrollState({
      scrollHeight: 180,
      clientHeight: 200,
      scrollTop: 0,
    })
  ).toEqual({ isScrollable: false, hasMoreBelow: false });
});

test("ignores sub-pixel differences near the bottom", () => {
  expect(
    getDropdownScrollState({
      scrollHeight: 420,
      clientHeight: 200,
      scrollTop: 219,
    })
  ).toEqual({ isScrollable: true, hasMoreBelow: false });
});
test("caps large alarm totals without changing smaller counts", () => {
  expect(formatAlarmCount(5)).toBe("5");
  expect(formatAlarmCount(99)).toBe("99");
  expect(formatAlarmCount(100)).toBe("99+");
});
