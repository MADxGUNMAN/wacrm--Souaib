// ============================================================
// Broadcast write services for the AI connector (Phase 7, 03 §4.6).
//
// A broadcast is always two-step (D9):
//   previewBroadcast — resolve the audience in this workspace, count
//                      opt-outs, validate the template; sends nothing.
//                      The tool stores the result as a confirmation.
//   sendBroadcast    — from that stored preview only: re-check the
//                      audience and template, reserve the daily
//                      recipient cap, persist a scheduled broadcast.
//                      The existing cron sweep delivers it, exactly
//                      like a broadcast scheduled in Replai.
// ============================================================

import { ServiceError, UUID_RE, type ServiceContext } from './context';
import { resolveTagIds } from './contact-writes';
import {
  prepareTemplateFill,
  reserveOrThrow,
  type TemplateFill,
} from './messaging';
import type { PrivilegedOps } from './privileged';
import { BroadcastError } from '@/lib/whatsapp/broadcast-core';
import {
  filterOptedOutPhones,
  isMarketingCategory,
} from '@/lib/whatsapp/marketing-opt-out';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

export const MAX_BROADCAST_AUDIENCE = 1000;
export const MAX_SCHEDULE_DAYS = 30;

export interface BroadcastInput extends TemplateFill {
  tagIds?: string[];
  contactIds?: string[];
  /** ISO time in the future; omitted = send on the next sweep. */
  scheduleAt?: string;
  name?: string;
}

/** What a confirmation stores, and all `sendBroadcast` acts on. */
export interface StoredBroadcastPreview {
  fill: TemplateFill;
  contact_ids: string[];
  schedule_at: string | null;
  name: string | null;
}

export interface BroadcastPreview {
  stored: StoredBroadcastPreview;
  audience: number;
  opted_out: number;
  will_send: number;
  template: { name: string; language: string; category: string };
  sample_text: string;
  schedule_at: string | null;
}

interface AudienceContact {
  id: string;
  phone: string;
}

async function contactsByIds(
  ctx: ServiceContext,
  ids: string[]
): Promise<AudienceContact[]> {
  const out: AudienceContact[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await ctx.db
      .from('contacts')
      .select('id, phone')
      .eq('account_id', ctx.accountId)
      .in('id', ids.slice(i, i + 200));
    if (error)
      throw new ServiceError('internal', 'Could not load the audience');
    out.push(...((data ?? []) as AudienceContact[]));
  }
  return out;
}

async function contactsByTags(
  ctx: ServiceContext,
  tagIds: string[]
): Promise<AudienceContact[]> {
  const { data, error } = await ctx.db
    .from('contacts')
    .select('id, phone, contact_tags!inner(tag_id)')
    .eq('account_id', ctx.accountId)
    .in('contact_tags.tag_id', tagIds)
    .limit(MAX_BROADCAST_AUDIENCE * 3);
  if (error) throw new ServiceError('internal', 'Could not load the audience');
  return ((data ?? []) as { id: string; phone: string }[]).map((c) => ({
    id: c.id,
    phone: c.phone,
  }));
}

function parseSchedule(value: string | undefined, now: Date): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t))
    throw new ServiceError(
      'invalid_input',
      'schedule_at is not a valid ISO date-time'
    );
  if (t <= now.getTime() + 60_000)
    throw new ServiceError(
      'invalid_input',
      'schedule_at must be at least a minute in the future; leave it out to send now'
    );
  if (t > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000)
    throw new ServiceError(
      'invalid_input',
      `schedule_at can be at most ${MAX_SCHEDULE_DAYS} days ahead`
    );
  return new Date(t).toISOString();
}

async function resolveAudience(
  ctx: ServiceContext,
  input: { tagIds?: string[]; contactIds?: string[] }
): Promise<AudienceContact[]> {
  const contactIds = [...new Set(input.contactIds ?? [])];
  const tagIds = [...new Set(input.tagIds ?? [])];
  if (!contactIds.length && !tagIds.length)
    throw new ServiceError(
      'invalid_input',
      'Choose the audience: tag_ids (contacts with any of these tags) and/or contact_ids'
    );
  if (contactIds.some((id) => !UUID_RE.test(id)))
    throw new ServiceError('not_found', 'One or more contacts were not found');

  const byId = new Map<string, AudienceContact>();
  if (contactIds.length) {
    const found = await contactsByIds(ctx, contactIds);
    if (found.length !== contactIds.length)
      throw new ServiceError(
        'not_found',
        'One or more contacts were not found'
      );
    for (const c of found) byId.set(c.id, c);
  }
  if (tagIds.length) {
    const ids = await resolveTagIds(ctx, { ids: tagIds, create: false });
    for (const c of await contactsByTags(ctx, ids)) byId.set(c.id, c);
  }
  // One message per phone, even if two contacts share a number.
  const seen = new Set<string>();
  const out: AudienceContact[] = [];
  for (const c of byId.values()) {
    const key = normalizePhone(c.phone) || c.phone;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  if (!out.length)
    throw new ServiceError('invalid_input', 'No contacts match that audience');
  if (out.length > MAX_BROADCAST_AUDIENCE)
    throw new ServiceError(
      'invalid_input',
      `That audience has more than ${MAX_BROADCAST_AUDIENCE} contacts. Narrow it, or send the broadcast from Replai`
    );
  return out;
}

async function optedOutCount(
  ctx: ServiceContext,
  category: string,
  contacts: AudienceContact[]
): Promise<number> {
  if (!isMarketingCategory(category)) return 0;
  const { suppressed } = await filterOptedOutPhones(
    ctx.db,
    ctx.accountId,
    contacts.map((c) => c.phone)
  );
  return contacts.filter((c) => {
    const key = normalizePhone(c.phone);
    return key ? suppressed.has(key) : false;
  }).length;
}

export async function previewBroadcast(
  ctx: ServiceContext,
  input: BroadcastInput,
  now: Date
): Promise<BroadcastPreview> {
  const scheduleAt = parseSchedule(input.scheduleAt, now);
  const fill: TemplateFill = {
    templateName: input.templateName,
    language: input.language,
    bodyVariables: input.bodyVariables,
    headerText: input.headerText,
    headerMediaUrl: input.headerMediaUrl,
    buttonUrlSuffixes: input.buttonUrlSuffixes,
  };
  const prepared = await prepareTemplateFill(ctx, fill);
  const audience = await resolveAudience(ctx, input);
  const optedOut = await optedOutCount(
    ctx,
    prepared.template.category,
    audience
  );
  const willSend = audience.length - optedOut;
  if (willSend <= 0)
    throw new ServiceError(
      'invalid_input',
      'Every contact in that audience has opted out of marketing messages'
    );
  return {
    stored: {
      // Pin the language so the send uses the template that was previewed.
      fill: { ...fill, language: prepared.template.language },
      contact_ids: audience.map((c) => c.id),
      schedule_at: scheduleAt,
      name: input.name?.trim().slice(0, 200) || null,
    },
    audience: audience.length,
    opted_out: optedOut,
    will_send: willSend,
    template: {
      name: prepared.template.name,
      language: prepared.template.language,
      category: prepared.template.category,
    },
    sample_text: prepared.renderedText,
    schedule_at: scheduleAt,
  };
}

function isStoredPreview(v: unknown): v is StoredBroadcastPreview {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    !!p.fill &&
    typeof (p.fill as Record<string, unknown>).templateName === 'string' &&
    Array.isArray(p.contact_ids)
  );
}

