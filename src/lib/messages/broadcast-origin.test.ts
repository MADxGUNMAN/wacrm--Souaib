import { describe, expect, it } from 'vitest';

import {
  buildBroadcastFilterOptions,
  buildBroadcastOriginMap,
  collectBroadcastIds,
  filterOptionsByKind,
  resolveBroadcastOrigin,
  resolveSelectedBroadcastIds,
} from './broadcast-origin';

describe('resolveBroadcastOrigin', () => {
  it('classifies a run with a campaign name as an API campaign', () => {
    expect(
      resolveBroadcastOrigin({
        id: 'b1',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
      })
    ).toEqual({ kind: 'api_campaign', label: 'api camping' });
  });

  it('prefers the campaign name over the generated run name', () => {
    // The run name carries a '(google_sheets)' suffix that is noise to an
    // agent; the campaign name is the thing they recognise.
    const origin = resolveBroadcastOrigin({
      id: 'b1',
      name: 'api camping (google_sheets)',
      api_campaign_name: 'api camping',
    });
    expect(origin.label).toBe('api camping');
  });

  it('classifies a dashboard broadcast as a broadcast', () => {
    expect(resolveBroadcastOrigin({ id: 'b2', name: 'test1121' })).toEqual({
      kind: 'broadcast',
      label: 'test1121',
    });
  });

  /**
   * `api_campaign_id` is ON DELETE SET NULL, so it cannot be the
   * discriminator — a deleted campaign's runs would silently start
   * reporting as ordinary broadcasts. That is the exact bug migration
   * 20260916100000 exists to prevent, so it is guarded here.
   */
  it('reports an API campaign from the id alone when the snapshot is missing', () => {
    // The real production state for four rows: campaign link intact, name
    // never snapshotted. The suffix is stripped off the run name so this
    // groups with siblings that DO carry a snapshot.
    expect(
      resolveBroadcastOrigin({
        id: 'r1',
        name: 'api camping (google_sheets)',
        api_campaign_id: 'camp-1',
        api_campaign_name: null,
      })
    ).toEqual({ kind: 'api_campaign', label: 'api camping' });
  });

  it('does not strip a suffix that only looks generated', () => {
    // A person may legitimately name a broadcast this way.
    expect(
      resolveBroadcastOrigin({ id: 'b1', name: 'Autumn sale (final)' })
    ).toEqual({ kind: 'broadcast', label: 'Autumn sale (final)' });
  });

  it('falls back to a generic label when an API run has no usable name', () => {
    expect(
      resolveBroadcastOrigin({
        id: 'r1',
        name: null,
        api_campaign_id: 'camp-1',
      })
    ).toEqual({ kind: 'api_campaign', label: 'API campaign' });
  });

  it('still reports an API campaign after the campaign was deleted', () => {
    expect(
      resolveBroadcastOrigin({
        id: 'b3',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        // api_campaign_id absent entirely — campaign row is gone
      }).kind
    ).toBe('api_campaign');
  });

  it('treats a whitespace-only campaign name as absent', () => {
    expect(
      resolveBroadcastOrigin({
        id: 'b4',
        name: 'Autumn sale',
        api_campaign_name: '   ',
      })
    ).toEqual({ kind: 'broadcast', label: 'Autumn sale' });
  });

  it('never renders a blank label', () => {
    expect(resolveBroadcastOrigin({ id: 'b5', name: '  ' }).label).toBe(
      'Untitled broadcast'
    );
    expect(resolveBroadcastOrigin({ id: 'b6', name: null }).label).toBe(
      'Untitled broadcast'
    );
  });
});

describe('buildBroadcastOriginMap', () => {
  it('indexes by broadcast id', () => {
    const map = buildBroadcastOriginMap([
      { id: 'b1', name: 'run', api_campaign_name: 'camp' },
      { id: 'b2', name: 'test1121' },
    ]);
    expect(map.get('b1')?.kind).toBe('api_campaign');
    expect(map.get('b2')?.kind).toBe('broadcast');
    expect(map.size).toBe(2);
  });

  it('skips rows with no id rather than throwing', () => {
    const map = buildBroadcastOriginMap([
      { id: '', name: 'x' },
      { id: 'b1', name: 'ok' },
    ]);
    expect(map.size).toBe(1);
  });
});

