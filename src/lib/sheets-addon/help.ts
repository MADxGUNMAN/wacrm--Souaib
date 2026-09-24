// ============================================================
// Google Sheets add-on — Help & Support content.
//
// Shared between the public endpoint the add-on reads and the
// super-admin endpoints that edit it, so the two can never disagree
// about which fields exist or what counts as valid.
//
// The add-on ships no fallback copy: whatever `loadHelpContent`
// returns IS the dialog. Two consequences shape this file.
//
//   1. The reader decides, not the dialog. Links arrive already
//      filtered and split by section, because the Apps Script side
//      should render a list, not re-implement business rules.
//   2. A blank URL is treated as unconfigured and dropped. Otherwise
//      an operator who enables a row before filling it in ships a
//      button that looks live and goes nowhere — the exact failure a
//      support dialog cannot afford.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// Generic "bad input, here's the field" error carrying status 400.
// It lives under subscription/ for historical reasons but is
// domain-neutral, and every super-admin route already knows how to map
// it — duplicating the class would be worse than the odd import path.
import { ValidationError } from '@/lib/subscription/validation';
import type {
  SheetsAddonHelpContent,
  SheetsAddonHelpIcon,
  SheetsAddonHelpLink,
  SheetsAddonHelpSection,
  SheetsAddonHelpSettings,
  SheetsAddonReportStatus,
} from '@/types/super-admin';

export const HELP_SETTINGS_TABLE = 'sheets_addon_help_settings';
export const HELP_LINKS_TABLE = 'sheets_addon_help_links';
export const ISSUE_REPORTS_TABLE = 'sheets_addon_issue_reports';

/**
 * Hard ceiling on a report body.
 *
 * The endpoint is unauthenticated, so this is an abuse control as much
 * as a data-hygiene one. Generous enough for someone to paste an error
 * message and describe what they were doing.
 */
export const REPORT_MESSAGE_MAX = 4000;

/** Reports accepted from one IP per hour before we start refusing. */
export const REPORT_RATE_LIMIT_PER_HOUR = 5;

/** Mirrors the DB CHECK on sheets_addon_help_links.section. */
export const HELP_SECTIONS: readonly SheetsAddonHelpSection[] = [
  'support',
  'resources',
] as const;

/**
 * Mirrors the DB CHECK on sheets_addon_help_links.icon.
 *
 * Closed set because the Apps Script dialog inlines its SVGs and has no
 * icon library: an unrecognised name renders as nothing at all, which
 * looks like a broken button rather than a missing icon.
 */
export const HELP_ICONS: readonly SheetsAddonHelpIcon[] = [
  'whatsapp',
  'mail',
  'calendar',
  'book',
  'globe',
  'link',
] as const;

/**
 * Mirrors the DB CHECK on sheets_addon_issue_reports.status, and matches
 * contact_submissions' set exactly so both super-admin inboxes behave
 * the same way.
 */
export const REPORT_STATUSES: readonly SheetsAddonReportStatus[] = [
  'new',
  'read',
  'replied',
  'archived',
] as const;

/**
 * Statuses that count as "dealt with", for the resolved_at stamp.
 *
 * Maintained server-side on every transition so the timestamp can never
 * disagree with the status beside it.
 */
export const REPORT_CLOSING_STATUSES: readonly SheetsAddonReportStatus[] = [
  'replied',
  'archived',
] as const;

export const ISSUE_REPLIES_TABLE = 'sheets_addon_issue_replies';

/**
 * Every editable text field on the singleton.
 *
 * Used as an explicit whitelist on PUT. The existing cms/settings route
 * spreads the request body straight into the row; that is a pattern
 * worth not copying, because it lets any caller write any column that
 * happens to exist — including ones a future migration adds.
 */
export const HELP_TEXT_FIELDS = [
  'dialog_title',
  'dialog_subtitle',
  'support_heading',
  'resources_heading',
  'maintenance_heading',
  'maintenance_description',
  'reinstall_label',
  'reinstall_description',
  'disconnect_label',
  'disconnect_description',
  'reset_heading',
  'reset_description',
  'reset_button_label',
  'reset_confirm_label',
  'report_heading',
  'report_intro',
  'report_placeholder',
  'report_button_label',
  'report_success_message',
  'footer_text',
  'footer_url',
] as const satisfies readonly (keyof SheetsAddonHelpSettings)[];

