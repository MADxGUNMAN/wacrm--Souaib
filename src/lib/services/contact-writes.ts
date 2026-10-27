// ============================================================
// Contact write services (Phase 6).
//
// Built on the same helpers the rest of the CRM writes through, so an AI
// change behaves exactly like one made in Replai:
//   * findOrCreateContact — phone dedupe + unique-violation race backstop
//     (the public API's helper); `source` is 'ai' for the AI connector.
//   * addContactTagAndDispatch — the dashboard tag route's writer; fires
//     `tag_added` automations only for a newly added tag.
//   * resolveImportTagIds — tag names → ids, creating missing tags.
//
// Every function verifies that EVERY id belongs to the caller's account
// before writing anything: a foreign id fails the whole call as
// "not found" and changes nothing.
// ============================================================

import {
  ContactError,
  findOrCreateContact,
  getContactById,
  type ApiContact,
} from '@/lib/api/v1/contacts';
import type { ContactSource } from '@/lib/contacts/contact-source';
import {
  idsForTagNames,
  resolveImportTagIds,
} from '@/lib/contacts/resolve-import-tags';
import { addContactTagAndDispatch } from '@/lib/contacts/tag-events';
import {
  ContactTagWriteError,
  removeContactTag,
} from '@/lib/contacts/tag-write';
import { ServiceError, UUID_RE, type ServiceContext } from './context';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_TAG_TARGETS = 200;

function sourceFor(ctx: ServiceContext): ContactSource {
  return ctx.actor.kind === 'ai' ? 'ai' : 'manual';
}