describe('buildBroadcastFilterOptions', () => {
  /**
   * THE BUG. Thirteen runs of one Sheets campaign produced thirteen
   * dropdown entries, every one reading "api camping (google_sheets)" —
   * visually identical, and each filtering to a single send.
   */
  it('collapses many runs of one campaign into a single entry', () => {
    const options = buildBroadcastFilterOptions([
      {
        id: 'r1',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        created_at: '2026-09-17T10:00:00Z',
      },
      {
        id: 'r2',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        created_at: '2026-09-17T11:00:00Z',
      },
      {
        id: 'r3',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        created_at: '2026-09-17T12:00:00Z',
      },
    ]);

    expect(options).toHaveLength(1);
    expect(options[0].label).toBe('api camping');
    expect(options[0].kind).toBe('api_campaign');
    expect(options[0].runCount).toBe(3);
    expect(options[0].broadcastIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('keeps ordinary broadcasts as separate entries', () => {
    const options = buildBroadcastFilterOptions([
      { id: 'b1', name: 'test1121', created_at: '2026-09-17T10:00:00Z' },
      { id: 'b2', name: 'test1121', created_at: '2026-09-17T11:00:00Z' },
    ]);
    // Same name, but two genuinely different sends — must not merge.
    expect(options).toHaveLength(2);
    expect(options.every((o) => o.runCount === 1)).toBe(true);
  });

  it('orders newest first by the latest run in each group', () => {
    const options = buildBroadcastFilterOptions([
      {
        id: 'r1',
        name: 'old campaign',
        api_campaign_name: 'old campaign',
        created_at: '2026-09-01T10:00:00Z',
      },
      { id: 'b1', name: 'a broadcast', created_at: '2026-09-10T10:00:00Z' },
      {
        id: 'r2',
        name: 'old campaign',
        api_campaign_name: 'old campaign',
        created_at: '2026-09-16T10:00:00Z',
      },
    ]);
    // 'old campaign' wins because its NEWEST run (16th) beats the broadcast
    // on the 10th, even though its first run is the oldest row of all.
    expect(options.map((o) => o.label)).toEqual([
      'old campaign',
      'a broadcast',
    ]);
  });

  it('groups a campaign together across a delete and recreate', () => {
    const options = buildBroadcastFilterOptions([
      // orphaned run: campaign was deleted, name survived
      {
        id: 'r1',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        created_at: '2026-09-10T10:00:00Z',
      },
      // run from the recreated campaign of the same name
      {
        id: 'r2',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        created_at: '2026-09-17T10:00:00Z',
      },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0].runCount).toBe(2);
  });

  it('mixes campaigns and broadcasts in one list', () => {
    const options = buildBroadcastFilterOptions([
      {
        id: 'r1',
        name: 'api camping (google_sheets)',
        api_campaign_name: 'api camping',
        created_at: '2026-09-17T12:00:00Z',
      },
      { id: 'b1', name: 'test1121', created_at: '2026-09-17T13:00:00Z' },
    ]);
    expect(options.map((o) => o.kind)).toEqual(['broadcast', 'api_campaign']);
  });

  it('tolerates a missing or unparseable created_at', () => {
    const options = buildBroadcastFilterOptions([
      { id: 'b1', name: 'no date' },
      { id: 'b2', name: 'bad date', created_at: 'not-a-date' },
      { id: 'b3', name: 'dated', created_at: '2026-09-17T10:00:00Z' },
    ]);
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('dated');
  });

  it('returns an empty list for no rows', () => {
    expect(buildBroadcastFilterOptions([])).toEqual([]);
  });

  /**
   * THE PRODUCTION BUG. Four rows carried a live `api_campaign_id` with a
   * NULL `api_campaign_name` — created after migration 20260916100000 added
   * the column but before the code that fills it was deployed. Classifying
   * on the name alone made them ordinary broadcasts, so one campaign showed
   * up in the filter twice: "api camping" and "api camping (google_sheets)".
   */
  it('groups snapshot-less runs with their snapshotted siblings', () => {
    const options = buildBroadcastFilterOptions([
      {
        id: 'r1',
        name: 'api camping (google_sheets)',
        api_campaign_id: 'camp-1',
        api_campaign_name: null,
        created_at: '2026-09-16T12:46:00Z',
      },
      {
        id: 'r2',
        name: 'api camping (google_sheets)',
        api_campaign_id: 'camp-1',
        api_campaign_name: 'api camping',
        created_at: '2026-09-17T08:14:00Z',
      },
    ]);

    expect(options).toHaveLength(1);
    expect(options[0].label).toBe('api camping');
    expect(options[0].kind).toBe('api_campaign');
    expect(options[0].runCount).toBe(2);
  });
});

describe('filterOptionsByKind', () => {
  const options = buildBroadcastFilterOptions([
    {
      id: 'r1',
      name: 'api camping (google_sheets)',
      api_campaign_name: 'api camping',
      created_at: '2026-09-17T12:00:00Z',
    },
    {
      id: 'b1',
      name: 'Wellcome Schedule test',
      created_at: '2026-09-11T12:23:00Z',
    },
    { id: 'b2', name: 'test1121', created_at: '2026-09-17T07:44:00Z' },
  ]);

  it('returns everything for all', () => {
    expect(filterOptionsByKind(options, 'all')).toHaveLength(3);
  });

  it('returns only API campaigns', () => {
    const api = filterOptionsByKind(options, 'api');
    expect(api.map((o) => o.label)).toEqual(['api camping']);
  });

  it('returns only dashboard broadcasts', () => {
    const broadcast = filterOptionsByKind(options, 'broadcast');
    expect(broadcast.map((o) => o.label)).toEqual([
      'test1121',
      'Wellcome Schedule test',
    ]);
  });

  it('does not mutate the input', () => {
    const before = options.length;
    filterOptionsByKind(options, 'api');
    expect(options).toHaveLength(before);
  });
});

describe('resolveSelectedBroadcastIds', () => {
  const options = buildBroadcastFilterOptions([
    {
      id: 'r1',
      name: 'api camping (google_sheets)',
      api_campaign_name: 'api camping',
      created_at: '2026-09-17T12:00:00Z',
    },
    {
      id: 'r2',
      name: 'api camping (google_sheets)',
      api_campaign_name: 'api camping',
      created_at: '2026-09-17T13:00:00Z',
    },
    {
      id: 'b1',
      name: 'Wellcome Schedule test',
      created_at: '2026-09-11T12:23:00Z',
    },
    { id: 'b2', name: 'test1121', created_at: '2026-09-17T07:44:00Z' },
  ]);

  /**
   * null means "no constraint", and must stay distinct from an empty array,
   * which means "a real selection that matches nothing". Collapsing them is
   * how a filter silently ignores itself and shows everything.
   */
  it('returns null for all campaigns with nothing specific picked', () => {
    expect(
      resolveSelectedBroadcastIds({ options, kind: 'all', selectedKey: null })
    ).toBeNull();
  });

  it('returns every run of every API campaign for kind api', () => {
    const ids = resolveSelectedBroadcastIds({
      options,
      kind: 'api',
      selectedKey: null,
    });
    expect(ids?.sort()).toEqual(['r1', 'r2']);
  });

  it('returns every dashboard broadcast for kind broadcast', () => {
    const ids = resolveSelectedBroadcastIds({
      options,
      kind: 'broadcast',
      selectedKey: null,
    });
    expect(ids?.sort()).toEqual(['b1', 'b2']);
  });

  it('narrows to one specific broadcast', () => {
    const ids = resolveSelectedBroadcastIds({
      options,
      kind: 'broadcast',
      selectedKey: 'broadcast:b1',
    });
    expect(ids).toEqual(['b1']);
  });

  it('narrows to one campaign and covers all of its runs', () => {
    const ids = resolveSelectedBroadcastIds({
      options,
      kind: 'api',
      selectedKey: 'campaign:api camping',
    });
    expect(ids?.sort()).toEqual(['r1', 'r2']);
  });

  it('falls back to the kind when the selection no longer resolves', () => {
    // Campaign deleted mid-session. Degrading to the kind beats an empty
    // list, which would read as "this campaign reached nobody".
    const ids = resolveSelectedBroadcastIds({
      options,
      kind: 'broadcast',
      selectedKey: 'campaign:deleted thing',
    });
    expect(ids?.sort()).toEqual(['b1', 'b2']);
  });

  it('returns an empty array, not null, for a kind with no campaigns', () => {
    const ids = resolveSelectedBroadcastIds({
      options: filterOptionsByKind(options, 'api'),
      kind: 'broadcast',
      selectedKey: null,
    });
    expect(ids).toEqual([]);
  });
});

describe('collectBroadcastIds', () => {
  it('de-duplicates across entries', () => {
    expect(
      collectBroadcastIds([
        {
          key: 'a',
          label: 'a',
          kind: 'broadcast',
          broadcastIds: ['x', 'y'],
          runCount: 2,
          latestAt: 0,
        },
        {
          key: 'b',
          label: 'b',
          kind: 'broadcast',
          broadcastIds: ['y', 'z'],
          runCount: 2,
          latestAt: 0,
        },
      ]).sort()
    ).toEqual(['x', 'y', 'z']);
  });
});