export async function sendBroadcast(
  ctx: ServiceContext,
  ops: PrivilegedOps,
  stored: unknown,
  now: Date
): Promise<{
  broadcastId: string;
  recipients: number;
  skipped: number;
  scheduledAt: string | null;
  templateName: string;
}> {
  if (!isStoredPreview(stored))
    throw new ServiceError(
      'invalid_input',
      'That confirmation is not a broadcast preview. Call preview_broadcast again'
    );
  // The schedule may have passed while the user was deciding; then it
  // simply goes out on the next sweep.
  const scheduleAt =
    stored.schedule_at && Date.parse(stored.schedule_at) > now.getTime()
      ? stored.schedule_at
      : null;

  // Re-check everything: contacts can be deleted, a template paused.
  const prepared = await prepareTemplateFill(ctx, stored.fill);
  const ids = stored.contact_ids.filter(
    (id): id is string => typeof id === 'string' && UUID_RE.test(id)
  );
  const contacts = ids.length ? await contactsByIds(ctx, ids) : [];
  if (!contacts.length)
    throw new ServiceError(
      'invalid_input',
      'None of the previewed contacts exist any more'
    );

  const optedOut = await optedOutCount(
    ctx,
    prepared.template.category,
    contacts
  );
  if (contacts.length - optedOut <= 0)
    throw new ServiceError(
      'invalid_input',
      'Every previewed contact has opted out of marketing messages'
    );
  await reserveOrThrow(ops, 'recipients', contacts.length - optedOut);

  try {
    const created = await ops.createBroadcast({
      name:
        stored.name ??
        `AI broadcast (${prepared.template.name}, ${now.toISOString().slice(0, 10)})`,
      templateName: prepared.template.name,
      templateLanguage: prepared.template.language,
      recipients: contacts.map((c) => ({
        to: c.phone,
        params: prepared.bodyParams,
        messageParams: prepared.messageParams,
      })),
      scheduledAt: scheduleAt,
    });
    return {
      broadcastId: created.broadcastId,
      recipients: created.recipients,
      skipped: created.suppressed + created.rejected,
      scheduledAt: scheduleAt,
      templateName: prepared.template.name,
    };
  } catch (err) {
    if (err instanceof BroadcastError && err.status < 500)
      throw new ServiceError('invalid_input', err.message);
    throw err;
  }
}

export async function cancelScheduledBroadcast(
  ctx: ServiceContext,
  broadcastId: string
): Promise<{ id: string; name: string; previous: string }> {
  if (!UUID_RE.test(broadcastId))
    throw new ServiceError('not_found', 'Broadcast not found');
  const { data, error } = await ctx.db
    .from('broadcasts')
    .select('id, name, status')
    .eq('account_id', ctx.accountId)
    .eq('id', broadcastId)
    .maybeSingle();
  if (error) throw new ServiceError('internal', 'Could not load the broadcast');
  if (!data) throw new ServiceError('not_found', 'Broadcast not found');
  const b = data as { id: string; name: string; status: string };
  if (b.status !== 'scheduled')
    throw new ServiceError(
      'invalid_input',
      `Only a scheduled broadcast can be cancelled; this one is ${b.status}`
    );
  // Conditional on still being scheduled: if the sweep claimed it a
  // moment ago, nothing changes and we say so.
  const { data: updated, error: updErr } = await ctx.db
    .from('broadcasts')
    .update({ status: 'draft', scheduled_at: null })
    .eq('account_id', ctx.accountId)
    .eq('id', b.id)
    .eq('status', 'scheduled')
    .select('id');
  if (updErr)
    throw new ServiceError('internal', 'Could not cancel the broadcast');
  if (!updated?.length)
    throw new ServiceError(
      'invalid_input',
      'The broadcast has already started sending, so it can no longer be cancelled'
    );
  return { id: b.id, name: b.name, previous: 'scheduled' };
}
