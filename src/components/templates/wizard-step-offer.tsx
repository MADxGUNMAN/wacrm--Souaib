'use client';

// ============================================================
// Wizard step 2, LIMITED-TIME OFFER variant.
//
// Its own form because the constraints differ from a normal marketing
// template in ways that matter while typing, not afterwards:
//
//   - The body limit is 600 characters, not 1024.
//   - No footer is permitted at all.
//   - A copy-code button is mandatory; a website button is the only other
//     button allowed.
//   - The countdown's expiry is set per MESSAGE, not on the template.
//
// The last one is the most surprising, so it is stated in the form rather
// than discovered when a send fails for want of an expiry.
// ============================================================

import { Clock, Info } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LTO_LIMITS } from '@/lib/whatsapp/template-limits';
import { extractVariableIndices } from '@/lib/whatsapp/template-variables';
import {
  definitionFromDraft,
  draftBodyValues,
  type OfferDraft,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import { cn } from '@/lib/utils';

export function WizardStepOffer({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const offer = draft.offer;
  const patchOffer = (fields: Partial<OfferDraft>) =>
    onChange({ offer: { ...offer, ...fields } });

  const bodyVarCount = extractVariableIndices(draft.bodyText).length;
  const bodySamples = Array.from(
    { length: bodyVarCount },
    (_, i) => draft.bodySamples[i] ?? '',
  );
  const bodyTooLong = draft.bodyText.length > LTO_LIMITS.bodyMaxLength;
  const urlVars = extractVariableIndices(offer.url).length;

  const definition = definitionFromDraft(
    draft,
    'Marketing',
    'limited_time_offer',
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            WhatsApp Web and Desktop cannot show these. Those recipients get a
            note saying a message arrived that they cannot view — so use this
            for audiences you expect to be on a phone.
          </p>
        </div>

        {/* ---- Name + language ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="lto-name">Name your template</Label>
              <Input
                id="lto-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder="diwali_flash_sale"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lto-lang">Select language</Label>
              <Input
                id="lto-lang"
                value={draft.language}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* ---- The offer ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">The offer</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lto-label">Offer label</Label>
              <Input
                id="lto-label"
                value={offer.text}
                onChange={(e) => patchOffer({ text: e.target.value })}
                maxLength={LTO_LIMITS.offerTextMaxLength}
                placeholder="Expiring offer!"
              />
              <p className="text-xs text-muted-foreground">
                {offer.text.length}/{LTO_LIMITS.offerTextMaxLength} — very
                short, it sits above the message.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lto-code">Example offer code</Label>
              <Input
                id="lto-code"
                value={offer.code}
                onChange={(e) =>
                  patchOffer({ code: e.target.value.toUpperCase() })
                }
                maxLength={LTO_LIMITS.offerCodeMaxLength}
                placeholder="DIWALI25"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {offer.code.length}/{LTO_LIMITS.offerCodeMaxLength}. The real
                code is set when you send, so this is only for Meta&apos;s
                reviewer.
              </p>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3">
            <span>
              <span className="block text-sm font-medium text-foreground">
                Show a countdown timer
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Displays how long is left. Without it this is just a coupon —
                the countdown is the reason to use this template type.
              </span>
            </span>
            <Switch
              checked={offer.hasExpiration}
              onCheckedChange={(v: boolean) => patchOffer({ hasExpiration: v })}
            />
          </label>

          <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              The actual expiry date is set per message, not here — every
              recipient can have a different deadline. That is also why these
              cannot be sent from the broadcast or inbox pickers yet: neither
              has a field for it.
            </p>
          </div>
        </section>

        {/* ---- Content ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">Content</h2>

          <div className="mt-4 space-y-2">
            <Label htmlFor="lto-header">
              Header <span className="text-muted-foreground">· optional</span>
            </Label>
            <Select
              value={draft.headerFormat === 'video' ? 'video' : draft.headerFormat === 'image' ? 'image' : 'none'}
              onValueChange={(v) =>
                onChange({
                  headerFormat: (v || 'none') as WizardDraft['headerFormat'],
                })
              }
            >
              <SelectTrigger id="lto-header" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Image or video only — a limited-time offer cannot use a text or
              document header.
            </p>
            {draft.headerFormat === 'image' || draft.headerFormat === 'video' ? (
              <Input
                value={draft.headerMediaUrl}
                onChange={(e) => onChange({ headerMediaUrl: e.target.value })}
                placeholder={`https://example.com/offer.${draft.headerFormat === 'video' ? 'mp4' : 'jpg'}`}
                aria-label="Header media sample URL"
              />
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            <Label htmlFor="lto-body">Body</Label>
            <Textarea
              id="lto-body"
              rows={4}
              value={draft.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              maxLength={LTO_LIMITS.bodyMaxLength}
              placeholder="Good news {{1}}! Use code {{2}} for 25% off everything."
              className="resize-none"
            />
            <p
              className={cn(
                'text-xs',
                bodyTooLong ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {draft.bodyText.length}/{LTO_LIMITS.bodyMaxLength} — note this is
              shorter than a normal template&apos;s 1024.
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

            <p className="text-xs text-muted-foreground">
              No footer — Meta does not allow one on this template type.
            </p>
          </div>
        </section>

        {/* ---- Website button ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">Buttons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A copy-code button is added automatically — it is what makes this a
            limited-time offer. You can add one website button beside it.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="lto-btn-text">
                Button label{' '}
                <span className="text-muted-foreground">· optional</span>
              </Label>
              <Input
                id="lto-btn-text"
                value={offer.urlButtonText}
                onChange={(e) => patchOffer({ urlButtonText: e.target.value })}
                maxLength={LTO_LIMITS.urlButtonTextMaxLength}
                placeholder="Shop now"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lto-url">Website URL</Label>
              <Input
                id="lto-url"
                value={offer.url}
                onChange={(e) => patchOffer({ url: e.target.value })}
                placeholder="https://example.com/sale?code={{1}}"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for no website button. One variable allowed, at the
                end of the URL.
              </p>
            </div>
          </div>

          {urlVars > 0 ? (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="lto-url-example">Example for the URL variable</Label>
              <Input
                id="lto-url-example"
                value={offer.urlExample}
                onChange={(e) => patchOffer({ urlExample: e.target.value })}
                placeholder="DIWALI25"
              />
            </div>
          ) : null}
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
            The countdown shown here is illustrative — the real deadline comes
            from the expiry you set when sending.
          </p>
        </div>
      </aside>
    </div>
  );
}
