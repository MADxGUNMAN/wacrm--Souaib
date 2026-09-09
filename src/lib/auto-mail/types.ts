// ============================================================
// Auto Mail shared types.
// ============================================================

/** The two audiences, each with its own independent rule row. */
export type AutoEmailSegment = 'trial' | 'paid';

export const AUTO_EMAIL_SEGMENTS: AutoEmailSegment[] = ['trial', 'paid'];

export type AutoEmailStatus = 'sending' | 'sent' | 'failed' | 'skipped';
export type AutoEmailTrigger = 'auto' | 'manual';

/** A row of `auto_email_rules`. */
export interface AutoEmailRule {
  id: string;
  segment: AutoEmailSegment;
  is_enabled: boolean;
  /** Days before the window closes. Multiple entries = multiple stages. */
  offsets_days: number[];
  subject_template: string;
  heading_template: string;
  body_template: string;
  cta_label: string;
  /** Site-relative; the origin is prepended at render time. */
  cta_path: string;
  footer_note: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A row of `auto_email_log`. */
export interface AutoEmailLogRow {
  id: string;
  account_id: string;
  segment: AutoEmailSegment;
  offset_days: number;
  window_end: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  days_left: number | null;
  status: AutoEmailStatus;
  error_detail: string | null;
  trigger: AutoEmailTrigger;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Log row joined with the workspace name, for the admin history list. */
export interface AutoEmailLogEntry extends AutoEmailLogRow {
  account_name: string | null;
}

/**
 * Values available to an operator's template.
 *
 * Every one of these always resolves to something non-empty for a real
 * send EXCEPT `plan_name`, which is absent when a trialing account has
 * not chosen a plan yet. That is why the seeded default copy never
 * depends on `plan_name` for its grammar — see the migration.
 */
export interface AutoEmailVars {
  /** Recipient's first name, or "there" so "Hi {name}," always reads. */
  name: string;
  /** Full name as stored, when we have one. */
  full_name: string;
  /** Workspace / account name. */
  workspace: string;
  site_name: string;
  /** Formatted like "8 Sep 2026". */
  expiry_date: string;
  days_left: number;
  /** "less than a day" / "1 day" / "5 days" — already pluralised. */
  days_phrase: string;
  plan_name: string;
}
