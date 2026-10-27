// ============================================================
// Response helpers for /api/super-admin/billing/razorpay/* — SERVER ONLY.
//
// Same `{ error, code }` shape and status codes as the customer billing
// routes (toRazorpayErrorResponse), with two differences for operators:
// Razorpay's own wording and HTTP status are included, and database
// errors are shown instead of "Something went wrong". Every response is
// `Cache-Control: no-store`.
// ============================================================

import { NextResponse } from 'next/server';

import { superAdminErrorResponse } from '@/lib/super-admin/guard';
import { RazorpayApiError } from './client';
import { BillingDbError } from './db';
import { toRazorpayErrorResponse } from './runtime';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function adminJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function adminError(
  error: string,
  code: string,
  status: number
): NextResponse {
  return adminJson({ error, code }, status);
}

export const badOriginResponse = () =>
  adminError('Forbidden', 'bad_origin', 403);

export function adminBillingErrorResponse(
  err: unknown,
  context: string
): NextResponse {
  const auth = superAdminErrorResponse(err);
  if (auth) return auth;

  let res: NextResponse;
  if (err instanceof RazorpayApiError) {
    console.error(
      `[razorpay admin] ${context}: provider ${err.status} ${err.code ?? ''} ${err.message}`
    );
    res = adminError(
      `Razorpay could not complete the request (HTTP ${err.status}${
        err.code ? ` ${err.code}` : ''
      }: ${err.message}). Try again in a minute.`,
      'provider_error',
      502
    );
  } else if (err instanceof BillingDbError) {
    console.error(`[razorpay admin] ${context}: ${err.message}`);
    res = adminError(err.message, 'internal', 500);
  } else {
    res = toRazorpayErrorResponse(err, `admin ${context}`);
  }
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