export const HELP_BOOLEAN_FIELDS = [
  'is_report_enabled',
  'is_reset_enabled',
] as const satisfies readonly (keyof SheetsAddonHelpSettings)[];

/**
 * Longest any single piece of dialog copy may be.
 *
 * The dialog is a 480px-wide modal. A 5000-character "heading" would
 * not be rejected by the database but would destroy the layout, and the
 * operator would have no idea why.
 */
const MAX_COPY_LENGTH = 2000;
const MAX_LABEL_LENGTH = 200;
const MAX_URL_LENGTH = 2000;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Accept only schemes that make sense for a button in a Sheets dialog.
 *
 * `javascript:` and `data:` are the reason this is an allowlist and not
 * a "does it parse" check — the URL goes into an `href` inside an
 * HtmlService iframe.
 */
function assertSafeUrl(value: string, field: string): string {
  if (!value) return '';
  if (value.length > MAX_URL_LENGTH) {
    throw new ValidationError('That URL is too long', field);
  }
  if (value.startsWith('mailto:')) {
    const address = value.slice('mailto:'.length).trim();
    if (!address || !address.includes('@')) {
      throw new ValidationError(
        'A mailto: link needs an email address after the colon',
        field
      );
    }
    return value;
  }
  if (value.startsWith('https://')) {
    try {
      new URL(value);
    } catch {
      throw new ValidationError('That is not a valid URL', field);
    }
    return value;
  }
  throw new ValidationError(
    'Use an https:// or mailto: link. Other schemes are not allowed in the add-on dialog.',
    field
  );
}

/**
 * Build a whitelisted patch for the singleton from a request body.
 *
 * Only keys actually present in the body are written, so the settings
 * page can PATCH a subset without blanking everything else.
 */
export function buildHelpSettingsPatch(
  body: unknown
): Record<string, string | boolean> {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Expected a JSON object');
  }
  const source = body as Record<string, unknown>;
  const patch: Record<string, string | boolean> = {};

  for (const field of HELP_TEXT_FIELDS) {
    if (!(field in source)) continue;
    const value = asTrimmedString(source[field]);
    if (value.length > MAX_COPY_LENGTH) {
      throw new ValidationError(
        `That text is too long for the dialog (max ${MAX_COPY_LENGTH} characters)`,
        field
      );
    }
    patch[field] = field === 'footer_url' ? assertSafeUrl(value, field) : value;
  }

  for (const field of HELP_BOOLEAN_FIELDS) {
    if (!(field in source)) continue;
    if (typeof source[field] !== 'boolean') {
      throw new ValidationError('Expected true or false', field);
    }
    patch[field] = source[field] as boolean;
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('Nothing to update');
  }

  return patch;
}

/** Validated, storage-ready help link. */
export interface HelpLinkPatch {
  section?: SheetsAddonHelpSection;
  label?: string;
  description?: string;
  url?: string;
  icon?: SheetsAddonHelpIcon;
  sort_order?: number;
  is_enabled?: boolean;
}

/**
 * Validate a link create or update.
 *
 * On create, `section` is required — there is no sensible default, and
 * guessing would silently file the row under the wrong heading.
 */
