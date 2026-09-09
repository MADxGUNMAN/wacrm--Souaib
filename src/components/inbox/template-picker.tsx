'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ChevronRight, LayoutTemplate, Loader2 } from 'lucide-react';
import { definitionFromRow } from '@/lib/whatsapp/template-definition';
import { positionalValues } from '@/lib/whatsapp/template-preview-text';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import { MediaUploadField } from '@/components/media/media-upload-field';
import { templateSendability } from '@/lib/whatsapp/template-sendability';
import {
  EMPTY_HEADER_LOCATION,
  EMPTY_MPM,
  EMPTY_ORDER_DETAILS,
  buildSendPlan,
  defaultOfferExpiryLocal,
  localInputToMs,
  missingSendValues,
  type CardValues,
  type HeaderLocationValues,
  type MpmValues,
  type OrderDetailsValues,
  type OrderStatusOption,
  type SendValues,
} from '@/lib/whatsapp/template-send-inputs';
import {
  CarouselCardFields,
  CatalogThumbnailField,
  HeaderLocationFields,
  MpmFields,
  OfferExpiryField,
  OrderDetailsFields,
  OrderStatusFields,
} from '@/components/templates/send-time-fields';
import { useTranslations } from 'next-intl';

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  headerMediaUrl?: string;
  buttonParams?: Record<number, string>;
  /** Limited-time offer: the per-message deadline, in epoch ms. */
  offerExpiresAtMs?: number;
  /** Carousel: per-card values, in card order. */
  cards?: CardValues[];
  /** Location header: the map pin for this message. */
  headerLocation?: HeaderLocationValues;
  /** NAMED templates: body values keyed by parameter name. */
  namedBody?: Record<string, string>;
  /** Order status: which order this send updates, and the new status. */
  orderReferenceId?: string;
  orderStatus?: OrderStatusOption | '';
  orderStatusDescription?: string;
}

/**
 * Build the `POST /api/whatsapp/send` body for a template send.
 *
 * ─── Why this is a function and not inline JSON ────────────────────
 *
 * `TemplateSendValues` has eleven fields, and a caller that lists them
 * by hand silently drops whatever it forgot. That has now happened
 * twice: the inbox once omitted `headerMediaUrl`, and the contacts panel
 * shipped only `body`, `headerText` and `buttonParams` — so every
 * carousel sent from a contact failed with "Card 1 needs a media link or
 * id at send time" while the identical template sent fine from the
 * inbox. Named templates, limited-time offers, location headers and
 * order-status templates were all broken the same way and nobody had hit
 * them yet.
 *
 * One builder means the next surface that sends a template cannot repeat
 * it, and a twelfth field is picked up everywhere for free.
 */
