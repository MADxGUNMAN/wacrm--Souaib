'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaUploadField } from '@/components/media/media-upload-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Eye, ImageIcon, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { definitionFromRow } from '@/lib/whatsapp/template-definition';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import {
  EMPTY_HEADER_LOCATION,
  EMPTY_MPM,
  EMPTY_ORDER_DETAILS,
  buildSendPlan,
  localInputToMs,
  missingSendValues,
  type BroadcastSendExtras,
  type MpmValues,
  type OrderDetailsValues,
  type OrderStatusOption,
} from '@/lib/whatsapp/template-send-inputs';
import { extractNamedParams } from '@/lib/whatsapp/template-variables';
import {
  CarouselCardFields,
  CatalogThumbnailField,
  HeaderLocationFields,
  MpmFields,
  OfferExpiryField,
  OrderDetailsFields,
  OrderStatusFields,
} from '@/components/templates/send-time-fields';

type VariableType = 'static' | 'field' | 'custom_field';

interface VariableMapping {
  type: VariableType;
  value: string;
}

interface Step3Props {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  /** Media URL for an IMAGE/VIDEO/DOCUMENT header, when the template has one. */
  headerMediaUrl: string;
  onHeaderMediaUrlChange: (url: string) => void;
  sendExtras: BroadcastSendExtras;
  onSendExtrasChange: (next: BroadcastSendExtras) => void;
  onNext: () => void;
  onBack: () => void;
}

const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;
type MediaHeaderType = (typeof MEDIA_HEADER_TYPES)[number];

