// ============================================================
// Customer-facing billing date formatting. Pure and browser-safe, so the
// payment page and the server build identical strings.
// ============================================================

/**
 * "6 Apr 2027", always in IST. Razorpay schedules charges on IST dates,
 * so showing the browser's local date could put a charge on the wrong
 * day for someone in another time zone. Empty string for no/bad input.
 */
export function formatBillingDate(
  value: Date | string | null | undefined
): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}
