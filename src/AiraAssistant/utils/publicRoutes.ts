/**
 * Public / unauthenticated route allowlist. The wake-word listener must
 * NEVER arm on these paths — requesting a microphone stream before the
 * user has signed in surfaces permission prompts, audio context errors,
 * and (worst case) a "Hey Aira" activation that has no chat surface to
 * navigate to.
 *
 * Keep this list aligned with the <Route> entries in src/App.js. Any
 * route that renders Login / Signup / Forgot-password / Set-password /
 * OTP / Security-questions / Contact / Connect / Wi-Fi setup belongs here.
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set<string>([
  '/',
  '/login',
  '/signup',
  '/set-sign-password',
  '/set-delegate-sign-password',
  '/forgotpassword',
  '/setpassword',
  '/otp',
  '/security',
  '/customer-data',
  '/delegate-data',
  '/contact',
  '/connect',
  '/staticscreen',
  '/wifi-screen',
  '/wifi-instructions',
]);

/**
 * Returns true when the given pathname is a public/unauthenticated route
 * and the wake-word listener should be DISARMED (or prevented from
 * arming in the first place).
 *
 * Path matching is exact by design — we never want a sub-path of a
 * protected route (e.g. /feedback/:requestId) to be considered public
 * just because its first segment resembles a public one.
 */
export function isPublicRoute(pathname: string): boolean {
  if (!pathname) return true;
  return PUBLIC_ROUTES.has(pathname);
}
