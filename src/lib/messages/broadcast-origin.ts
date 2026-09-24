// ============================================================
// Where a bulk message came from.
//
// A template message in the Inbox could have been sent three ways, and
// until now they all rendered identically as a single "Template" badge:
//
//   * one-to-one   an agent picked a template in the thread
//   * broadcast    a campaign built in the dashboard wizard
//   * API campaign a run triggered from outside (the Sheets add-on, or a
//                  direct call to /api/v1/campaigns/{id}/send)
//
// Telling them apart matters because they answer different questions. A
// reply to a one-to-one send is a conversation; a reply to a 2,000-person
// broadcast is a support queue. And when a customer complains about a
// message they did not expect, the first thing to establish is whether a
// person sent it or a spreadsheet rule did.
//
// ─── The join, and why the name is snapshotted ────────────────────
//
// `messages.broadcast_id` is the only broadcast marker on a message row.
// Everything else has to be read off the parent `broadcasts` row:
//
//   api_campaign_name  non-NULL => this run belongs to an API campaign.
//                      Snapshotted at run creation (migration
//                      20260916100000) precisely so it survives the
//                      campaign being deleted.
//   api_campaign_id    only says whether the campaign still EXISTS. It is
//                      ON DELETE SET NULL, so it is useless as the
//                      discriminator — a deleted campaign's runs would
//                      silently start reporting themselves as ordinary
//                      broadcasts, which is the exact bug migration
//                      20260916100000 was written to stop.
//
// So `api_campaign_name` is the discriminator and `api_campaign_id` is
// ignored here on purpose.
// ============================================================

export type BroadcastOriginKind = 'api_campaign' | 'broadcast';

export interface BroadcastOrigin {
  kind: BroadcastOriginKind;
  /**
   * What to show the agent: the campaign name for an API run, the
   * broadcast's own name otherwise. Never empty — falls back rather than
   * rendering a blank badge.
   */
  label: string;
}

/** The columns this module needs from a `broadcasts` row. */
export interface BroadcastOriginRow {
  id: string;
  name?: string | null;
  api_campaign_name?: string | null;
  /**
   * Present only while the campaign still exists. Read as a FALLBACK
   * discriminator, never as the primary one.
   *
   * Both are needed because each can be missing on its own:
   *
   *   name set, id null    campaign was deleted (the normal steady state)
   *   id set, name null    run created after migration 20260916100000 added
   *                        the column but before the app code that fills it
   *                        was deployed. Four such rows existed in
   *                        production; reading only the name classified them
   *                        as ordinary broadcasts, so one campaign appeared
   *                        in the Inbox filter twice — once as "api camping"
   *                        and once as "api camping (google_sheets)".
   *
   * The data has since been backfilled, but the code must not depend on that
   * having happened — a self-hosted instance can be at any migration point.
   */
  api_campaign_id?: string | null;
}

/**
 * Strip the generated `" (google_sheets)"` / `" (api)"` suffix off a run name.
 *
 * Deliberately narrow, matching the migrations: only those two literal kinds,
 * only at the end. A person is entitled to name a real broadcast
 * "Autumn sale (final)" and that must not be mistaken for a campaign run.
 */
function stripRunSuffix(name: string): string {
  const stripped = name.replace(/\s*\((?:google_sheets|api)\)$/, '');
  return stripped.trim() === '' ? name : stripped;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Classify one `broadcasts` row.
 *
 * Whitespace-only names are treated as absent. The run name for an API
 * campaign is machine-generated as `"<campaign> (google_sheets)"`, so when
 * a campaign name is available it is preferred over that — the suffix is
 * noise to an agent, and the campaign name is the thing they recognise.
 */
export function resolveBroadcastOrigin(
  row: BroadcastOriginRow
): BroadcastOrigin {
  const campaignName = clean(row.api_campaign_name);

  if (campaignName) {
    // Already a campaign name, but strip the suffix defensively: a row whose
    // snapshot was taken from the RUN name rather than the campaign name
    // would otherwise group separately from its siblings.
    return { kind: 'api_campaign', label: stripRunSuffix(campaignName) };
  }

  // No snapshot, but the campaign link survives — still an API run. Derive
  // the display name from the generated run name so it groups with the runs
  // that do carry a snapshot.
  if (clean(row.api_campaign_id)) {
    const fromRunName = clean(row.name);
    return {
      kind: 'api_campaign',
      label: fromRunName ? stripRunSuffix(fromRunName) : 'API campaign',
    };
  }

  return {
    kind: 'broadcast',
    label: clean(row.name) ?? 'Untitled broadcast',
  };
}

/** Index rows by `broadcasts.id`, ready for a per-message lookup. */
export function buildBroadcastOriginMap(
  rows: readonly BroadcastOriginRow[]
): Map<string, BroadcastOrigin> {
  const map = new Map<string, BroadcastOrigin>();
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(row.id, resolveBroadcastOrigin(row));
  }
  return map;
}