export function buildHelpLinkPatch(
  body: unknown,
  options: { isCreate: boolean }
): HelpLinkPatch {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Expected a JSON object');
  }
  const source = body as Record<string, unknown>;
  const patch: HelpLinkPatch = {};

  if (options.isCreate || 'section' in source) {
    const section = asTrimmedString(source.section);
    if (!HELP_SECTIONS.includes(section as SheetsAddonHelpSection)) {
      throw new ValidationError(
        `Section must be one of: ${HELP_SECTIONS.join(', ')}`,
        'section'
      );
    }
    patch.section = section as SheetsAddonHelpSection;
  }

  if ('label' in source) {
    const label = asTrimmedString(source.label);
    if (label.length > MAX_LABEL_LENGTH) {
      throw new ValidationError('That label is too long', 'label');
    }
    patch.label = label;
  }

  if ('description' in source) {
    const description = asTrimmedString(source.description);
    if (description.length > MAX_LABEL_LENGTH) {
      throw new ValidationError('That description is too long', 'description');
    }
    patch.description = description;
  }

  if ('url' in source) {
    patch.url = assertSafeUrl(asTrimmedString(source.url), 'url');
  }

  if ('icon' in source) {
    const icon = asTrimmedString(source.icon);
    if (!HELP_ICONS.includes(icon as SheetsAddonHelpIcon)) {
      throw new ValidationError(
        `Icon must be one of: ${HELP_ICONS.join(', ')}`,
        'icon'
      );
    }
    patch.icon = icon as SheetsAddonHelpIcon;
  }

  if ('sort_order' in source) {
    const order = Number(source.sort_order);
    if (!Number.isInteger(order) || order < 0 || order > 100000) {
      throw new ValidationError(
        'Sort order must be a whole number between 0 and 100000',
        'sort_order'
      );
    }
    patch.sort_order = order;
  }

  if ('is_enabled' in source) {
    if (typeof source.is_enabled !== 'boolean') {
      throw new ValidationError('Expected true or false', 'is_enabled');
    }
    patch.is_enabled = source.is_enabled;
  }

  if (!options.isCreate && Object.keys(patch).length === 0) {
    throw new ValidationError('Nothing to update');
  }

  return patch;
}

/**
 * Validate a submitted report body.
 *
 * Deliberately lenient about everything except the message: the client
 * is an Apps Script dialog whose metadata (spreadsheet name, version)
 * is best-effort, and losing a support report because a spreadsheet
 * title was missing would be the wrong trade.
 */
export function parseReportSubmission(body: unknown): {
  message: string;
  spreadsheetId: string | null;
  spreadsheetName: string | null;
  addonVersion: string | null;
  reporterEmail: string | null;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Expected a JSON object');
  }
  const source = body as Record<string, unknown>;

  const message = asTrimmedString(source.message);
  if (!message) {
    throw new ValidationError(
      'Describe the problem before submitting',
      'message'
    );
  }
  if (message.length > REPORT_MESSAGE_MAX) {
    throw new ValidationError(
      `Keep the report under ${REPORT_MESSAGE_MAX} characters`,
      'message'
    );
  }

  const optional = (key: string, max: number): string | null => {
    const value = asTrimmedString(source[key]);
    return value ? value.slice(0, max) : null;
  };

  return {
    message,
    spreadsheetId: optional('spreadsheetId', 200),
    spreadsheetName: optional('spreadsheetName', 300),
    addonVersion: optional('addonVersion', 50),
    reporterEmail: optional('reporterEmail', 320),
  };
}

/**
 * Read the dialog payload.
 *
 * One call, two queries, shaped for direct consumption by the add-on.
 * Returns null only when the singleton is genuinely absent, which the
 * migration seeds against — the caller treats that as a server fault
 * rather than substituting copy of its own.
 */
export async function loadHelpContent(
  admin: SupabaseClient
): Promise<SheetsAddonHelpContent | null> {
  const [settingsResult, linksResult] = await Promise.all([
    admin.from(HELP_SETTINGS_TABLE).select('*').limit(1).maybeSingle(),
    admin
      .from(HELP_LINKS_TABLE)
      .select('*')
      .eq('is_enabled', true)
      // A blank URL means the operator has not configured this row yet.
      // Dropping it here is what stops a live-looking dead button.
      .neq('url', '')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (settingsResult.error) {
    throw new Error(
      `could not read add-on help settings: ${settingsResult.error.message}`
    );
  }
  if (linksResult.error) {
    throw new Error(
      `could not read add-on help links: ${linksResult.error.message}`
    );
  }
  if (!settingsResult.data) return null;

  const links = (linksResult.data ?? []) as SheetsAddonHelpLink[];

  return {
    settings: settingsResult.data as SheetsAddonHelpSettings,
    support: links.filter((link) => link.section === 'support'),
    resources: links.filter((link) => link.section === 'resources'),
  };
}
