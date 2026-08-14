'use client';

// ============================================================
// Wizard step 2 — "Edit template".
//
// The content fields for the Default template type: name, language,
// header, body, footer, buttons. Same fields the old Settings dialog
// had, but laid out in Meta's order with the limits and variable rules
// stated inline instead of arriving as an API error after submitting.
//
// Per-type editors (carousel cards, offer countdown, OTP options) land
// with their types. Step 1 disables types whose editor does not exist,
// so this form is never shown for a shape it cannot express.
//
// The live WhatsApp preview is Phase 3 — this step deliberately has no
// preview rail yet rather than a fake one.
// ============================================================

import { useEffect, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { TEMPLATE_LIMITS, TTL_LIMITS } from '@/lib/whatsapp/template-limits';
import {
  extractNamedParams,
  extractVariableIndices,
} from '@/lib/whatsapp/template-variables';
import type { TemplateCategory } from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import type { TemplateButton } from '@/types';
import {
  definitionFromDraft,
  draftBodyValues,
  draftHeaderValues,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';

const HEADER_FORMATS = [
  { value: 'none', label: 'None' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'location', label: 'Location' },
] as const;

const LANGUAGES = [
  'en_US', 'en_GB', 'en', 'hi', 'bn', 'mr', 'ta', 'te', 'gu', 'kn', 'ml',
  'pa', 'ur', 'es', 'fr', 'de', 'it', 'pt_BR', 'ar', 'id', 'ja', 'ko', 'zh_CN',
];

/**
 * The button types this editor can build, with their labels.
 *
 * One list drives both the add-button menu and each card's heading, so a
 * new type cannot appear in one and be mislabelled in the other.
 */
const BUTTON_TYPE_LABELS: { value: TemplateButton['type']; label: string }[] = [
  { value: 'QUICK_REPLY', label: 'Quick reply' },
  { value: 'URL', label: 'Visit website' },
  { value: 'PHONE_NUMBER', label: 'Call phone number' },
  { value: 'COPY_CODE', label: 'Copy offer code' },
  { value: 'VOICE_CALL', label: 'Call on WhatsApp' },
];

function buttonTypeLabel(type: TemplateButton['type']): string {
  return BUTTON_TYPE_LABELS.find((b) => b.value === type)?.label ?? type;
}

function emptyButton(type: TemplateButton['type']): TemplateButton {
  switch (type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: '' };
    case 'URL':
      return { type: 'URL', text: '', url: '' };
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: '', phone_number: '' };
    case 'COPY_CODE':
      return { type: 'COPY_CODE', text: '', example: '' };
    case 'VOICE_CALL':
      // No configuration: the number called is the WABA's own.
      return { type: 'VOICE_CALL', text: '' };
  }
}

