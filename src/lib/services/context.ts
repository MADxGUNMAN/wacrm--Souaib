// ============================================================
// Service layer context — shared by the dashboard and the AI connector
// so both read and write the CRM the same way.
//
// `db` is a USER-SCOPED client (RLS applies). For the AI connector it is
// the per-request JWT client from `createUserScopedClient`, which also
// carries the `ai_conn` claim the AI-deny policies key on. Services
// still filter by `accountId` explicitly: RLS is the second wall, not
// the only one.
// Plan: docs/ai-connector/01-architecture.md §5.3.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Platform } from '@/lib/ai-connector/platforms';

export type ServiceActor =
  { kind: 'user' } | { kind: 'ai'; connectionId: string; platform: Platform };

export interface ServiceContext {
  db: SupabaseClient;
  userId: string;
  accountId: string;
  actor: ServiceActor;
}

/** Thrown by services; the caller maps `code` to its own error format. */
export class ServiceError extends Error {
  readonly code: 'not_found' | 'invalid_input' | 'internal';
  constructor(code: ServiceError['code'], message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clamp a page size to [1, max]. */
export function clampLimit(
  limit: number | undefined,
  fallback: number,
  max: number
): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1)
    return fallback;
  return Math.min(Math.floor(limit), max);
}
