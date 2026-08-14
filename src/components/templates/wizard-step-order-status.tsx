"use client";

// ============================================================
// Wizard step 2, ORDER STATUS variant.
//
// The narrowest template Meta offers: a body, an optional footer, and
// nothing else. No header, no buttons — the order card is rendered by
// WhatsApp from the order the message references.
//
// Its own step rather than the Default form with fields hidden, because
// "the same form minus half its controls" invites someone to re-enable a
// control Meta will reject.
//
// ─── The part that surprises people ───────────────────────────
//
// What makes this template special is invisible in its content. Sending
// one UPDATES AN EXISTING ORDER, so every send needs the reference id of
// an order_details message plus the new status. That is collected at send
// time, and stated here so the choice of template type is informed.
//
// https://developers.facebook.com/docs/whatsapp/cloud-api/payments-api/payments-in/orderstatustemplate
// ============================================================

import { Info, PackageCheck } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TEMPLATE_LIMITS } from '@/lib/whatsapp/template-limits';
import { extractVariableIndices } from '@/lib/whatsapp/template-variables';
import {
  definitionFromDraft,
  draftBodyValues,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';

export function WizardStepOrderStatus({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const bodyVarCount = extractVariableIndices(draft.bodyText).length;
  const bodySamples = Array.from(
    { length: bodyVarCount },
    (_, i) => draft.bodySamples[i] ?? '',
  );

  // Always Utility — Meta will not accept an order-status template in any
  // other category, so this is not a choice the operator is offered.
  const definition = definitionFromDraft(draft, 'Utility', 'order_status');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sending this updates an order the customer already has. Each send
            needs the reference id of an order message plus the new status, so
            it only works once you are creating orders through WhatsApp Pay.
          </p>
        </div>

        {/* ---- Name + language ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="os-name">Name your template</Label>
              <Input
                id="os-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder="order_shipped_update"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os-lang">Select language</Label>
              <Input
                id="os-lang"
                value={draft.language}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* ---- Message content ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Message content
            </h2>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="os-body">Body</Label>
            <Textarea
              id="os-body"
              rows={4}
              value={draft.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.bodyMaxLength}
              placeholder="Your order {{1}} has shipped and should arrive by {{2}}."
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
            <Label htmlFor="os-footer">Footer · optional</Label>
            <Input
              id="os-footer"
              value={draft.footerText}
              onChange={(e) => onChange({ footerText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.footerMaxLength}
              placeholder="Reply here if anything looks wrong"
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            No header and no buttons — Meta does not allow either on this
            template type, and the order card comes from WhatsApp.
          </p>
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
            className="mt-3"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            The order card the customer sees above this text is rendered by
            WhatsApp from the order itself, so it is not previewed here.
          </p>
        </div>
      </aside>
    </div>
  );
}