export function buildTemplateSendRequest(args: {
  template: Pick<MessageTemplate, 'name' | 'language'>;
  values: TemplateSendValues;
  /**
   * An existing thread, or a contact with no conversation yet — the send
   * route find-or-creates one for `contact_id`.
   */
  target: { conversationId: string } | { contactId: string };
  /** Rendered body, for the optimistic bubble and the list preview. */
  contentText?: string;
}): Record<string, unknown> {
  const { template, values, target, contentText } = args;
  return {
    ...('conversationId' in target
      ? { conversation_id: target.conversationId }
      : { contact_id: target.contactId }),
    message_type: 'template',
    template_name: template.name,
    template_language: template.language,
    // Spread, never field-by-field. This is the whole point of the
    // helper: header media, carousel cards, offer expiry, location pins,
    // named body params and order references all live in here.
    template_message_params: values,
    // Mirrored under the legacy positional shape too, so the route can
    // still fall back when the template row is not found locally.
    template_params: values.body,
    ...(contentText ? { content_text: contentText } : {}),
  };
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerProps) {
  const t = useTranslations('Inbox.templatePicker');

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState<string>('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>('');
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  /** datetime-local string, converted to ms only on confirm. */
  const [offerExpiry, setOfferExpiry] = useState<string>('');
  const [cardValues, setCardValues] = useState<CardValues[]>([]);
  const [orderStatusValues, setOrderStatusValues] = useState<{
    orderReferenceId: string;
    orderStatus: OrderStatusOption | '';
    orderStatusDescription: string;
  }>({ orderReferenceId: '', orderStatus: '', orderStatusDescription: '' });
  const [headerLocation, setHeaderLocation] = useState<HeaderLocationValues>(
    EMPTY_HEADER_LOCATION
  );
  /** NAMED templates only: values keyed by parameter name. */
  const [namedBody, setNamedBody] = useState<Record<string, string>>({});
  const [catalogThumbnail, setCatalogThumbnail] = useState('');
  const [mpmValues, setMpmValues] = useState<MpmValues>(EMPTY_MPM);
  const [orderDetailsValues, setOrderDetailsValues] =
    useState<OrderDetailsValues>(EMPTY_ORDER_DETAILS);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      // Scope by RLS (message_templates_select → is_account_member), NOT by
      // user_id. Templates are account-owned, so filtering on the caller's
      // user_id hid templates that a teammate created — leaving them unable
      // to send approved templates in a shared account.
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error('Failed to fetch templates:', error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetSelection() {
    setSelected(null);
    setParams([]);
    setHeaderText('');
    setHeaderMediaUrl('');
    setButtonParams({});
    setOfferExpiry('');
    setCardValues([]);
    setOrderStatusValues({
      orderReferenceId: '',
      orderStatus: '',
      orderStatusDescription: '',
    });
    setHeaderLocation(EMPTY_HEADER_LOCATION);
    setNamedBody({});
    setCatalogThumbnail('');
    setMpmValues(EMPTY_MPM);
    setOrderDetailsValues(EMPTY_ORDER_DETAILS);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    // The plan knows every shape, including carousels and offers, which
    // the old flat-column slot collector could not see at all.
    const plan = buildSendPlan(template);
    if (plan.needsNoInput) {
      onSelect(template, { body: [] });
      handleOpenChange(false);
      return;
    }
    setSelected(template);
    setParams(new Array(plan.bodyVarCount).fill(''));
    setHeaderText('');
    setHeaderMediaUrl(plan.headerMedia?.defaultUrl ?? '');
    setButtonParams({});
    // An offer needs a deadline and there is no defensible default, but an
    // empty datetime field is fiddly to fill from scratch — seed 24 hours
    // out, which the operator can change and must consciously accept.
    setOfferExpiry(plan.offer ? defaultOfferExpiryLocal(24) : '');
    setCardValues(plan.cards.map(() => ({})));
    setOrderStatusValues({
      orderReferenceId: '',
      // Left blank on purpose: a default status would let someone tell a
      // customer their order had shipped by not reading the form.
      orderStatus: '',
      orderStatusDescription: '',
    });
    setHeaderLocation(EMPTY_HEADER_LOCATION);
    setNamedBody({});
  }

  /** The values as the send layer wants them. Shared by confirm and the gate. */
  const sendValues: SendValues = useMemo(() => {
    const trimmedButtons = Object.fromEntries(
      Object.entries(buttonParams)
        .filter(([, v]) => v.trim().length > 0)
        .map(([k, v]) => [Number(k), v.trim()])
    );
    return {
      body: params,
      ...(headerText.trim() ? { headerText: headerText.trim() } : {}),
      ...(headerMediaUrl.trim()
        ? { headerMediaUrl: headerMediaUrl.trim() }
        : {}),
      ...(Object.keys(trimmedButtons).length > 0
        ? { buttonParams: trimmedButtons }
        : {}),
      ...(offerExpiry ? { offerExpiresAtMs: localInputToMs(offerExpiry) } : {}),
      ...(cardValues.length > 0 ? { cards: cardValues } : {}),
      ...(orderStatusValues.orderReferenceId.trim()
        ? { orderReferenceId: orderStatusValues.orderReferenceId.trim() }
        : {}),
      ...(orderStatusValues.orderStatus
        ? { orderStatus: orderStatusValues.orderStatus }
        : {}),
      ...(orderStatusValues.orderStatusDescription.trim()
        ? {
            orderStatusDescription:
              orderStatusValues.orderStatusDescription.trim(),
          }
        : {}),
      // Passed unconditionally rather than gated on the plan: the send
      // builder only reads these for the shapes that use them, and gating
      // here would mean referencing `plan` before it is declared below.
      headerLocation,
      namedBody,
      ...(catalogThumbnail.trim()
        ? { catalogThumbnailProductId: catalogThumbnail.trim() }
        : {}),
      mpm: mpmValues,
      orderDetails: orderDetailsValues,
    };
  }, [
    params,
    headerText,
    headerMediaUrl,
    buttonParams,
    offerExpiry,
    cardValues,
    orderStatusValues,
    headerLocation,
    namedBody,
    catalogThumbnail,
    mpmValues,
    orderDetailsValues,
  ]);

  function confirm() {
    if (!selected) return;
    onSelect(selected, { ...sendValues, body: params });
    handleOpenChange(false);
  }

  const plan = useMemo(
    () => (selected ? buildSendPlan(selected) : null),
    [selected]
  );
  // One gate, and the same rules the send builder enforces — so a send
  // that passes here cannot throw for a missing value on the server.
  const missing = useMemo(
    () => (plan ? missingSendValues(plan, sendValues) : []),
    [plan, sendValues]
  );
  const canConfirm = !!selected && missing.length === 0;

  function patchCard(cardIndex: number, patch: CardValues) {
    setCardValues((prev) => {
      const next = [...prev];
      next[cardIndex] = { ...(next[cardIndex] ?? {}), ...patch };
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground flex items-center gap-2">
            <LayoutTemplate className="text-primary h-4 w-4" />
            {selected ? selected.name : t('sendTemplate')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected ? t('fillPlaceholders') : t('pickTemplate')}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-primary h-5 w-5 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="border-border bg-background/50 rounded-md border p-6 text-center">
                <p className="text-popover-foreground text-sm">
                  {t('noApprovedTemplates')}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('noApprovedTemplatesHint')}
                </p>
              </div>
            ) : (
              templates.map((t) => {
                // Approved is not the same as sendable — see
                // template-sendability.ts. Disabled with the reason, not
                // hidden, so an approved template never appears to vanish.
                const verdict = templateSendability(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => verdict.sendable && pickTemplate(t)}
                    disabled={!verdict.sendable}
                    aria-disabled={!verdict.sendable}
                    title={verdict.reason}
                    className={
                      verdict.sendable
                        ? 'border-border bg-background/50 hover:border-primary/40 hover:bg-popover w-full min-w-0 overflow-hidden rounded-md border p-3 text-left transition-colors'
                        : 'border-border bg-background/30 w-full min-w-0 cursor-not-allowed overflow-hidden rounded-md border p-3 text-left opacity-60'
                    }
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="text-popover-foreground min-w-0 text-sm font-medium break-words">
                            {t.name}
                          </p>
                          <Badge className="border-primary/30 bg-primary/20 text-primary border text-[10px]">
                            {t.category}
                          </Badge>
                          {t.language && (
                            <span className="text-muted-foreground text-[10px] uppercase">
                              {t.language}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs break-words">
                          {t.body_text}
                        </p>
                      </div>
                      <ChevronRight className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                    </div>
                    {!verdict.sendable && verdict.reason ? (
                      <p className="mt-1.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-500">
                        {verdict.reason}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          // Height-capped and scrollable, exactly like the template list
          // branch above. Without this the dialog grew past the viewport:
          // DialogContent is centred with -translate-y-1/2 and sets no
          // max-height, so a tall child overflows the top AND bottom and
          // the footer — including Send — ends up off-screen with no way
          // to scroll to it. A template with a preview, five body
          // variables and a URL button value is already past that point.
          <div className="max-h-[60vh] min-w-0 space-y-3 overflow-y-auto">
            {/* The real WhatsApp rendering, not a text substitution.
                This used to be plain body text with {{n}} swapped out,
                which hid the header, the buttons and any formatting — so
                an agent could send a template without ever seeing that
                it carried a "Call now" button. */}
            <div className="min-w-0 overflow-hidden">
              <p className="text-muted-foreground mb-1 text-xs">
                {t('preview')}
              </p>
              {/* Named templates resolve by name, so the values map is
                  already in the right shape; positional ones need the
                  array turned into "1" / "2" keys. */}
              <WhatsAppPreview
                definition={definitionFromRow(selected)}
                values={
                  plan && plan.bodyParamNames.length > 0
                    ? namedBody
                    : positionalValues(params)
                }
                headerValues={positionalValues([headerText])}
                // What the operator just uploaded, so the preview shows the
                // image that will actually be sent rather than the sample
                // Meta approved — which for these templates is nothing.
                headerMediaUrl={headerMediaUrl}
                cardMediaUrls={cardValues.map((c) => c.headerMediaUrl)}
              />
            </div>
            {plan && plan.headerVarCount > 0 && (
              <div className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  {`Header {{1}}`}
                </Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder={t('headerValuePlaceholder')}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}
            {plan?.headerMedia && (
              <div className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  {`Header ${plan.headerMedia.format.toLowerCase()}`}
                </Label>
                <MediaUploadField
                  kind={
                    plan.headerMedia.format.toLowerCase() as
                      'image' | 'video' | 'document'
                  }
                  purpose="send"
                  compact
                  value={headerMediaUrl}
                  onChange={setHeaderMediaUrl}
                  urlPlaceholder={
                    plan.headerMedia.defaultUrl ||
                    `https://example.com/sample.${plan.headerMedia.format === 'IMAGE' ? 'png' : plan.headerMedia.format === 'VIDEO' ? 'mp4' : 'pdf'}`
                  }
                  hint={
                    plan.headerMedia.defaultUrl
                      ? 'Leave as-is to use the file approved with the template.'
                      : undefined
                  }
                />
              </div>
            )}
            {plan?.isAuthentication && (
              <div className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  One-time code
                </Label>
                <Input
                  value={params[0] ?? ''}
                  onChange={(e) => setParams([e.target.value])}
                  placeholder="e.g. 428913"
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-muted-foreground text-[10px]">
                  Meta owns the wording. This code fills the message and the
                  copy button.
                </p>
              </div>
            )}
            {/* NAMED templates are keyed by name, so the label IS the
                variable — no positional index to line up. */}
            {plan?.bodyParamNames.map((name) => (
              <div key={name} className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  {`{{${name}}}`}
                </Label>
                <Input
                  value={namedBody[name] ?? ''}
                  onChange={(e) =>
                    setNamedBody((prev) => ({
                      ...prev,
                      [name]: e.target.value,
                    }))
                  }
                  placeholder={name.replace(/_/g, ' ')}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {!plan?.isAuthentication &&
              Array.from({ length: plan?.bodyVarCount ?? 0 }, (_, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-popover-foreground text-xs">{`Body {{${i + 1}}}`}</Label>
                  <Input
                    value={params[i] ?? ''}
                    onChange={(e) => {
                      const next = [...params];
                      next[i] = e.target.value;
                      setParams(next);
                    }}
                    placeholder={t('bodyValuePlaceholder', {
                      val: `{{${i + 1}}}`,
                    })}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              ))}
            {plan?.offer && (
              <OfferExpiryField
                offer={plan.offer}
                value={offerExpiry}
                onChange={setOfferExpiry}
                code={
                  plan.offer.code
                    ? (buttonParams[plan.offer.code.index] ?? '')
                    : ''
                }
                onCodeChange={(next) => {
                  const idx = plan.offer?.code?.index;
                  if (idx === undefined) return;
                  setButtonParams((prev) => ({ ...prev, [idx]: next }));
                }}
              />
            )}
            {plan?.commerce === 'catalog' && (
              <CatalogThumbnailField
                value={catalogThumbnail}
                onChange={setCatalogThumbnail}
              />
            )}
            {plan?.commerce === 'mpm' && (
              <MpmFields value={mpmValues} onChange={setMpmValues} />
            )}
            {plan?.commerce === 'order_details' && (
              <OrderDetailsFields
                value={orderDetailsValues}
                onChange={setOrderDetailsValues}
              />
            )}
            {plan?.needsHeaderLocation && (
              <HeaderLocationFields
                value={headerLocation}
                onChange={setHeaderLocation}
              />
            )}
            {plan?.isOrderStatus && (
              <OrderStatusFields
                referenceId={orderStatusValues.orderReferenceId}
                status={orderStatusValues.orderStatus}
                description={orderStatusValues.orderStatusDescription}
                onChange={(patch) =>
                  setOrderStatusValues((prev) => ({
                    ...prev,
                    ...(patch.orderReferenceId !== undefined
                      ? { orderReferenceId: patch.orderReferenceId }
                      : {}),
                    ...(patch.orderStatus !== undefined
                      ? { orderStatus: patch.orderStatus }
                      : {}),
                    ...(patch.orderStatusDescription !== undefined
                      ? {
                          orderStatusDescription: patch.orderStatusDescription,
                        }
                      : {}),
                  }))
                }
              />
            )}
            {plan && plan.cards.length > 0 && (
              <CarouselCardFields
                cards={plan.cards}
                values={cardValues}
                onChange={patchCard}
              />
            )}
            {plan?.urlButtons.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  {`URL button "${slot.text}" — value for `}
                  {`{{1}}`}
                </Label>
                <Input
                  value={buttonParams[slot.index] ?? ''}
                  onChange={(e) =>
                    setButtonParams((prev) => ({
                      ...prev,
                      [slot.index]: e.target.value,
                    }))
                  }
                  placeholder={t('urlSuffixValuePlaceholder')}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-muted-foreground text-[10px] break-words">
                  {t('finalUrl', {
                    url: slot.url.replace(
                      /\{\{1\}\}/g,
                      buttonParams[slot.index] || '{{1}}'
                    ),
                  })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Say WHY Send is disabled. A greyed-out button with no
            explanation on a ten-card carousel is a guessing game. */}
        {selected && missing.length > 0 ? (
          <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-500">
            {`Still needed: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}.`}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('back')}
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t('send')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
