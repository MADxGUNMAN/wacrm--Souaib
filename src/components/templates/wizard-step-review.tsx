'use client';

// ============================================================
// Wizard step 3 — "Submit for review".
//
// A read-only summary plus what actually happens on submit. Meta's own
// screen is thin here, but this step earns its place: submitting is
// irreversible in two ways operators regularly get caught by, and both
// are stated below rather than discovered later.
// ============================================================

import { Clock, Info, Lock } from 'lucide-react';

import type { TemplateCategory } from '@/lib/whatsapp/template-types-catalogue';
import { findTypeOption } from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import {
  definitionFromDraft,
  draftBodyValues,
  draftHeaderValues,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words text-foreground">{value}</dd>
    </div>
  );
}

export function WizardStepReview({
  draft,
  category,
  templateType,
}: {
  draft: WizardDraft;
  category: TemplateCategory;
  templateType: TemplateType;
}) {
  const typeOption = findTypeOption(category, templateType);
  const none = <span className="text-muted-foreground">Not set</span>;
  const definition = definitionFromDraft(draft, category, templateType);
  const isAuth = category === 'Authentication';

  return (
    <div className="space-y-5">
      {/* Lead with the preview. This is the last screen before an
          irreversible submit, so the most useful thing to show is what
          Meta's reviewer — and then the customer — will actually see,
          rather than the field-by-field table alone. */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          What the customer will see
        </h2>
        <WhatsAppPreview
          definition={definition}
          values={draftBodyValues(draft)}
          headerValues={draftHeaderValues(draft)}
          className="mt-3 max-w-sm"
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          Check before submitting
        </h2>

        <dl className="mt-2 divide-y divide-border">
          <Row label="Name" value={draft.name || none} />
          <Row label="Category" value={category} />
          <Row label="Type" value={typeOption?.title ?? templateType} />
          <Row label="Language" value={draft.language} />

          {/* Authentication has no body, header, footer or buttons to
              show — listing them all as "Not set" would read as an
              incomplete template rather than a correct one. */}
          {isAuth ? (
            <>
              <Row
                label="Code delivery"
                value={
                  draft.auth.otpType === 'COPY_CODE'
                    ? 'Copy code button'
                    : draft.auth.otpType === 'ONE_TAP'
                      ? 'One-tap autofill (Android)'
                      : 'Zero-tap (Android)'
                }
              />
              <Row
                label="Button label"
                value={
                  draft.auth.buttonText.trim() || (
                    <span className="text-muted-foreground">
                      WhatsApp&apos;s default, translated
                    </span>
                  )
                }
              />
              <Row
                label="Security disclaimer"
                value={draft.auth.addSecurityRecommendation ? 'Included' : 'Omitted'}
              />
              <Row
                label="Code expiry"
                value={
                  draft.auth.codeExpirationMinutes.trim() ? (
                    `${draft.auth.codeExpirationMinutes} minutes`
                  ) : (
                    <span className="text-muted-foreground">
                      No warning shown (button stops working after 10 minutes)
                    </span>
                  )
                }
              />
              <Row
                label="Delivery validity"
                value={
                  draft.auth.ttlSeconds.trim() ? (
                    `${draft.auth.ttlSeconds} seconds`
                  ) : (
                    <span className="text-muted-foreground">
                      WhatsApp&apos;s default
                    </span>
                  )
                }
              />
              {draft.auth.otpType !== 'COPY_CODE' ? (
                <Row
                  label="Android app"
                  value={
                    <span className="font-mono text-xs">
                      {draft.auth.packageName || '(no package name)'}
                    </span>
                  }
                />
              ) : null}
            </>
          ) : (
            <>
          <Row
            label="Header"
            value={
              draft.headerFormat === 'none'
                ? none
                : draft.headerFormat === 'text'
                  ? draft.headerContent || none
                  : `${draft.headerFormat} · ${draft.headerMediaUrl || 'no sample URL'}`
            }
          />
          <Row
            label="Body"
            value={
              draft.bodyText ? (
                <span className="whitespace-pre-wrap">{draft.bodyText}</span>
              ) : (
                none
              )
            }
          />
          {draft.bodySamples.length > 0 ? (
            <Row
              label="Example values"
              value={draft.bodySamples
                .map((v, i) => `{{${i + 1}}} = ${v || '(empty)'}`)
                .join(', ')}
            />
          ) : null}
          <Row label="Footer" value={draft.footerText || none} />
          <Row
            label="Buttons"
            value={
              draft.buttons.length === 0 ? (
                none
              ) : (
                <ul className="space-y-0.5">
                  {draft.buttons.map((b, i) => (
                    <li key={i}>
                      {b.text || '(no label)'}{' '}
                      <span className="text-muted-foreground">
                        — {b.type.toLowerCase().replace('_', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          />
            </>
          )}
        </dl>
      </section>

      {/* The two things that surprise people. Worth saying up front:
          both are Meta-side rules we cannot soften. */}
      <section className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The <strong className="text-foreground">name and language</strong>{' '}
            are fixed once submitted. Meta identifies the template by them, so
            changing either later means creating a new template.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Review usually takes minutes but can take up to 24 hours. You
            cannot send with this template until it is approved — the status
            updates here automatically.
          </p>
        </div>

        {category === 'Marketing' ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Meta may reclassify this as{' '}
              <strong className="text-foreground">Utility</strong> if the
              content reads as transactional. That changes what each message
              costs, and the new category will be reflected here when it
              happens.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
