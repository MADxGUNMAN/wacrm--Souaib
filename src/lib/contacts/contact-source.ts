/**
 * Where a contact came from — display config and the tolerant lookup.
 *
 * One source of truth, for the same reason `broadcast-status.ts` exists:
 * this is rendered in the contacts table, the contact detail sheet and the
 * inbox sidebar, and three inline copies of a colour map is how they drift.
 *
 * `label` values are i18n KEYS under the `Contacts.sources` namespace, not
 * finished strings — pass them through `useTranslations('Contacts.sources')`.
 */

/**
 * Must stay in lockstep with the CHECK constraint on `contacts.source`
 * (migration 20260916120000_contact_source.sql). `contact-source.test.ts`
 * asserts that, because the failure is silent: add a value to the database
 * and forget it here and every such contact quietly renders as "Unknown".
 */
export type ContactSource =
  | 'manual'
  | 'import'
  | 'whatsapp'
  | 'api'
  | 'campaign'
  | 'phone_sync'
  | 'unknown';

export interface ContactSourceDisplay {
  /** i18n key under `Contacts.sources`. */
  label: string;
  /** Badge classes, matching the shape used by `broadcast-status.ts`. */
  classes: string;
  /**
   * i18n key for the one-line explanation shown on hover and in the filter
   * menu. "API" and "Campaign" are indistinguishable to anyone who did not
   * build this, and the difference decides whether you go looking in your
   * own integration or in a campaign.
   */
  hint: string;
}

export const contactSourceConfig: Record<ContactSource, ContactSourceDisplay> =
  {
    manual: {
      label: 'manual',
      hint: 'manualHint',
      classes: 'bg-slate-500/10 text-muted-foreground border-slate-500/20',
    },
    whatsapp: {
      label: 'whatsapp',
      hint: 'whatsappHint',
      classes: 'bg-primary/10 text-primary border-primary/20',
    },
    import: {
      label: 'import',
      hint: 'importHint',
      classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    campaign: {
      label: 'campaign',
      hint: 'campaignHint',
      classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    },
    api: {
      label: 'api',
      hint: 'apiHint',
      classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    },
    phone_sync: {
      label: 'phoneSync',
      hint: 'phoneSyncHint',
      classes: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    },
    // Deliberately the flattest of the set. It is the most common value on
    // any account that predates this column, and dressing "we don't know"
    // in a colour would give it more weight than the values that mean
    // something.
    unknown: {
      label: 'unknown',
      hint: 'unknownHint',
      classes: 'bg-transparent text-muted-foreground/70 border-border',
    },
  };

/**
 * Display order for the filter menu — roughly most to least common in
 * normal use, with `unknown` last because it is a gap rather than a
 * category.
 */
export const CONTACT_SOURCES: readonly ContactSource[] = [
  'manual',
  'whatsapp',
  'import',
  'campaign',
  'api',
  'phone_sync',
  'unknown',
];

/**
 * Tolerant lookup. Falls back to `unknown` rather than throwing so a value
 * written by a newer deploy (or by hand in SQL) can never blank the
 * contacts table for everyone on the older one.
 */
export function getContactSource(
  source: string | null | undefined
): ContactSourceDisplay {
  if (!source) return contactSourceConfig.unknown;
  return (
    contactSourceConfig[source as ContactSource] ?? contactSourceConfig.unknown
  );
}
