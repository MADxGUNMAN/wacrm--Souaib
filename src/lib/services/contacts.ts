// ============================================================
// Contact read services (Phase 1). Writes follow in Phase 6.
//
// Search uses the same filter as the Contacts page and the public API
// (`buildContactSearchFilter`), so a phone typed with spaces, dashes or
// a trunk 0 finds the same contact everywhere.
// ============================================================

import {
  CONTACT_SELECT,
  serializeContact,
  type ApiContact,
} from '@/lib/api/v1/contacts';
import { buildPage, decodeCursor, keysetFilter } from '@/lib/api/v1/pagination';
import {
  CONTACT_SOURCES,
  type ContactSource,
} from '@/lib/contacts/contact-source';
import { buildContactSearchFilter } from '@/lib/contacts/search';
import {
  ServiceError,
  UUID_RE,
  clampLimit,
  type ServiceContext,
} from './context';

export const CONTACT_PAGE = { default: 20, max: 50 };

export interface SearchContactsInput {
  query?: string;
  tagId?: string;
  source?: ContactSource;
  limit?: number;
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export async function searchContacts(
  ctx: ServiceContext,
  input: SearchContactsInput = {}
): Promise<Page<ApiContact>> {
  const limit = clampLimit(input.limit, CONTACT_PAGE.default, CONTACT_PAGE.max);
  if (input.tagId !== undefined && !UUID_RE.test(input.tagId)) {
    throw new ServiceError('invalid_input', 'tag_id must be a UUID');
  }
  if (
    input.source !== undefined &&
    !(CONTACT_SOURCES as readonly string[]).includes(input.source)
  ) {
    throw new ServiceError('invalid_input', 'unknown contact source');
  }

  const select = input.tagId
    ? `${CONTACT_SELECT}, tag_filter:contact_tags!inner(tag_id)`
    : CONTACT_SELECT;
  let q = ctx.db
    .from('contacts')
    .select(select)
    .eq('account_id', ctx.accountId);

  const term = input.query?.trim().slice(0, 100);
  if (term)
    q = q.or(
      buildContactSearchFilter(term, ['name', 'phone', 'email', 'company'])
    );
  if (input.tagId) q = q.eq('tag_filter.tag_id', input.tagId);
  if (input.source) q = q.eq('source', input.source);

  const kf = keysetFilter(decodeCursor(input.cursor ?? null));
  if (kf) q = q.or(kf);

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) throw new ServiceError('internal', 'Could not search contacts');

  const { items, nextCursor } = buildPage(
    (data ?? []) as unknown as Array<
      Record<string, unknown> & { created_at: string; id: string }
    >,
    limit
  );
  return { items: items.map(serializeContact), nextCursor };
}

export async function getContact(
  ctx: ServiceContext,
  contactId: string
): Promise<ApiContact> {
  if (!UUID_RE.test(contactId))
    throw new ServiceError('not_found', 'Contact not found');
  const { data, error } = await ctx.db
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('account_id', ctx.accountId)
    .eq('id', contactId)
    .maybeSingle();
  if (error) throw new ServiceError('internal', 'Could not load the contact');
  if (!data) throw new ServiceError('not_found', 'Contact not found');
  return serializeContact(data as Record<string, unknown>);
}

export interface NoteSummary {
  id: string;
  note_text: string;
  created_at: string;
}

/** Most recent notes on a contact (the contact must be in the account). */
export async function listRecentNotes(
  ctx: ServiceContext,
  contactId: string,
  limit = 5
): Promise<NoteSummary[]> {
  if (!UUID_RE.test(contactId))
    throw new ServiceError('not_found', 'Contact not found');
  const { data, error } = await ctx.db
    .from('contact_notes')
    .select('id, note_text, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(clampLimit(limit, 5, 20));
  if (error) throw new ServiceError('internal', 'Could not load notes');
  return (data ?? []) as NoteSummary[];
}

export interface TagSummary {
  id: string;
  name: string;
  color: string;
}

export async function listTags(ctx: ServiceContext): Promise<TagSummary[]> {
  const { data, error } = await ctx.db
    .from('tags')
    .select('id, name, color')
    .eq('account_id', ctx.accountId)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw new ServiceError('internal', 'Could not load tags');
  return (data ?? []) as TagSummary[];
}
