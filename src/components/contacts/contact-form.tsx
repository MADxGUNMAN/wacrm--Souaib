'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { isGreenish } from '@/lib/contacts/tag-color';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag, CustomField } from '@/types';
import {
  findExistingContact,
  isExactMatch,
  isUniqueViolation,
  type ExistingContact,
} from '@/lib/contacts/dedupe';
import {
  isValidEmail,
  EMAIL_INVALID_MESSAGE,
  normalizeEmail,
} from '@/lib/validation/email';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  contactTags?: ContactTag[];
  onSaved: () => void;
  /** Open an existing contact's detail view — used by the duplicate
   *  notice to jump to the contact that already owns this number. */
  onViewExisting?: (contactId: string) => void;
  /**
   * Seed values for a NEW contact — used when the form is opened from
   * somewhere that already knows the number, e.g. the "Add to Contacts"
   * button on a WhatsApp contact card in the inbox.
   *
   * Deliberately separate from `contact`. Passing a half-built object as
   * `contact` would flip `isEdit` to true and make the save an UPDATE
   * against an id that does not exist, so the contact would silently never
   * be created. Ignored in edit mode, where the real row always wins.
   */
  initialValues?: {
    name?: string;
    phone?: string;
    email?: string;
    company?: string;
  };
}

