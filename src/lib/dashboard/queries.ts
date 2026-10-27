import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
  type DayOpts,
} from './date-utils'
import type {
  ActivityItem,
  ActivityPage,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
} from './types'

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user automatically, so we never pass user_id explicitly
// here. Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate the
// heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient

// Every loader takes optional DayOpts. The dashboard (browser) passes none
// and gets the user's local day; the AI connector (server) passes the
// workspace's timezone so both agree on what "today" means.

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB, opts: DayOpts = {}): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay(opts.now ?? new Date(), opts.timeZone).toISOString()
  const yesterdayStart = daysAgoStart(1, opts).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('deals').select('value, status').eq('status', 'open'),
    // "Messages Sent Today" counts what a HUMAN sent: from this CRM
    // ('agent') or from the WhatsApp Business App on their phone
    // ('business_app', Coexistence). A phone-typed message is still a
    // message the business sent today, and on a coexistence number the
    // phone may well be the busier channel — counting only 'agent' would
    // show a fraction of the real number.
    //
    // 'bot' stays excluded, as it always has been: automations and AI
    // replies are volume the business did not personally send, and this
    // KPI sits beside human-activity metrics. That asymmetry is
    // deliberate, not an oversight.
    //
    // No existing account is affected — only coexistence numbers ever
    // produce a 'business_app' row.
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('sender_type', ['agent', 'business_app'])
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('sender_type', ['agent', 'business_app'])
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
  ])

  const openDealsRows = (openDeals.data ?? []) as { value: number | null }[]
  const openDealsValue = openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    openDealsValue,
    openDealsCount: openDealsRows.length,
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
  opts: DayOpts = {},
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1, opts).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays, opts)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at, opts.timeZone)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    // Everything that is not the customer is outgoing — agent, bot, and
    // 'business_app' (typed on a phone under Coexistence). Written as an
    // else rather than a list of values on purpose: it stayed correct
    // when the fourth sender type was added.
    else bucket.outgoing += 1
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  const [stagesRes, dealsRes] = await Promise.all([
    db.from('pipeline_stages').select('id, name, color, pipeline_id, position').order('position'),
    db.from('deals').select('stage_id, value, status').eq('status', 'open'),
  ])

  const stages =
    (stagesRes.data ?? []) as { id: string; name: string; color: string }[]
  const deals = (dealsRes.data ?? []) as { stage_id: string; value: number | null }[]

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    // Hide empty stages from the ring (but we'd still show them in the
    // legend if the user wanted a full breakdown — trimming keeps the
    // visual clean for the common case).
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB, opts: DayOpts = {}): Promise<ResponseTimeSummary> {
  // Pull the last 14 days of messages in one shot, then walk per
  // conversation to find each "first inbound" → "first subsequent
  // outbound" pair. 14 days gives us both "this week" + "last week"
  // with enough overlap if the user opens the dashboard late on a
  // Monday.
  const fourteenDaysAgo = daysAgoStart(13, opts).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  // Group per conversation, pair unreplied customer messages with the
  // next outbound message from the agent/bot. A single customer message
  // can only count once (avoids inflating averages if the customer
  // double-messages while the agent takes time to reply).
  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = opts.now ?? new Date()
  const tz = opts.timeZone
  const thisWeekStart = daysAgoStart(mondayIndex(now, tz), opts)
  const lastWeekStart = daysAgoStart(mondayIndex(now, tz) + 7, opts)

  // Per-day-of-week buckets, averaged over both weeks' worth of data
  // so each bar has more samples to stand on. If a day has no samples
  // its avgMinutes stays null and the chart renders the bar muted.
  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt, tz)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  // Silence unused-label warnings — keep the arrays explicitly named
  // for readability above.
  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

/** Largest page the feed will ever ask for. Bounds every source query. */
export const ACTIVITY_MAX_PAGE_SIZE = 50

/**
 * One page of the activity feed, newest first.
 *
 * Keyset (cursor) pagination over five sources. Each source is asked
 * for at most `pageSize + 1` rows strictly older than `before`, so the
 * merged, sorted result always contains the true newest `pageSize`
 * events across all sources, plus one extra row that tells us whether
 * an older page exists. Nothing is ever read in bulk: a page costs at
 * most 5 x (pageSize + 1) rows however much history the account has,
 * and no COUNT(*) is run over the large tables.
 *
 * `nextCursor` is the timestamp of the last row shown. Two events with
 * the exact same microsecond timestamp straddling a page boundary could
 * be skipped; with Postgres microsecond timestamps that is negligible.
 */
export async function loadActivityPage(
  db: DB,
  opts: { pageSize?: number; before?: string | null } = {}
): Promise<ActivityPage> {
  const pageSize = Math.min(
    ACTIVITY_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(opts.pageSize ?? 10))
  )
  const before = opts.before ?? null
  const items = await fetchActivitySources(db, pageSize + 1, before)
  const page = items.slice(0, pageSize)
  const hasMore = items.length > pageSize
  return {
    items: page,
    hasMore,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].at : null,
  }
}

/** Kept for existing callers: the newest `limit` events. */
export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  return (await loadActivityPage(db, { pageSize: limit })).items
}

async function fetchActivitySources(
  db: DB,
  perSource: number,
  before: string | null
): Promise<ActivityItem[]> {
  const older = <Q extends { lt: (col: string, v: string) => Q }>(
    q: Q,
    col: string
  ): Q => (before ? q.lt(col, before) : q)

  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    older(
      db
        .from('messages')
        // Name the FK: conversations.pinned_message_id also links the
        // two tables, so a bare `conversations(...)` is ambiguous and
        // PostgREST refuses it (PGRST201).
        .select('id, content_text, sender_type, created_at, conversation_id, conversations!messages_conversation_id_fkey(contact_id, contacts(name, phone))')
        .eq('sender_type', 'customer'),
      'created_at'
    )
      .order('created_at', { ascending: false })
      .limit(perSource),
    older(db.from('contacts').select('id, name, phone, created_at'), 'created_at')
      .order('created_at', { ascending: false })
      .limit(perSource),
    older(
      db.from('deals').select('id, title, updated_at, stage:pipeline_stages(name)'),
      'updated_at'
    )
      .order('updated_at', { ascending: false })
      .limit(perSource),
    older(
      db.from('broadcasts').select('id, name, status, total_recipients, created_at'),
      'created_at'
    )
      .order('created_at', { ascending: false })
      .limit(perSource),
    older(
      db
        .from('automation_logs')
        .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)'),
      'created_at'
    )
      .order('created_at', { ascending: false })
      .limit(perSource),
  ])

  // A failed source must not look like "no activity": surface it so the
  // feed shows an error instead of silently dropping that source.
  const failed = [msgs, contacts, deals, broadcasts, autoLogs].find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  const items: ActivityItem[] = []

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Unknown'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `New message from ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `New contact: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Deal "${d.title}" in ${stage.name}`
        : `Deal "${d.title}" updated`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `sent to ${b.total_recipients} contacts`
        : `${b.status} (${b.total_recipients} recipients)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Broadcast "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'a contact'
    const autoName = automation?.name || 'Automation'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automation "${autoName}" ${l.status === 'failed' ? 'failed for' : 'triggered for'} ${who}`,
      at: l.created_at,
    })
  }

  // Sort by real instants, not strings: sources can format offsets
  // differently, and a lexical compare would then misorder them.
  return items.sort((a, b) => {
    const d = Date.parse(b.at) - Date.parse(a.at)
    return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