export function WizardStepContent({
  draft,
  category,
  templateType,
  onChange,
}: {
  draft: WizardDraft;
  category: TemplateCategory;
  templateType: TemplateType;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const bodyVarCount = useMemo(
    () => extractVariableIndices(draft.bodyText).length,
    [draft.bodyText],
  );
  const headerVarCount = useMemo(
    () =>
      draft.headerFormat === 'text'
        ? extractVariableIndices(draft.headerContent).length
        : 0,
    [draft.headerFormat, draft.headerContent],
  );

  // Keep the sample rows exactly as long as the variable count. Meta
  // rejects a mismatch, so the form should make one impossible.
  useEffect(() => {
    if (draft.bodySamples.length === bodyVarCount) return;
    const next = draft.bodySamples.slice(0, bodyVarCount);
    while (next.length < bodyVarCount) next.push('');
    onChange({ bodySamples: next });
  }, [bodyVarCount, draft.bodySamples, onChange]);

  // 'location' is neither text nor media: it takes no sample at creation
  // because the pin is supplied per message. Without excluding it here the
  // form would demand a media URL for it and block the step.
  const needsMedia =
    draft.headerFormat !== 'none' &&
    draft.headerFormat !== 'text' &&
    draft.headerFormat !== 'location';

  const isNamed = draft.parameterFormat === 'NAMED';
  const namedParams = useMemo(
    () => (isNamed ? extractNamedParams(draft.bodyText) : []),
    [isNamed, draft.bodyText],
  );

  /**
   * Meta forbids mixing `{{1}}` and `{{order_id}}` in one template, and
   * rejects the mix with "The parameter name is required" — which points at
   * neither the stray placeholder nor the rule. Caught while typing.
   */
  const mixedFormatWarning = useMemo(() => {
    if (isNamed) {
      const positional = extractVariableIndices(draft.bodyText);
      if (positional.length > 0) {
        return `Remove ${positional
          .map((n) => `{{${n}}}`)
          .join(', ')} — a named template cannot also use numbered variables.`;
      }
      return null;
    }
    const named = extractNamedParams(draft.bodyText);
    if (named.length > 0) {
      return `Remove ${named
        .map((n) => `{{${n}}}`)
        .join(', ')}, or switch the variable style to Named.`;
    }
    return null;
  }, [isNamed, draft.bodyText]);

  // Mirrors validateTtl on the server. Shown inline because the category
  // decides the window, and Meta's rejection does not mention the category.
  const ttlProblem = useMemo(() => {
    const raw = draft.ttlSeconds.trim();
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 'Enter a number of seconds, or -1.';
    if (n === TTL_LIMITS.defaultSentinel) return null;
    const window =
      category === 'Marketing' ? TTL_LIMITS.Marketing : TTL_LIMITS.Utility;
    if (n < window.min || n > window.max) {
      return `A ${category} template allows ${window.min}–${window.max} seconds, or -1 for 30 days.`;
    }
    return null;
  }, [draft.ttlSeconds, category]);

  const updateButton = (i: number, fields: Partial<TemplateButton>) =>
    onChange({
      buttons: draft.buttons.map((b, idx) =>
        idx === i ? ({ ...b, ...fields } as TemplateButton) : b,
      ),
    });

  // Rebuilt on every keystroke from the same conversion the submit
  // payload uses, so the preview cannot show something Meta will not
  // receive. Cheap enough to skip memoising — it is a handful of string
  // operations on at most 1024 characters.
  const definition = definitionFromDraft(draft, category, templateType);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
      {/* ---- Name + language ---- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          Template name and language
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name your template</Label>
            <Input
              id="tpl-name"
              value={draft.name}
              onChange={(e) =>
                // Meta only accepts lowercase, digits and underscores, so
                // normalise as they type rather than rejecting on submit.
                onChange({
                  name: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '_')
                    .slice(0, 512),
                })
              }
              placeholder="order_confirmation"
              aria-describedby="tpl-name-hint"
            />
            <p id="tpl-name-hint" className="text-xs text-muted-foreground">
              Lowercase letters, numbers and underscores. Spaces become
              underscores automatically. {draft.name.length}/512
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-lang">Select language</Label>
            <Select
              value={draft.language}
              // This Select's onValueChange yields `string | null`, so
              // every handler here coerces rather than trusting it.
              onValueChange={(v) => onChange({ language: v || 'en_US' })}
            >
              <SelectTrigger id="tpl-lang" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ---- Content ---- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Content</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a header, body and footer. Meta reviews the wording as well as
          the structure, so write it as the customer will read it.
        </p>

        {/* Header */}
        <div className="mt-4 space-y-2">
          <Label htmlFor="tpl-header-format">
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
            <SelectTrigger id="tpl-header-format" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEADER_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {draft.headerFormat === 'text' ? (
            <div className="space-y-2 pt-1">
              <Input
                value={draft.headerContent}
                onChange={(e) => onChange({ headerContent: e.target.value })}
                maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                placeholder="Order update"
                aria-label="Header text"
              />
              <p className="text-xs text-muted-foreground">
                {draft.headerContent.length}/
                {TEMPLATE_LIMITS.headerTextMaxLength}. A text header may
                contain at most one variable, and it must be{' '}
                <code>{'{{1}}'}</code>.
              </p>
              {headerVarCount > 0 ? (
                <Input
                  value={draft.headerSample}
                  onChange={(e) => onChange({ headerSample: e.target.value })}
                  placeholder="Example value for {{1}}"
                  aria-label="Header sample value"
                />
              ) : null}
            </div>
          ) : null}

          {needsMedia ? (
            <div className="space-y-2 pt-1">
              <Input
                value={draft.headerMediaUrl}
                onChange={(e) => onChange({ headerMediaUrl: e.target.value })}
                placeholder={`https://example.com/sample.${
                  draft.headerFormat === 'image'
                    ? 'jpg'
                    : draft.headerFormat === 'video'
                      ? 'mp4'
                      : 'pdf'
                }`}
                aria-label="Header media sample URL"
              />
              <p className="text-xs text-muted-foreground">
                A publicly reachable sample file. Meta downloads it during
                review, so it must stay online until the template is approved.
                {draft.headerFormat === 'image' && ' JPEG or PNG, up to 5 MB.'}
                {draft.headerFormat === 'video' && ' MP4 or 3GPP, up to 16 MB.'}
                {draft.headerFormat === 'document' && ' PDF, up to 100 MB.'}
              </p>
            </div>
          ) : null}

          {draft.headerFormat === 'location' ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Nothing to fill in here. The map pin — latitude, longitude, name
              and address — is supplied for each message when you send, which
              is what makes it useful: one template covers every branch,
              delivery address or meeting point.
            </p>
          ) : null}

          {/* ---- Validity period ---- */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="tpl-ttl">
              Validity period{' '}
              <span className="text-muted-foreground">· optional</span>
            </Label>
            <Input
              id="tpl-ttl"
              value={draft.ttlSeconds}
              onChange={(e) =>
                onChange({ ttlSeconds: e.target.value.replace(/[^\d-]/g, '') })
              }
              placeholder={`Blank = Meta's default`}
              className="w-full sm:w-56"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              How long WhatsApp keeps retrying before giving up, in seconds.{' '}
              {category === 'Marketing'
                ? `Marketing allows ${TTL_LIMITS.Marketing.min}–${TTL_LIMITS.Marketing.max}.`
                : `Utility allows ${TTL_LIMITS.Utility.min}–${TTL_LIMITS.Utility.max}.`}{' '}
              Use <code>-1</code> for 30 days. Useful for anything that stops
              being true — a delivery slot, a one-hour discount.
            </p>
            {ttlProblem ? (
              <p className="text-xs text-destructive">{ttlProblem}</p>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="mt-5 space-y-2">
          <Label htmlFor="tpl-body">Body</Label>
          <Textarea
            id="tpl-body"
            rows={5}
            value={draft.bodyText}
            onChange={(e) => onChange({ bodyText: e.target.value })}
            maxLength={TEMPLATE_LIMITS.bodyMaxLength}
            placeholder="Hi {{1}}, your order {{2}} is on its way."
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {draft.bodyText.length}/{TEMPLATE_LIMITS.bodyMaxLength}.{' '}
            {isNamed ? (
              <>
                Use <code>{'{{order_id}}'}</code> style names for values you
                fill in when sending. Lowercase letters, numbers and
                underscores.
              </>
            ) : (
              <>
                Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> for values
                you fill in when sending. They must run in order with no gaps.
              </>
            )}
          </p>

          {/* ---- Variable format ---- */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                Variable style
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Named variables read better in long messages. Meta does not
                allow both styles in one template, so switching means
                rewriting the placeholders.
              </p>
            </div>
            <Select
              value={draft.parameterFormat}
              onValueChange={(v) =>
                onChange({
                  parameterFormat:
                    v === 'NAMED' ? 'NAMED' : 'POSITIONAL',
                })
              }
            >
              <SelectTrigger className="w-44" aria-label="Variable style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POSITIONAL">{'Numbered {{1}}'}</SelectItem>
                <SelectItem value="NAMED">{'Named {{order_id}}'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mixedFormatWarning ? (
            <p className="text-xs text-destructive">{mixedFormatWarning}</p>
          ) : null}

          {isNamed && namedParams.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-foreground">
                Example values
              </p>
              <p className="text-xs text-muted-foreground">
                Meta&apos;s reviewers read these. One per variable is required.
              </p>
              {namedParams.map((name) => (
                <div key={name} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {`{{${name}}}`}
                  </Label>
                  <Input
                    value={draft.namedSamples[name] ?? ''}
                    onChange={(e) =>
                      onChange({
                        namedSamples: {
                          ...draft.namedSamples,
                          [name]: e.target.value,
                        },
                      })
                    }
                    placeholder={`Example for {{${name}}}`}
                    aria-label={`Example value for ${name}`}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {!isNamed && bodyVarCount > 0 ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-foreground">
                Example values
              </p>
              <p className="text-xs text-muted-foreground">
                Meta&apos;s reviewers read these to understand the message. A
                template with vague samples is a common rejection reason.
              </p>
              {draft.bodySamples.map((val, i) => (
                <Input
                  key={i}
                  value={val}
                  onChange={(e) => {
                    const next = [...draft.bodySamples];
                    next[i] = e.target.value;
                    onChange({ bodySamples: next });
                  }}
                  placeholder={`Example for {{${i + 1}}}`}
                  aria-label={`Example value for variable ${i + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-5 space-y-2">
          <Label htmlFor="tpl-footer">
            Footer <span className="text-muted-foreground">· optional</span>
          </Label>
          <Input
            id="tpl-footer"
            value={draft.footerText}
            onChange={(e) => onChange({ footerText: e.target.value })}
            maxLength={TEMPLATE_LIMITS.footerMaxLength}
            placeholder="Reply STOP to opt out"
          />
          <p className="text-xs text-muted-foreground">
            {draft.footerText.length}/{TEMPLATE_LIMITS.footerMaxLength}. Footers
            cannot contain variables.
            {category === 'Marketing' &&
              ' Marketing templates should tell people how to opt out.'}
          </p>
        </div>
      </section>

      {/* ---- Buttons ---- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Buttons <span className="text-muted-foreground">· optional</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Up to {TEMPLATE_LIMITS.maxButtonsTotal}. Quick replies must come
              before link, call and copy-code buttons.
            </p>
          </div>
          <Select
            value=""
            onValueChange={(v) => {
              if (!v) return;
              onChange({
                buttons: [
                  ...draft.buttons,
                  emptyButton(v as TemplateButton['type']),
                ],
              });
            }}
          >
            <SelectTrigger
              className="w-auto gap-2"
              aria-label="Add a button"
              disabled={draft.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal}
            >
              <Plus className="size-4" />
              Add button
            </SelectTrigger>
            <SelectContent>
              {BUTTON_TYPE_LABELS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {draft.buttons.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            No buttons. The message will be text only.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {draft.buttons.map((btn, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-2">
                  {/* Read from the same list the add-menu uses. This was a
                      ternary chain whose final `else` said "Copy offer
                      code", so any button type it did not know about was
                      shown under the wrong name. */}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {buttonTypeLabel(btn.type)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    onClick={() =>
                      onChange({
                        buttons: draft.buttons.filter((_, idx) => idx !== i),
                      })
                    }
                    aria-label={`Remove button ${i + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <Input
                  value={btn.text}
                  onChange={(e) => updateButton(i, { text: e.target.value })}
                  maxLength={TEMPLATE_LIMITS.buttonTextMaxLength}
                  placeholder="Button label"
                  aria-label={`Button ${i + 1} label`}
                />

                {btn.type === 'URL' ? (
                  <>
                    <Input
                      value={btn.url}
                      onChange={(e) => updateButton(i, { url: e.target.value })}
                      placeholder="https://example.com/track/{{1}}"
                      aria-label={`Button ${i + 1} URL`}
                    />
                    {extractVariableIndices(btn.url).length > 0 ? (
                      <Input
                        value={btn.example ?? ''}
                        onChange={(e) =>
                          updateButton(i, { example: e.target.value })
                        }
                        placeholder="Example value for the URL variable"
                        aria-label={`Button ${i + 1} URL example`}
                      />
                    ) : null}
                  </>
                ) : null}

                {btn.type === 'PHONE_NUMBER' ? (
                  <Input
                    value={btn.phone_number}
                    onChange={(e) =>
                      updateButton(i, { phone_number: e.target.value })
                    }
                    placeholder="+911234567890"
                    aria-label={`Button ${i + 1} phone number`}
                  />
                ) : null}

                {btn.type === 'COPY_CODE' ? (
                  <Input
                    value={btn.example}
                    onChange={(e) =>
                      updateButton(i, { example: e.target.value })
                    }
                    placeholder="SAVE20"
                    aria-label={`Button ${i + 1} offer code`}
                  />
                ) : null}

                {/* Nothing to configure — the call goes to this WABA's own
                    number. Worth saying that it needs calling switched on,
                    because Meta approves the template either way and the
                    button then silently does nothing. */}
                {btn.type === 'VOICE_CALL' ? (
                  <p className="text-xs text-muted-foreground">
                    Calls your WhatsApp number — there is nothing to fill in.
                    Needs WhatsApp calling enabled on the number in WhatsApp
                    Manager, or the button will do nothing once approved.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      {/* ---- Live preview ---- */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Template preview
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How this looks in WhatsApp as you type.
          </p>

          <WhatsAppPreview
            definition={definition}
            values={draftBodyValues(draft)}
            headerValues={draftHeaderValues(draft)}
            className="mt-3"
          />

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Highlighted values like{' '}
            <span className="rounded bg-primary/15 px-1 font-medium text-primary">
              {'{{1}}'}
            </span>{' '}
            have no example yet — fill one in above and it will appear here.
          </p>

          {draft.buttons.length > 3 ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
              WhatsApp shows the first three buttons and hides the rest behind
              &ldquo;See all options&rdquo;.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
