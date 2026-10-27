// Same-origin check for state-changing calls made by our own pages.
//
// Browsers always send Origin on POST/PATCH/DELETE, so a request from
// another site — or one with no Origin at all, such as a forged curl
// replaying a session cookie — is refused before anything else runs.
// Shared by the super-admin destructive routes and the Razorpay billing
// routes (plan section 5).

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
