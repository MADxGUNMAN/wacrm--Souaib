"use client";

// ============================================================
// Wizard step 2, CALLING PERMISSION REQUEST variant.
//
// Asks the customer for consent to be called on WhatsApp. They answer with
// one of three options WhatsApp supplies itself — Allow, Temporarily allow
// (one week), or Not at this time — which is why THIS TEMPLATE HAS NO
// BUTTONS OF ITS OWN. Sending a buttons array is rejected.
//
// Needs voice calling enabled on the phone number in WhatsApp Manager.
// Meta approves the template either way, so the requirement is stated here
// rather than discovered when the request never reaches anyone.
// ============================================================

import { useMemo } from 'react';
import { Info, PhoneCall } from 'lucide-react';

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
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';

export function WizardStepCallPermission({
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
  const headerVarCount = useMemo(
    () =>
      draft.headerFormat === 'text'
        ? extractVariableIndices(draft.headerContent).length
        : 0,
    [draft.headerFormat, draft.headerContent],
  );

  // Always Utility — Meta accepts this sub-category nowhere else.
  const definition = definitionFromDraft(
    draft,
    'Utility',
    'calling_permission_request',
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Needs WhatsApp calling enabled on your phone number in WhatsApp
            Manager. The customer replies with Allow, Temporarily allow (one
            week) or Not at this time — WhatsApp adds those options, so this
            template has no buttons to set.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="cp-name">Name your template</Label>
              <Input
                id="cp-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder="call_permission_request"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-lang">Select language</Label>
              <Input
                id="cp-lang"
                value={draft.language}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <PhoneCall className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Message content
            </h2>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="cp-header-format">
              Header <span className="text-muted-foreground">· optional</span>
            </Label>
            <Select
              value={draft.headerFormat === 'text' ? 'text' : 'none'}
              onValueChange={(v) =>
                onChange({ headerFormat: v === 'text' ? 'text' : 'none' })
              }
            >
              <SelectTrigger id="cp-header-format" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Text only — Meta does not allow an image, video or document
              header on this type.
            </p>
            {draft.headerFormat === 'text' ? (
              <Input
                value={draft.headerContent}
                onChange={(e) => onChange({ headerContent: e.target.value })}
                maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                placeholder="Can we call you?"
                aria-label="Header text"
              />
            ) : null}
            {headerVarCount > 0 ? (
              <Input
                value={draft.headerSample}
                onChange={(e) => onChange({ headerSample: e.target.value })}
                placeholder="Example value for the header variable"
                aria-label="Header sample value"
              />
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            <Label htmlFor="cp-body">Body</Label>
            <Textarea
              id="cp-body"
              rows={4}
              value={draft.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.bodyMaxLength}
              placeholder="Hi {{1}}, may we call you on WhatsApp about your order? It is quicker than typing."
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
            <Label htmlFor="cp-footer">
              Footer <span className="text-muted-foreground">· optional</span>
            </Label>
            <Input
              id="cp-footer"
              value={draft.footerText}
              onChange={(e) => onChange({ footerText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.footerMaxLength}
              placeholder="You can change this any time"
            />
          </div>
        </section>
      </div>

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
            WhatsApp adds the Allow / Temporarily allow / Not at this time
            options below your text, so they are not shown here.
          </p>
        </div>
      </aside>
    </div>
  );
}