function cleanText(
  v: string | null | undefined,
  max: number
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** All `ids` are contacts of this account, or throw not_found. */
export async function assertContactsInAccount(
  ctx: ServiceContext,
  ids: readonly string[]
): Promise<void> {
  if (!ids.length)
    throw new ServiceError('invalid_input', 'Give at least one contact_id');
  if (ids.some((id) => !UUID_RE.test(id)))
    throw new ServiceError('not_found', 'Contact not found');
  const unique = [...new Set(ids)];
  const { data, error } = await ctx.db
    .from('contacts')
    .select('id')
    .eq('account_id', ctx.accountId)
    .in('id', unique);
  if (error) throw new ServiceError('internal', 'Could not check the contacts');
  if ((data ?? []).length !== unique.length) {
    throw new ServiceError(
      'not_found',
      unique.length === 1
        ? 'Contact not found'
        : 'One or more contacts were not found'
    );
  }
}

// ------------------------------------------------------------
// Create / update
// ------------------------------------------------------------

export interface CreateContactInput {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  tagNames?: string[];
}

export async function createContact(
  ctx: ServiceContext,
  input: CreateContactInput
): Promise<{ contact: ApiContact; created: boolean; tags_added: number }> {
  const email = cleanText(input.email, 200);
  if (email && !EMAIL_RE.test(email))
    throw new ServiceError('invalid_input', 'email is not a valid address');
  let result: { id: string; created: boolean };
  try {
    result = await findOrCreateContact(
      ctx.db,
      ctx.accountId,
      ctx.userId,
      {
        phone: input.phone,
        name: cleanText(input.name, 200) ?? undefined,
        email: email ?? undefined,
        company: cleanText(input.company, 200) ?? undefined,
      },
      sourceFor(ctx)
    );
  } catch (err) {
    if (err instanceof ContactError && err.status === 400)
      throw new ServiceError('invalid_input', err.message);
    throw new ServiceError('internal', 'Could not create the contact');
  }

  let tagsAdded = 0;
  if (input.tagNames?.length) {
    const tagIds = await resolveTagIds(ctx, {
      names: input.tagNames,
      create: true,
    });
    tagsAdded = (await addTagsToContacts(ctx, [result.id], tagIds)).added;
  }
  const contact = await getContactById(ctx.db, ctx.accountId, result.id);
  if (!contact)
    throw new ServiceError('internal', 'Could not load the contact');
  return { contact, created: result.created, tags_added: tagsAdded };
}

export interface UpdateContactInput {
  name?: string | null;
  email?: string | null;
  company?: string | null;
}

export async function updateContact(
  ctx: ServiceContext,
  contactId: string,
  input: UpdateContactInput
): Promise<{ contact: ApiContact; changed: string[] }> {
  if (!UUID_RE.test(contactId))
    throw new ServiceError('not_found', 'Contact not found');
  const patch: Record<string, string | null> = {};
  const name = cleanText(input.name, 200);
  const email = cleanText(input.email, 200);
  const company = cleanText(input.company, 200);
  if (name !== undefined) patch.name = name;
  if (email !== undefined) {
    if (email && !EMAIL_RE.test(email))
      throw new ServiceError('invalid_input', 'email is not a valid address');
    patch.email = email;
  }
  if (company !== undefined) patch.company = company;
  if (!Object.keys(patch).length)
    throw new ServiceError(
      'invalid_input',
      'Nothing to change: give name, email or company'
    );

  const { data: before, error: readErr } = await ctx.db
    .from('contacts')
    .select('id, name, email, company')
    .eq('account_id', ctx.accountId)
    .eq('id', contactId)
    .maybeSingle();
  if (readErr) throw new ServiceError('internal', 'Could not load the contact');
  if (!before) throw new ServiceError('not_found', 'Contact not found');

  const changed = Object.keys(patch).filter(
    (k) => (before as Record<string, unknown>)[k] !== patch[k]
  );
  if (changed.length) {
    const { error } = await ctx.db
      .from('contacts')
      .update(patch)
      .eq('account_id', ctx.accountId)
      .eq('id', contactId);
    if (error)
      throw new ServiceError('internal', 'Could not update the contact');
  }
  const contact = await getContactById(ctx.db, ctx.accountId, contactId);
  if (!contact) throw new ServiceError('not_found', 'Contact not found');
  return { contact, changed };
}

// ------------------------------------------------------------
// Tags
// ------------------------------------------------------------

/**
 * Tag ids for this account from ids and/or names. Names match
 * case-insensitively; `create` makes missing ones (as the CSV import
 * does). Unknown ids, or unknown names without `create`, are an error.
 */
export async function resolveTagIds(
  ctx: ServiceContext,
  input: { ids?: string[]; names?: string[]; create: boolean }
): Promise<string[]> {
  const out = new Set<string>();
  const ids = [...new Set(input.ids ?? [])];
  if (ids.length) {
    if (ids.some((id) => !UUID_RE.test(id)))
      throw new ServiceError('not_found', 'Tag not found');
    const { data, error } = await ctx.db
      .from('tags')
      .select('id')
      .eq('account_id', ctx.accountId)
      .in('id', ids);
    if (error) throw new ServiceError('internal', 'Could not check the tags');
    if ((data ?? []).length !== ids.length)
      throw new ServiceError('not_found', 'One or more tags were not found');
    for (const r of data ?? []) out.add(r.id as string);
  }
  const names = [
    ...new Set((input.names ?? []).map((n) => n.trim()).filter(Boolean)),
  ];
  if (names.length) {
    const { tagIdByKey } = await resolveImportTagIds(ctx.db, {
      accountId: ctx.accountId,
      userId: ctx.userId,
      tagNames: names,
      canCreateTags: input.create,
    });
    // tagIdByKey holds EVERY tag in the account; take only the requested names.
    const picked = idsForTagNames(tagIdByKey, names);
    if (picked.length < names.length) {
      throw new ServiceError(
        'not_found',
        'One or more tags were not found (see list_tags)'
      );
    }
    for (const id of picked) out.add(id);
  }
  if (!out.size)
    throw new ServiceError(
      'invalid_input',
      'Give at least one tag id or tag name'
    );
  return [...out];
}

export async function addTagsToContacts(
  ctx: ServiceContext,
  contactIds: readonly string[],
  tagIds: readonly string[]
): Promise<{ added: number; already: number; automations_triggered: number }> {
  if (contactIds.length > MAX_TAG_TARGETS) {
    throw new ServiceError(
      'invalid_input',
      `At most ${MAX_TAG_TARGETS} contacts per call`
    );
  }
  await assertContactsInAccount(ctx, contactIds);
  let added = 0;
  let already = 0;
  let dispatched = 0;
  for (const contactId of new Set(contactIds)) {
    for (const tagId of tagIds) {
      try {
        const r = await addContactTagAndDispatch({
          db: ctx.db,
          accountId: ctx.accountId,
          contactId,
          tagId,
        });
        if (r.added) added += 1;
        else already += 1;
        if (r.dispatched) dispatched += 1;
      } catch (err) {
        if (err instanceof ContactTagWriteError && err.status === 404)
          throw new ServiceError('not_found', err.message);
        throw new ServiceError('internal', 'Could not add the tag');
      }
    }
  }
  return { added, already, automations_triggered: dispatched };
}

export async function removeTagsFromContacts(
  ctx: ServiceContext,
  contactIds: readonly string[],
  tagIds: readonly string[]
): Promise<{ removed_pairs: number }> {
  if (contactIds.length > MAX_TAG_TARGETS) {
    throw new ServiceError(
      'invalid_input',
      `At most ${MAX_TAG_TARGETS} contacts per call`
    );
  }
  await assertContactsInAccount(ctx, contactIds);
  const unique = [...new Set(contactIds)];
  const { count } = await ctx.db
    .from('contact_tags')
    .select('id', { count: 'exact', head: true })
    .in('contact_id', unique)
    .in('tag_id', [...tagIds]);
  for (const contactId of unique) {
    for (const tagId of tagIds) {
      try {
        await removeContactTag(ctx.db, {
          accountId: ctx.accountId,
          contactId,
          tagId,
        });
      } catch (err) {
        if (err instanceof ContactTagWriteError && err.status === 404)
          throw new ServiceError('not_found', err.message);
        throw new ServiceError('internal', 'Could not remove the tag');
      }
    }
  }
  return { removed_pairs: count ?? 0 };
}

// ------------------------------------------------------------
// Notes and custom fields
// ------------------------------------------------------------

export const MAX_NOTE_LENGTH = 5000;

export async function addContactNote(
  ctx: ServiceContext,
  contactId: string,
  text: string
): Promise<{ id: string; created_at: string }> {
  const note = text.trim();
  if (!note) throw new ServiceError('invalid_input', 'The note is empty');
  if (note.length > MAX_NOTE_LENGTH)
    throw new ServiceError(
      'invalid_input',
      `Notes can be at most ${MAX_NOTE_LENGTH} characters`
    );
  await assertContactsInAccount(ctx, [contactId]);
  const { data, error } = await ctx.db
    .from('contact_notes')
    .insert({
      account_id: ctx.accountId,
      contact_id: contactId,
      user_id: ctx.userId,
      note_text: note,
    })
    .select('id, created_at')
    .single();
  if (error || !data)
    throw new ServiceError('internal', 'Could not add the note');
  return data as { id: string; created_at: string };
}

export const MAX_CUSTOM_VALUE_LENGTH = 1000;

/** Set (or clear, with null / empty) one custom field value on a contact. */
export async function setCustomField(
  ctx: ServiceContext,
  contactId: string,
  fieldId: string,
  value: string | null
): Promise<{ field: string; value: string | null; previous: string | null }> {
  if (!UUID_RE.test(fieldId))
    throw new ServiceError('not_found', 'Custom field not found');
  const { data: field, error: fErr } = await ctx.db
    .from('custom_fields')
    .select('id, field_name, field_key, field_options')
    .eq('account_id', ctx.accountId)
    .eq('id', fieldId)
    .maybeSingle();
  if (fErr)
    throw new ServiceError('internal', 'Could not load the custom field');
  if (!field) throw new ServiceError('not_found', 'Custom field not found');
  if (field.field_key) {
    throw new ServiceError(
      'invalid_input',
      `"${field.field_name}" is a built-in contact field. Use update_contact`
    );
  }
  await assertContactsInAccount(ctx, [contactId]);

  const clean =
    value === null
      ? null
      : value.trim().slice(0, MAX_CUSTOM_VALUE_LENGTH) || null;
  const options = Array.isArray(field.field_options)
    ? (field.field_options as unknown[]).filter((o) => typeof o === 'string')
    : [];
  if (clean && options.length && !options.includes(clean)) {
    throw new ServiceError(
      'invalid_input',
      `"${field.field_name}" only accepts: ${options.slice(0, 20).join(', ')}`
    );
  }

  const { data: prev } = await ctx.db
    .from('contact_custom_values')
    .select('value')
    .eq('contact_id', contactId)
    .eq('custom_field_id', fieldId)
    .maybeSingle();
  const previous = (prev?.value as string | undefined) ?? null;

  if (clean === null) {
    const { error } = await ctx.db
      .from('contact_custom_values')
      .delete()
      .eq('contact_id', contactId)
      .eq('custom_field_id', fieldId);
    if (error) throw new ServiceError('internal', 'Could not clear the value');
  } else if (clean !== previous) {
    const { error } = await ctx.db
      .from('contact_custom_values')
      .upsert(
        { contact_id: contactId, custom_field_id: fieldId, value: clean },
        { onConflict: 'contact_id,custom_field_id' }
      );
    if (error) throw new ServiceError('internal', 'Could not save the value');
  }
  return { field: field.field_name as string, value: clean, previous };
}