// ============================================================
// Grouping runs for the Inbox filter
// ============================================================

/**
 * One entry in the Inbox's broadcast filter dropdown.
 *
 * NOT one per `broadcasts` row. Every run of an API campaign inserts a
 * fresh `broadcasts` row, so a Sheets rule that has fired 13 times used to
 * produce 13 dropdown entries all reading "api camping (google_sheets)" —
 * indistinguishable from each other and impossible to filter with. An
 * entry is therefore one CAMPAIGN (all of its runs together) or one
 * ordinary broadcast.
 */
export interface BroadcastFilterOption {
  /** Stable identity for React and for the selected-value comparison. */
  key: string;
  label: string;
  kind: BroadcastOriginKind;
  /** Every `broadcasts.id` this entry covers. */
  broadcastIds: string[];
  /** Runs grouped under this entry. Always 1 for an ordinary broadcast. */
  runCount: number;
  /** Newest run, for ordering. Epoch ms. */
  latestAt: number;
}

/**
 * Collapse `broadcasts` rows into filter entries, newest first.
 *
 * API campaigns group on the campaign NAME rather than on
 * `api_campaign_id`, because the id goes NULL when a campaign is deleted
 * and grouping on it would scatter that campaign's history back into
 * individual rows — reintroducing the duplicate-label problem for exactly
 * the accounts most likely to hit it. `api_campaigns` has a unique
 * constraint on `(account_id, name)`, so within one account the name is a
 * safe key.
 *
 * A consequence worth stating: delete a campaign, then create a new one
 * with the same name, and their runs group together. That is the intended
 * reading — someone filtering by "api camping" wants everything ever sent
 * under that name.
 */
export function buildBroadcastFilterOptions(
  rows: readonly (BroadcastOriginRow & { created_at?: string | null })[]
): BroadcastFilterOption[] {
  const groups = new Map<string, BroadcastFilterOption>();

  for (const row of rows) {
    if (!row?.id) continue;

    const origin = resolveBroadcastOrigin(row);
    const key =
      origin.kind === 'api_campaign'
        ? `campaign:${origin.label}`
        : `broadcast:${row.id}`;

    const createdAt = row.created_at ? Date.parse(row.created_at) : NaN;
    const at = Number.isNaN(createdAt) ? 0 : createdAt;

    const existing = groups.get(key);
    if (existing) {
      existing.broadcastIds.push(row.id);
      existing.runCount += 1;
      if (at > existing.latestAt) existing.latestAt = at;
      continue;
    }

    groups.set(key, {
      key,
      label: origin.label,
      kind: origin.kind,
      broadcastIds: [row.id],
      runCount: 1,
      latestAt: at,
    });
  }

  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt);
}

// ============================================================
// The two-level Inbox filter
// ============================================================

/**
 * First level: which KIND of campaign.
 *
 * A single flat list of every campaign was the wrong shape. The two kinds are
 * operationally different — one is something a person built and sent, the
 * other fires on its own from a spreadsheet rule — and an account with a few
 * dozen of each cannot find either in one long list. So kind narrows first,
 * then a specific campaign within it.
 */
export type CampaignKindFilter = 'all' | 'broadcast' | 'api';

/** Entries of the requested kind, preserving newest-first order. */
export function filterOptionsByKind(
  options: readonly BroadcastFilterOption[],
  kind: CampaignKindFilter
): BroadcastFilterOption[] {
  if (kind === 'all') return [...options];
  const want: BroadcastOriginKind =
    kind === 'api' ? 'api_campaign' : 'broadcast';
  return options.filter((o) => o.kind === want);
}

/** Every `broadcasts.id` covered by these entries, de-duplicated. */
export function collectBroadcastIds(
  options: readonly BroadcastFilterOption[]
): string[] {
  const ids = new Set<string>();
  for (const option of options) {
    for (const id of option.broadcastIds) ids.add(id);
  }
  return [...ids];
}

/**
 * Which broadcast ids the current filter selection covers.
 *
 * `null` means "no id constraint" — show every thread any campaign reached.
 * That is distinct from `[]`, which means the selection is real but matches
 * nothing, and must therefore show an empty list rather than everything. The
 * two collapsing into one another is how a filter ends up silently ignoring
 * itself.
 */
export function resolveSelectedBroadcastIds(args: {
  options: readonly BroadcastFilterOption[];
  kind: CampaignKindFilter;
  /** null = every campaign of the selected kind. */
  selectedKey: string | null;
}): string[] | null {
  const { options, kind, selectedKey } = args;

  if (selectedKey) {
    const match = options.find((o) => o.key === selectedKey);
    // A selection that no longer resolves (campaign deleted mid-session)
    // falls back to the kind rather than to an empty list, so the view
    // degrades to something meaningful instead of looking broken.
    if (match) return [...match.broadcastIds];
  }

  if (kind === 'all') return null;

  return collectBroadcastIds(filterOptionsByKind(options, kind));
}
