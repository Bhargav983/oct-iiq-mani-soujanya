import { shouldShowDelegateServiceSelector } from "./delegateNavbarRoutes";

test("shows the assigned service selector only on the delegate requests page", () => {
  expect(shouldShowDelegateServiceSelector("/delegate-display-request")).toBe(true);
  expect(shouldShowDelegateServiceSelector("/delegate-display-request/")).toBe(true);
  expect(shouldShowDelegateServiceSelector("/DELEGATE-DISPLAY-REQUEST")).toBe(true);
});

test.each([
  "/delegate-alarms",
  "/delegate-timers",
  "delegate-chatbot",
  "/delegate-settings",
  "/delegate-home",
  "/delegate-survey",
  "/delegate-profile-details",
  "/delegate-machinescreen1",
  "/delegate-request",
  "/delegate-complaint-form",
])("hides the assigned service selector on %s", (pathname) => {
  expect(shouldShowDelegateServiceSelector(pathname)).toBe(false);
});