function isMediaHeaderType(value: unknown): value is MediaHeaderType {
  return MEDIA_HEADER_TYPES.includes(value as MediaHeaderType);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const contactFields = [
  { value: 'name', labelKey: 'name' },
  { value: 'phone', labelKey: 'phone' },
  { value: 'email', labelKey: 'email' },
  { value: 'company', labelKey: 'company' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  company: 'Acme Corp',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function Step3Personalize({
  template,
  variables,
  onUpdate,
  headerMediaUrl,
  onHeaderMediaUrlChange,
  sendExtras,
  onSendExtrasChange,
  onNext,
  onBack,
}: Step3Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [firstContact, setFirstContact] = useState<Contact | null>(null);
  const [firstContactCustomValues, setFirstContactCustomValues] = useState<
    Map<string, string>
  >(new Map());
  const [loadingPreview, setLoadingPreview] = useState(true);

  // Load user's custom fields + a representative contact for the
  // live preview. Fall back to sample data if no contacts exist yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [fieldsRes, contactRes] = await Promise.all([
        supabase.from('custom_fields').select('*').order('field_name'),
        supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setCustomFields(fieldsRes.data ?? []);
      setLoadingFields(false);

      const contact = contactRes.data ?? null;
      setFirstContact(contact);

      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const row of customVals ?? []) {
            map.set(row.custom_field_id, row.value ?? '');
          }
          setFirstContactCustomValues(map);
        }
      }
      setLoadingPreview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The placeholders to map, as written in the text.
   *
   * A NAMED template's variables are `{{order_id}}`, which the positional
   * regex does not match — without this branch a named template would show
   * "nothing to personalise" and then send with empty values.
   */
  const placeholders = useMemo(() => {
    if (template.parameter_format === 'NAMED') {
      // Order of appearance, so the fields read like the sentence.
      return extractNamedParams(template.body_text).map((n) => `{{${n}}}`);
    }
    const matches = template.body_text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)].sort();
  }, [template.body_text, template.parameter_format]);

  // Templates with an IMAGE/VIDEO/DOCUMENT header need a media URL at
  // send time — Meta requires the media component on every delivery and
  // rejects the broadcast without it. The field is hidden for text-only
  // headers.
  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;

  // Seed the field with the template's stored sample URL the first time
  // we land on a media-header template, so the common "reuse the
  // approved media" case needs no typing. Only seeds when empty to avoid
  // clobbering a URL the user already edited.
  useEffect(() => {
    if (mediaHeaderType && !headerMediaUrl && template.header_media_url) {
      onHeaderMediaUrlChange(template.header_media_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaHeaderType, template.header_media_url]);

  const headerMediaError = useMemo<'missing' | 'invalid' | null>(() => {
    if (!mediaHeaderType) return null;
    const value = headerMediaUrl.trim();
    if (!value) return 'missing';
    if (!isValidHttpUrl(value)) return 'invalid';
    return null;
  }, [mediaHeaderType, headerMediaUrl]);

  /**
   * A placeholder is "unmapped" if the user hasn't picked either a
   * static value or a field/custom-field source. Blocks Next until
   * every placeholder has something — otherwise the broadcast would
   * ship with empty strings and confuse recipients.
   */
  const unmappedKeys = useMemo(() => {
    const missing: string[] = [];
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      if (!mapping || !mapping.value?.trim()) {
        missing.push(placeholder);
      }
    }
    return missing;
  }, [placeholders, variables]);

  // Carousel cards and a limited-time offer's deadline exist only in
  // `components`, so this step could not see them at all before — it read
  // `body_text` and one header URL. The plan describes every shape.
  const plan = useMemo(() => buildSendPlan(template), [template]);

  // Seed the card list once so the inputs are stable in length. Card
  // count is frozen at approval, so there is nothing to add or remove.
  useEffect(() => {
    if (
      plan.cards.length > 0 &&
      sendExtras.cards.length !== plan.cards.length
    ) {
      onSendExtrasChange({
        ...sendExtras,
        cards: plan.cards.map((_, i) => sendExtras.cards[i] ?? {}),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.cards.length]);

  /**
   * What the shared fields are still missing.
   *
   * Body variables are excluded on purpose: they resolve per contact from
   * the field mappings, so `unmappedKeys` above is the right check for
   * those and passing empty strings here would report them twice.
   */
  const missingExtras = useMemo(() => {
    return missingSendValues(plan, {
      // Stand-ins for the values this step does not own: body variables
      // are per-contact (checked by `unmappedKeys`) and the header media
      // URL has its own validation with a URL check (`headerMediaError`).
      // Filling them keeps this list to the offer and card fields, so
      // nothing is reported to the operator twice.
      body: plan.isAuthentication
        ? [sendExtras.authCode || '']
        : Array.from({ length: plan.bodyVarCount }, () => 'x'),
      namedBody: Object.fromEntries(plan.bodyParamNames.map((n) => [n, 'x'])),
      headerText: 'x',
      headerMediaUrl: 'x',
      buttonParams: sendExtras.buttonParams,
      offerExpiresAtMs: localInputToMs(sendExtras.offerExpiryLocal),
      cards: sendExtras.cards,
      headerLocation: sendExtras.headerLocation,
      catalogThumbnailProductId: sendExtras.catalogThumbnailProductId,
      mpm: sendExtras.mpm,
      orderDetails: sendExtras.orderDetails,
      orderReferenceId: sendExtras.orderStatus?.orderReferenceId,
      orderStatus: (sendExtras.orderStatus?.orderStatus || '') as
        OrderStatusOption | '',
      orderStatusDescription: sendExtras.orderStatus?.orderStatusDescription,
    });
  }, [plan, sendExtras]);

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const current = variables[key] ?? {
      type: 'static' as VariableType,
      value: '',
    };
    onUpdate({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  /**
   * Substitute placeholders using the first real contact where
   * possible. Placeholders keyed by "{{N}}" map to variable key "N".
   */
  /**
   * Resolved values keyed by variable name ("1" for "{{1}}").
   *
   * Produces a map rather than a finished string so the shared
   * WhatsAppPreview can do the rendering — that way the broadcast
   * preview also shows the header, footer and buttons, which the old
   * body-only string substitution silently omitted. An unresolved
   * placeholder is left out of the map entirely so the preview marks it
   * as missing instead of printing braces.
   */
  const previewValues = useMemo(() => {
    const contact = firstContact ?? SAMPLE_CONTACT;
    const customValues = firstContact
      ? firstContactCustomValues
      : new Map<string, string>();

    const resolved: Record<string, string | undefined> = {};
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      if (!mapping || !mapping.value) continue;

      if (mapping.type === 'static') {
        resolved[key] = mapping.value || undefined;
      } else if (mapping.type === 'field') {
        const fieldMap: Record<string, string | undefined> = {
          name: contact.name ?? undefined,
          phone: contact.phone ?? undefined,
          email: contact.email ?? undefined,
          company: contact.company ?? undefined,
        };
        resolved[key] = fieldMap[mapping.value] ?? undefined;
      } else if (mapping.type === 'custom_field') {
        resolved[key] = customValues.get(mapping.value) || undefined;
      }
    }
    return resolved;
  }, [variables, placeholders, firstContact, firstContactCustomValues]);

  const previewLabel = firstContact
    ? firstContact.name || firstContact.phone
    : t('personalize.previewSample');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">
          {t('personalize.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('personalize.subtitle')}
        </p>
      </div>

      {mediaHeaderType && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="text-primary h-4 w-4" />
            <p className="text-foreground text-sm font-medium">
              {t('personalize.headerImage')}
            </p>
            <span className="bg-primary/10 text-primary inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase">
              {mediaHeaderType}
            </span>
          </div>
          {/* Send-time media for the whole broadcast, so it goes to the
              SEND folder. The field renders its own preview and remove
              control, which is why the separate <img> below it is gone. */}
          <MediaUploadField
            kind={mediaHeaderType as 'image' | 'video' | 'document'}
            purpose="send"
            value={headerMediaUrl}
            onChange={onHeaderMediaUrlChange}
            urlPlaceholder={t('personalize.imageUrlPlaceholder')}
            hint={t('personalize.headerImageDesc')}
          />
          {headerMediaError && (
            <p className="mt-1.5 text-xs text-amber-300">
              {headerMediaError === 'missing'
                ? 'A media URL is required to send this template.'
                : 'Enter a valid http(s) URL.'}
            </p>
          )}
        </div>
      )}

      {plan.offer && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <OfferExpiryField
            offer={plan.offer}
            value={sendExtras.offerExpiryLocal}
            onChange={(next) =>
              onSendExtrasChange({ ...sendExtras, offerExpiryLocal: next })
            }
            code={
              plan.offer.code
                ? (sendExtras.buttonParams[plan.offer.code.index] ?? '')
                : ''
            }
            onCodeChange={(next) => {
              const idx = plan.offer?.code?.index;
              if (idx === undefined) return;
              onSendExtrasChange({
                ...sendExtras,
                buttonParams: { ...sendExtras.buttonParams, [idx]: next },
              });
            }}
          />
          <p className="text-muted-foreground mt-2 text-xs">
            One deadline applies to the whole broadcast. Every recipient sees
            the same countdown, so a long send still ends at this moment.
          </p>
        </div>
      )}

      {plan.needsHeaderLocation && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <HeaderLocationFields
            value={sendExtras.headerLocation ?? EMPTY_HEADER_LOCATION}
            onChange={(next) =>
              onSendExtrasChange({ ...sendExtras, headerLocation: next })
            }
          />
          <p className="text-muted-foreground mt-2 text-xs">
            One pin for the whole broadcast. For per-recipient addresses, send
            these from a conversation instead.
          </p>
        </div>
      )}

      {plan.cards.length > 0 && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <CarouselCardFields
            cards={plan.cards}
            values={sendExtras.cards}
            onChange={(cardIndex, patch) => {
              const next = [...sendExtras.cards];
              next[cardIndex] = { ...(next[cardIndex] ?? {}), ...patch };
              onSendExtrasChange({ ...sendExtras, cards: next });
            }}
          />
        </div>
      )}

      {plan.urlButtons.length > 0 && (
        <div className="border-border bg-card/50 space-y-4 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">Button Links</p>
          {plan.urlButtons.map((slot) => (
            <div key={slot.index} className="space-y-1.5">
              <p className="text-muted-foreground text-xs">
                URL button &quot;{slot.text}&quot; — dynamic suffix {`{{1}}`}
              </p>
              <Input
                value={sendExtras.buttonParams[slot.index] ?? ''}
                onChange={(e) =>
                  onSendExtrasChange({
                    ...sendExtras,
                    buttonParams: {
                      ...sendExtras.buttonParams,
                      [slot.index]: e.target.value,
                    },
                  })
                }
                placeholder="Enter the URL suffix value"
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-muted-foreground text-[10px] break-words">
                Final URL:{' '}
                {slot.url.replace(
                  /\{\{1\}\}/g,
                  sendExtras.buttonParams[slot.index] || '{{1}}'
                )}
              </p>
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            One link value for the whole broadcast. Every recipient gets the
            same button URL.
          </p>
        </div>
      )}

      {plan.isAuthentication && (
        <div className="border-border bg-card/50 space-y-3 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            Authentication Code
          </p>
          <p className="text-muted-foreground text-xs">
            Meta owns the wording. This code fills the message and the copy
            button.
          </p>
          <Input
            value={sendExtras.authCode ?? ''}
            onChange={(e) =>
              onSendExtrasChange({ ...sendExtras, authCode: e.target.value })
            }
            placeholder="e.g. 428913"
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )}

      {plan.commerce === 'catalog' && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <CatalogThumbnailField
            value={sendExtras.catalogThumbnailProductId ?? ''}
            onChange={(next) =>
              onSendExtrasChange({
                ...sendExtras,
                catalogThumbnailProductId: next,
              })
            }
          />
        </div>
      )}

      {plan.commerce === 'mpm' && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <MpmFields
            value={sendExtras.mpm ?? EMPTY_MPM}
            onChange={(next: MpmValues) =>
              onSendExtrasChange({ ...sendExtras, mpm: next })
            }
          />
        </div>
      )}

      {plan.commerce === 'order_details' && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <OrderDetailsFields
            value={sendExtras.orderDetails ?? EMPTY_ORDER_DETAILS}
            onChange={(next: OrderDetailsValues) =>
              onSendExtrasChange({ ...sendExtras, orderDetails: next })
            }
          />
        </div>
      )}

      {plan.isOrderStatus && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <OrderStatusFields
            referenceId={sendExtras.orderStatus?.orderReferenceId ?? ''}
            status={sendExtras.orderStatus?.orderStatus ?? ''}
            description={sendExtras.orderStatus?.orderStatusDescription ?? ''}
            onChange={(patch) =>
              onSendExtrasChange({
                ...sendExtras,
                orderStatus: {
                  orderReferenceId:
                    patch.orderReferenceId ??
                    sendExtras.orderStatus?.orderReferenceId ??
                    '',
                  orderStatus:
                    (patch.orderStatus as OrderStatusOption | '') ??
                    sendExtras.orderStatus?.orderStatus ??
                    '',
                  orderStatusDescription:
                    patch.orderStatusDescription ??
                    sendExtras.orderStatus?.orderStatusDescription ??
                    '',
                },
              })
            }
          />
        </div>
      )}

      {placeholders.length === 0 &&
      !mediaHeaderType &&
      !plan.offer &&
      plan.cards.length === 0 &&
      plan.urlButtons.length === 0 &&
      !plan.isAuthentication &&
      !plan.commerce &&
      !plan.isOrderStatus ? (
        <div className="border-border bg-card/50 rounded-xl border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            {t('personalize.noPreview')}
          </p>
        </div>
      ) : placeholders.length === 0 ? null : (
        <div className="space-y-4">
          {placeholders.map((placeholder) => {
            const key = placeholder.replace(/^\{\{|\}\}$/g, '');
            const mapping = variables[key] ?? { type: 'static', value: '' };

            return (
              <div
                key={placeholder}
                className="border-border bg-card/50 rounded-xl border p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="bg-primary/10 text-primary inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium">
                    {placeholder}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                      {t('personalize.type')}
                    </label>
                    <Select
                      value={mapping.type}
                      onValueChange={(val) =>
                        updateVariable(key, {
                          type: val as VariableType,
                          value: '',
                        })
                      }
                    >
                      <SelectTrigger className="border-border bg-muted text-foreground w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="static">
                          {t('personalize.typeStatic')}
                        </SelectItem>
                        <SelectItem value="field">
                          {t('personalize.typeContact')}
                        </SelectItem>
                        <SelectItem value="custom_field">
                          {t('personalize.typeCustom')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                      {mapping.type === 'static'
                        ? t('personalize.staticValue')
                        : t('personalize.contactField')}
                    </label>
                    {mapping.type === 'static' ? (
                      <Input
                        value={mapping.value}
                        onChange={(e) =>
                          updateVariable(key, { value: e.target.value })
                        }
                        placeholder="Enter value..."
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    ) : mapping.type === 'field' ? (
                      <Select
                        value={mapping.value || ''}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="border-border bg-muted text-foreground w-full">
                          <SelectValue
                            placeholder={t('personalize.selectContactField')}
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {contactFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {t(`personalize.fieldMap.${field.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={mapping.value || ''}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="border-border bg-muted text-foreground w-full">
                          <SelectValue
                            placeholder={
                              loadingFields
                                ? 'Loading…'
                                : customFields.length === 0
                                  ? 'No custom fields'
                                  : 'Select custom field…'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {customFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Preview — rendered as a WhatsApp-style bubble so the user
          sees approximately what the recipient will see. */}
      <div className="border-border bg-card/50 rounded-xl border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="text-primary h-4 w-4" />
          <p className="text-foreground text-sm font-medium">
            {t('personalize.preview')}
          </p>
          <span className="text-muted-foreground text-xs">
            ({previewLabel})
          </span>
          {loadingPreview && (
            <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
          )}
        </div>
        <div className="min-w-0 overflow-hidden">
          <WhatsAppPreview
            definition={definitionFromRow(template)}
            values={previewValues}
            // The media chosen for this broadcast, so the preview shows
            // what recipients will get rather than the approved sample.
            headerMediaUrl={headerMediaUrl}
            cardMediaUrls={sendExtras.cards.map((c) => c?.headerMediaUrl)}
          />
        </div>
      </div>

      {unmappedKeys.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Map every placeholder before continuing — still missing{' '}
          <span className="font-mono font-semibold">
            {unmappedKeys.join(', ')}
          </span>
          . Otherwise those placeholders will ship to Meta as empty strings.
        </div>
      )}

      {missingExtras.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {`Still needed before this can send: ${missingExtras.join(', ')}.`}
        </div>
      )}

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={
            unmappedKeys.length > 0 ||
            headerMediaError !== null ||
            missingExtras.length > 0
          }
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
