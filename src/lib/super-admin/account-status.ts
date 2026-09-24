// ============================================================
// One definition of an account's "Active / Inactive" state.
//
// ─── The bug this module exists to kill ──────────────────────────
//
// "Active" meant two different things in two places, so filtering the
// accounts list by Inactive and opening a row showed "Active" on the
// very next screen:
//
//   Accounts list  → Active = the workspace is BEING USED
//                    (WhatsApp connected, or messages in the last 30 days)
//   Deep-dive head → Active = the workspace is NOT BANNED
//
// Both were individually defensible and together they were nonsense.
// Every unbanned account read as "Active" in the header regardless of
// whether it had ever sent a message.
//
// ─── The model ───────────────────────────────────────────────────
//
// There are two INDEPENDENT facts and they need different words:
//
//   activity  — is anyone actually using this workspace?   (derived)
//   banned    — has an operator revoked access?            (an admin action)
//
// A banned account can still have been active last week; a brand-new
// account is neither banned nor active. So the header now shows both,
// and `Active/Inactive` everywhere means ACTIVITY — matching the list.
//
// ─── Keep this in step with the SQL filter ───────────────────────
//
// `getAccountsList` in ./queries.ts filters server-side in PostgREST and
// cannot import this function. Its `status=active` / `status=inactive`
// branches implement exactly the predicate below. If you change the rule
// here, change it there too — `account-status.test.ts` documents the
// contract both sides owe.
// ============================================================

/** Is the workspace being used? Independent of whether it is banned. */
export type AccountActivity = 'active' | 'inactive';

export interface AccountActivityInput {
  /** `whatsapp_config.status` — null when no config row exists at all. */
  whatsappStatus: string | null | undefined;
  /** Messages in the trailing 30 days. */
  messages30d: number | null | undefined;
}

/**
 * True only for the literal 'connected' status.
 *
 * The deep-dive header used to test whether a `whatsapp_config` row
 * merely EXISTED, which reported "WA Connected" for a row that had since
 * disconnected — while the accounts list, reading the same column, said
 * "Disconnected". Every surface goes through this instead.
 */
export function isWhatsAppConnected(
  status: string | null | undefined
): boolean {
  return status === 'connected';
}

/**
 * Derive whether a workspace counts as active.
 *
 * Active = WhatsApp is connected, OR it sent/received a message in the
 * last 30 days. Anything else — including a freshly created workspace
 * that has not been set up yet — is inactive.
 *
 * Note this is deliberately NOT three-valued. The SQL view returns NULL
 * for `whatsapp_status` when there is no config row, and in Postgres
 * `NULL = 'connected' OR 0 > 0` evaluates to NULL rather than false; the
 * JS here treats a missing status as plainly "not connected", which is
 * what both the badge and the filter already assume.
 */
export function deriveAccountActivity(
  input: AccountActivityInput
): AccountActivity {
  if (isWhatsAppConnected(input.whatsappStatus)) return 'active';
  if ((input.messages30d ?? 0) > 0) return 'active';
  return 'inactive';
}

/** Badge text. Shared so the two surfaces cannot word it differently. */
export const ACCOUNT_ACTIVITY_LABEL: Record<AccountActivity, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

/**
 * Hover text spelling out WHY an account reads active or inactive.
 *
 * The word "Active" on its own is what caused the original confusion, so
 * every place that renders it also explains it.
 */
export function accountActivityTooltip(input: AccountActivityInput): string {
  const activity = deriveAccountActivity(input);
  const messages = input.messages30d ?? 0;

  if (activity === 'inactive') {
    return 'Inactive — no WhatsApp connection and no messages in the last 30 days. This is about usage, not access.';
  }

  const reasons: string[] = [];
  if (isWhatsAppConnected(input.whatsappStatus)) {
    reasons.push('WhatsApp is connected');
  }
  if (messages > 0) {
    reasons.push(
      `${messages} message${messages === 1 ? '' : 's'} in the last 30 days`
    );
  }
  return `Active — ${reasons.join(' and ')}. This is about usage, not access.`;
}
