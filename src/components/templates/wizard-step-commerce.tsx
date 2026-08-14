"use client";

// ============================================================
// Wizard step 2 for the three shapes whose button is fixed by their type:
//
//   catalogue     — one CATALOG button, opens the whole product catalogue
//   multi_product — one MPM button, opens a curated product list
//   order_details — one ORDER_DETAILS button, an invoice paid in WhatsApp
//
// One step, not three, because they differ only in which components Meta
// permits and what the button says. Three near-copies would be three
// places to fix when a rule changes.
//
// Each carries an ACCOUNT REQUIREMENT the template cannot satisfy on its
// own — a linked catalogue, or WhatsApp Pay. Meta approves the template
// regardless and the button then fails, so the requirement is stated here
// rather than discovered from a customer complaint.
// ============================================================

import { useMemo } from 'react';
import { Info, ShoppingBag } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TEMPLATE_LIMITS } from '@/lib/whatsapp/template-limits';
import { extractVariableIndices } from '@/lib/whatsapp/template-variables';
import {
  definitionFromDraft,
  draftBodyValues,
  draftHeaderValues,
  type CommerceKind,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import type { TemplateCategory } from '@/lib/whatsapp/template-types-catalogue';

const COPY: Record<
  CommerceKind,
  {
    title: string;
    note: string;
    buttonLabel: string;
    buttonPlaceholder: string;
    /** 'none' — Meta builds it; 'required' — Meta rejects without it. */
    header: 'none' | 'required' | 'optional';
  }
> = {
  catalogue: {
    title: 'Catalogue message',
    note: 'Needs a product catalogue linked to your WhatsApp Business account in Meta Commerce Manager. The header image is taken from a product, so there is no header to set here.',
    buttonLabel: 'Button label',
    buttonPlaceholder: 'View catalogue',
    header: 'none',
  },
  multi_product: {
    title: 'Multi-product message',
    note: 'Needs a linked catalogue with inventory. You choose which products appear each time you send — the template stores only the button, up to 30 products across 10 sections.',
    buttonLabel: 'Button label',
    buttonPlaceholder: 'View items',
    header: 'required',
  },
  order_details: {
    title: 'Order details (invoice)',
    note: 'Needs WhatsApp Pay set up and approved on your WhatsApp Business account. The invoice itself — items, totals, reference id — is filled in each time you send, because it differs per customer.',
    buttonLabel: 'Button label',
    buttonPlaceholder: 'Review and pay',
    header: 'optional',
  },
};

export function WizardStepCommerce({
  draft,
  category,
  kind,
  onChange,
}: {
  draft: WizardDraft;
  category: TemplateCategory;
  kind: CommerceKind;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const copy = COPY[kind];

  const bodyVarCount = extractVariableIndices(draft.bodyText).length;
  const bodySamples = Array.from(
    { length: bodyVarCount },
    (_, i) => draft.bodySamples[i] ?? '',
  );
  const headerVarCount = useMemo(
    () =>
      draft.headerFormat === 'text'
        ? extractVariableIndices(draft.headerContent).length
        : 0,
    [draft.headerFormat, draft.headerContent],
  );

  const templateType =
    kind === 'catalogue'
      ? 'catalogue'
      : kind === 'multi_product'
        ? 'multi_product'
        : 'order_details';

  const definition = definitionFromDraft(draft, category, templateType);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{copy.note}</p>
        </div>

        {/* ---- Name + language ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="cm-name">Name your template</Label>
              <Input
                id="cm-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder={
                  kind === 'order_details' ? 'payment_request' : 'shop_our_range'
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-lang">Select language</Label>
              <Input
                id="cm-lang"
                value={draft.language}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* ---- Content ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {copy.title}
            </h2>
          </div>

          {/* Header. Catalogue has none at all; MPM must have text; order
              details may have text or media. */}
          {copy.header === 'required' ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="cm-header">Header text</Label>
              <Input
                id="cm-header"
                value={draft.headerContent}
                onChange={(e) =>
                  // Forced to 'text': Meta requires a text header on this
                  // shape, so the format is not a choice to offer.
                  onChange({ headerFormat: 'text', headerContent: e.target.value })
                }
                maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                placeholder="Forget something, {{1}}?"
              />
              <p className="text-xs text-muted-foreground">
                Required — Meta rejects a multi-product template without one.
                One variable allowed.
              </p>
              {headerVarCount > 0 ? (
                <Input
                  value={draft.headerSample}
                  onChange={(e) => onChange({ headerSample: e.target.value })}
                  placeholder="Example value for the header variable"
                  aria-label="Header sample value"
                />
              ) : null}
            </div>
          ) : null}

          {copy.header === 'optional' ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="cm-header-format">
                Header <span className="text-muted-foreground">· optional</span>
              </Label>
              <Select
                value={draft.headerFormat}
                onValueChange={(v) =>
                  onChange({
                    headerFormat: (v || 'none') as WizardDraft['headerFormat'],
                  })
                }
              >
                <SelectTrigger id="cm-header-format" className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>
              {draft.headerFormat === 'text' ? (
                <Input
                  value={draft.headerContent}
                  onChange={(e) => onChange({ headerContent: e.target.value })}
                  maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                  placeholder="Your invoice"
                  aria-label="Header text"
                />
              ) : null}
              {draft.headerFormat === 'image' ||
              draft.headerFormat === 'document' ? (
                <Input
                  value={draft.headerMediaUrl}
                  onChange={(e) => onChange({ headerMediaUrl: e.target.value })}
                  placeholder={`https://example.com/sample.${draft.headerFormat === 'image' ? 'jpg' : 'pdf'}`}
                  aria-label="Header media sample URL"
                />
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 space-y-2">
            <Label htmlFor="cm-body">Body</Label>
            <Textarea
              id="cm-body"
              rows={4}
              value={draft.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.bodyMaxLength}
              placeholder={
                kind === 'order_details'
                  ? 'Hi {{1}}, here is your invoice. Tap below to pay securely in WhatsApp.'
                  : 'Shop our latest range right here on WhatsApp. Use code {{1}} for 10% off.'
              }
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {draft.bodyText.length}/{TEMPLATE_LIMITS.bodyMaxLength}
            </p>

            {bodyVarCount > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">
                  Example values
                </p>
                {bodySamples.map((val, i) => (
                  <Input
                    key={i}
                    value={val}
                    onChange={(e) => {
                      const next = [...bodySamples];
                      next[i] = e.target.value;
                      onChange({ bodySamples: next });
                    }}
                    placeholder={`Example for {{${i + 1}}}`}
                    aria-label={`Example value ${i + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="cm-footer">
              Footer <span className="text-muted-foreground">· optional</span>
            </Label>
            <Input
              id="cm-footer"
              value={draft.footerText}
              onChange={(e) => onChange({ footerText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.footerMaxLength}
              placeholder="Prices include GST"
            />
          </div>

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="cm-button">{copy.buttonLabel}</Label>
            <Input
              id="cm-button"
              value={draft.commerceButtonText}
              onChange={(e) => onChange({ commerceButtonText: e.target.value })}
              maxLength={25}
              placeholder={copy.buttonPlaceholder}
              className="w-full sm:w-64"
            />
            <p className="text-xs text-muted-foreground">
              This is the only button — Meta does not allow others alongside
              it.
            </p>
          </div>
        </section>
      </div>

      {/* ---- Preview ---- */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Template preview
          </h3>
          <WhatsAppPreview
            definition={definition}
            values={draftBodyValues({ ...draft, bodySamples })}
            headerValues={draftHeaderValues(draft)}
            className="mt-3"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {kind === 'order_details'
              ? 'The invoice card the customer taps through to is drawn by WhatsApp from the order you send, so it is not previewed here.'
              : 'The product list WhatsApp shows when the button is tapped comes from your catalogue, so it is not previewed here.'}
          </p>
        </div>
      </aside>
    </div>
  );
}