export function ContactForm({
  open,
  onOpenChange,
  contact,
  contactTags = [],
  onSaved,
  onViewExisting,
  initialValues,
}: ContactFormProps) {
  const t = useTranslations('Contacts.form');
  const supabase = createClient();
  const { accountId } = useAuth();
  const isEdit = !!contact;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(true);
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);

  const isEmailValid = useMemo(() => {
    const trimmed = email.trim();
    if (!trimmed) return true; // Optional field
    return isValidEmail(trimmed);
  }, [email]);

  const showEmailError =
    emailTouched && email.trim().length > 0 && !isEmailValid;

  // Duplicate-phone detection for NEW contacts. `exact` (same digits)
  // hard-blocks the save; a fuzzy trunk-variant match only warns. The
  // DB unique index (migration 022) is the real backstop — this is the
  // friendly heads-up before we get there.
  const [dupMatch, setDupMatch] = useState<{
    contact: ExistingContact;
    exact: boolean;
  } | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Dynamic custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // An existing row always wins; `initialValues` only seeds a NEW
      // contact. Re-running on every open is what makes the prefill land
      // each time the dialog is reopened from a different contact card.
      setName(contact?.name ?? initialValues?.name ?? '');
      setPhone(contact?.phone ?? initialValues?.phone ?? '');
      setEmail(contact?.email ?? initialValues?.email ?? '');
      setEmailTouched(false);
      setCompany(contact?.company ?? initialValues?.company ?? '');
      setSelectedTagIds(contactTags.map((ct) => ct.tag_id));
      setDupMatch(null);
      setCustomValues({});
      fetchTags();
      fetchCustomFields();
      // A seeded number has not been through the on-blur duplicate check,
      // because the field is never focused. Run it up front so the agent
      // sees "this number is already in the CRM" before typing anything —
      // otherwise the only feedback is a rejected save.
      if (!contact && initialValues?.phone) {
        void checkDuplicate(initialValues.phone);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact, initialValues?.name, initialValues?.phone]);

  // Look up an existing contact with this number (new contacts only).
  // Runs on blur so we don't query on every keystroke.
  async function checkDuplicate(override?: string) {
    if (isEdit || !accountId) return;
    // `override` lets the open-effect check a seeded number, which never
    // gets a blur event because the field is not touched.
    const value = (override ?? phone).trim();
    if (!value) {
      setDupMatch(null);
      return;
    }
    setCheckingDup(true);
    try {
      const existing = await findExistingContact(supabase, accountId, value);
      setDupMatch(
        existing
          ? { contact: existing, exact: isExactMatch(existing, value) }
          : null
      );
    } finally {
      setCheckingDup(false);
    }
  }

  async function fetchTags() {
    setLoadingTags(true);
    const { data } = await supabase.from('tags').select('*').order('name');
    if (data) setTags(data);
    setLoadingTags(false);
  }

  async function fetchCustomFields() {
    const { data: fields } = await supabase
      .from('custom_fields')
      .select('*')
      .order('field_name');
    setCustomFields(fields ?? []);

    // Pre-fill values when editing an existing contact
    if (contact?.id) {
      const { data: values } = await supabase
        .from('contact_custom_values')
        .select('custom_field_id, value')
        .eq('contact_id', contact.id);
      if (values) {
        const map: Record<string, string> = {};
        values.forEach((v) => {
          map[v.custom_field_id] = v.value ?? '';
        });
        setCustomValues(map);
      }
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error(t('phoneRequired'));
      return;
    }

    if (!isPhoneValid) {
      toast.error('Please enter a valid phone number for the selected country');
      return;
    }

    if (email.trim() && !isValidEmail(email.trim())) {
      setEmailTouched(true);
      toast.error(EMAIL_INVALID_MESSAGE);
      return;
    }

    // Hard-block an exact duplicate on create (the DB unique index is
    // the real backstop; this avoids a round-trip + a raw error toast).
    if (!isEdit && dupMatch?.exact) {
      toast.error(t('toastConflict'));
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');
      if (!accountId)
        throw new Error('Your profile is not linked to an account.');

      let contactId = contact?.id;

      if (isEdit && contactId) {
        const { error } = await supabase
          .from('contacts')
          .update({
            name: name.trim() || null,
            phone: phone.trim(),
            email: email.trim() ? normalizeEmail(email) : null,
            company: company.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contactId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('contacts')
          .insert({
            user_id: user.id,
            account_id: accountId,
            name: name.trim() || null,
            phone: phone.trim(),
            email: email.trim() ? normalizeEmail(email) : null,
            company: company.trim() || null,
            // A person filled in this form. Also covers the inbox's "add
            // contact" on a shared contact card, which prefills and reuses it
            // — still a human choosing to save the contact.
            source: 'manual',
          })
          .select('id')
          .single();
        if (error) throw error;
        contactId = data.id;
      }

      // Sync tags
      if (contactId) {
        const existingTagIds = new Set(contactTags.map((tag) => tag.tag_id));
        const desiredTagIds = new Set(selectedTagIds);
        const toRemove = [...existingTagIds].filter(
          (id) => !desiredTagIds.has(id)
        );
        const toAdd = [...desiredTagIds].filter(
          (id) => !existingTagIds.has(id)
        );

        for (const tagId of toRemove) {
          await deleteContactTag(contactId, tagId);
        }
        for (const tagId of toAdd) {
          await addContactTag(contactId, tagId);
        }

        // Save custom field values
        if (isEdit) {
          await supabase
            .from('contact_custom_values')
            .delete()
            .eq('contact_id', contactId);
        }
        const customRows = Object.entries(customValues)
          .filter(([, val]) => val.trim())
          .map(([fieldId, val]) => ({
            contact_id: contactId,
            custom_field_id: fieldId,
            value: val.trim(),
          }));
        if (customRows.length > 0) {
          await supabase.from('contact_custom_values').insert(customRows);
        }
      }

      toast.success(isEdit ? t('toastSuccessEdit') : t('toastSuccessAdd'));
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      // The unique index (migration 022) rejects a duplicate phone that
      // slipped past the on-blur check (race, or a format that
      // normalizes equal). Surface it as the friendly duplicate notice
      // and, for new contacts, point the user at the existing record.
      if (isUniqueViolation(err)) {
        toast.error(t('toastConflict'));
        if (!isEdit && accountId) {
          const existing = await findExistingContact(
            supabase,
            accountId,
            phone.trim()
          );
          if (existing) setDupMatch({ contact: existing, exact: true });
        }
        return;
      }
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const emailRow = customFields.find((f) => f.field_key === 'email');
  const companyRow = customFields.find((f) => f.field_key === 'company');
  const pureCustomFields = customFields.filter(
    (f) => !f.is_system && !f.field_key && f.visible !== false
  );

  const emailVisible = emailRow?.visible !== false;
  const emailLabel = emailRow?.field_name || t('emailLabel');

  const companyVisible = companyRow?.visible !== false;
  const companyLabel = companyRow?.field_name || t('companyLabel');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEdit ? t('editTitle') : t('addTitle')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit ? t('editDesc') : t('addDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cf-name" className="text-muted-foreground">
              {t('nameLabel')}
            </Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-phone" className="text-muted-foreground">
              {t('phoneLabel')} <span className="text-red-400">*</span>
            </Label>
            <PhoneInput
              id="cf-phone"
              value={phone}
              defaultCountryCode="IN"
              required
              onChange={(fullE164, isValid) => {
                setPhone(fullE164);
                setIsPhoneValid(isValid);
                if (dupMatch) setDupMatch(null);
              }}
              onBlur={() => void checkDuplicate()}
            />
            {dupMatch && (
              <div
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                  dupMatch.exact
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <div className="space-y-1">
                  <p>{dupMatch.exact ? t('dupExact') : t('dupSimilar')}</p>
                  {onViewExisting && (
                    <button
                      type="button"
                      onClick={() => onViewExisting(dupMatch.contact.id)}
                      className="font-medium underline underline-offset-2 hover:no-underline"
                    >
                      {t('viewExisting', {
                        name: dupMatch.contact.name || dupMatch.contact.phone,
                      })}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {emailVisible && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-email" className="text-muted-foreground">
                {emailLabel}
              </Label>
              <Input
                id="cf-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder={t('emailPlaceholder')}
                className={cn(
                  'bg-muted border-border text-foreground placeholder:text-muted-foreground transition-all duration-150',
                  showEmailError &&
                    'border-red-500 bg-red-500/5 ring-1 ring-red-500/80 focus-visible:ring-red-500'
                )}
              />
              {showEmailError && (
                <div className="animate-in fade-in-0 flex items-center gap-1.5 px-0.5 text-xs font-medium text-red-400 duration-150">
                  <AlertCircle className="size-3.5 shrink-0 text-red-400" />
                  <span>{EMAIL_INVALID_MESSAGE}</span>
                </div>
              )}
            </div>
          )}

          {companyVisible && (
            <div className="space-y-2">
              <Label htmlFor="cf-company" className="text-muted-foreground">
                {companyLabel}
              </Label>
              <Input
                id="cf-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('companyPlaceholder')}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          )}

          {/* Dynamic Custom Fields */}
          {pureCustomFields.length > 0 && (
            <div className="border-border space-y-2 border-t pt-3">
              {pureCustomFields.map((cf) => (
                <div key={cf.id} className="space-y-2">
                  <Label
                    htmlFor={`cf-custom-${cf.id}`}
                    className="text-muted-foreground capitalize"
                  >
                    {cf.field_name}
                  </Label>
                  <Input
                    id={`cf-custom-${cf.id}`}
                    value={customValues[cf.id] ?? ''}
                    onChange={(e) =>
                      setCustomValues((prev) => ({
                        ...prev,
                        [cf.id]: e.target.value,
                      }))
                    }
                    placeholder={cf.field_name}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('tagsLabel')}</Label>
            {loadingTags ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-3 animate-spin" />
                {t('loadingTags')}
              </div>
            ) : tags.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {t('noTagsAvailable')}
              </p>
            ) : (
              <div className="border-border/70 bg-muted/20 max-h-36 overflow-y-auto rounded-lg border p-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    const isGreen = isGreenish(tag.color);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`inline-flex cursor-pointer items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          selected
                            ? 'ring-primary ring-offset-border ring-2 ring-offset-1'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: tag.color + '20',
                          color: isGreen ? '#000000' : tag.color,
                          borderColor: isGreen ? '#00000030' : tag.color,
                        }}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-border/60 bg-popover/80 -mx-4 mt-5 -mb-4 flex flex-row items-center justify-end gap-2.5 border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving || checkingDup || (!isEdit && !!dupMatch?.exact)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-20 font-medium"
            >
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {isEdit ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
