// ============================================================
// Wiring for the billing routes — SERVER ONLY.
//
// One place that turns env + service role into `BillingDeps`, and one
// error mapper so every Razorpay route answers in the same shape:
// `{ error, code }` with a status. Messages are written for customers;
// Razorpay's own wording and status are logged, never returned.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { toBillingErrorResponse } from '@/lib/subscription/guard';
import { RazorpayApiError, RazorpayClient } from './client';
import {
  RazorpayConfigError,
  readRazorpayConfig,
  type RazorpayConfig,
} from './config';
import { BillingDbError, createBillingDb } from './db';
import { MoneyError } from './money';
import { ProviderPlanError } from './plans';
import { BillingServiceError, type BillingDeps } from './service';

let cachedClient: { keyId: string; client: RazorpayClient } | null = null;

function clientFor(config: RazorpayConfig): RazorpayClient {
  if (!cachedClient || cachedClient.keyId !== config.keyId) {
    cachedClient = {
      keyId: config.keyId,
      client: new RazorpayClient({
        keyId: config.keyId,
        keySecret: config.keySecret,
      }),
    };
  }
  return cachedClient.client;
}

/** Throws RazorpayConfigError (503) when Razorpay is not configured here. */
export function getBillingDeps(): BillingDeps & { client: RazorpayClient } {
  const config = readRazorpayConfig();
  return {
    config,
    client: clientFor(config),
    db: createBillingDb(supabaseAdmin()),
  };
}

export function toRazorpayErrorResponse(
  err: unknown,
  context: string
): NextResponse {
  if (err instanceof BillingServiceError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status }
    );
  }
  if (err instanceof RazorpayConfigError) {
    console.error(`[razorpay] ${context}: not configured (${err.message})`);
    return NextResponse.json(
      {
        error:
          'Online payment is not available right now. Please try again later.',
        code: 'billing_unavailable',
      },
      { status: 503 }
    );
  }
  if (err instanceof RazorpayApiError) {
    console.error(
      `[razorpay] ${context}: provider ${err.status} ${err.code ?? ''} ${err.message}`
    );
    return NextResponse.json(
      {
        error:
          'Razorpay could not complete the request. Please try again in a minute.',
        code: 'provider_error',
      },
      { status: 502 }
    );
  }
  if (err instanceof ProviderPlanError || err instanceof MoneyError) {
    console.error(`[razorpay] ${context}: ${err.message}`);
    const status = err instanceof ProviderPlanError ? err.status : 400;
    return NextResponse.json(
      { error: err.message, code: 'plan_unavailable' },
      { status }
    );
  }
  if (err instanceof BillingDbError) {
    console.error(`[razorpay] ${context}: ${err.message}`);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.', code: 'internal' },
      { status: 500 }
    );
  }
  return toBillingErrorResponse(err);
}
