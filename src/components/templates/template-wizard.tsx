'use client';

// ============================================================
// The template creation wizard.
//
// Three steps, matching Meta's WhatsApp Manager exactly:
//   1. Set up template   — category + type
//   2. Edit template     — name, language, content
//   3. Submit for review  — confirm and send to Meta
//
// Replaces the single flat dialog in Settings → Templates, which asked
// for everything at once and gave no indication of what a given template
// type could even contain.
//
// Step 2 currently renders the fields the "Default" type needs. The
// per-type editors (carousel cards, offer countdown, OTP options) arrive
// with those types — which is exactly why step 1 disables the types
// whose editors do not exist rather than letting you pick one and then
// showing the wrong form.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { WizardStepSetup } from '@/components/templates/wizard-step-setup';
import { WizardStepContent } from '@/components/templates/wizard-step-content';
import { WizardStepAuth } from '@/components/templates/wizard-step-auth';
import { WizardStepCarousel } from '@/components/templates/wizard-step-carousel';
import { WizardStepOffer } from '@/components/templates/wizard-step-offer';
import { WizardStepFlow } from '@/components/templates/wizard-step-flow';
import { WizardStepOrderStatus } from '@/components/templates/wizard-step-order-status';
import { WizardStepCommerce } from '@/components/templates/wizard-step-commerce';
import { WizardStepCallPermission } from '@/components/templates/wizard-step-call-permission';
import { WizardStepReview } from '@/components/templates/wizard-step-review';
import {
  defaultTypeFor,
  findTypeOption,
  type TemplateCategory,
} from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import type { CommerceKind } from '@/components/templates/wizard-draft';
import { TTL_LIMITS } from '@/lib/whatsapp/template-limits';
import {
  extractNamedParams,
  extractVariableIndices,
  isValidNamedParam,
} from '@/lib/whatsapp/template-variables';
import {
  cardButtons,
  draftFromRow,
  EMPTY_DRAFT,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import type { MessageTemplate } from '@/types';
import { cn } from '@/lib/utils';

const STEPS = [
  { n: 1, label: 'Set up template' },
  { n: 2, label: 'Edit template' },
  { n: 3, label: 'Submit for review' },
] as const;

export function TemplateWizard({
  existing,
  initialDraft,
  libraryMissing = false,
}: {
  /**
   * A pre-filled starting point, used when creating from the starter
   * library. Unlike `existing`, this is CREATE mode — step 1 still shows,
   * the name is editable, and nothing is locked, because a starter
   * template is a suggestion rather than an approved template being
   * amended.
   */
  initialDraft?: {
    draft: WizardDraft;
    category: TemplateCategory;
    templateType: TemplateType;
  };
  /**
   * A `?library=` slug was asked for but could not be resolved. Says so
   * instead of quietly showing a blank form — the operator clicked "Use
   * template" and is entitled to know why nothing was filled in.
   */
  libraryMissing?: boolean;
  /**
   * When present the wizard edits this template instead of creating one.
   *
   * Edit mode skips step 1 entirely: Meta freezes a template's name,
   * language and shape at creation, so there is nothing on that screen an
   * operator could legitimately change. Showing it with everything
   * disabled would be a screen whose only purpose is to be ignored.
   */
  existing?: MessageTemplate;
} = {}) {
  const router = useRouter();

  const initial = useMemo(
    () => (existing ? draftFromRow(existing) : null),
    [existing],
  );
  // EDIT mode is decided by `existing` alone. A starter-library prefill must
  // NOT flip this: edit mode hides step 1 and locks the name and language,
  // all of which would be wrong for a template that does not exist yet.
  const isEdit = initial !== null;
  const seed = initial ?? initialDraft ?? null;
  /**
   * Came from "Use template" in the starter library. Still CREATE mode —
   * see `isEdit` above — but the library row has ALREADY decided the
   * category and the type, so step 1 has nothing left to ask. Opening on
   * step 2 puts the operator straight into the filled-in content, which is
   * the whole point of picking a starter template. Step 1 stays in the
   * indicator and "Previous" still reaches it, so the type is changeable.
   */
  const isFromLibrary = !isEdit && initialDraft !== undefined;

  const [step, setStep] = useState<1 | 2 | 3>(isEdit || isFromLibrary ? 2 : 1);
  const [category, setCategory] = useState<TemplateCategory>(
    seed?.category ?? 'Marketing',
  );
  const [templateType, setTemplateType] = useState<TemplateType>(
    seed?.templateType ?? 'default',
  );
  const [draft, setDraft] = useState<WizardDraft>(seed?.draft ?? EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeOption = findTypeOption(category, templateType);

  /**
   * Switching category must also move the type: the lists differ per
   * category, so keeping the old type could leave a Utility template
   * claiming to be a Catalogue, which only Marketing offers.
   */
  const handleCategoryChange = useCallback((next: TemplateCategory) => {
    setCategory(next);
    setTemplateType(defaultTypeFor(next));
  }, []);

  const patch = useCallback(
    (fields: Partial<WizardDraft>) =>
      setDraft((prev) => ({ ...prev, ...fields })),
    [],
  );

  /** Step 1 gates on a buildable type — never let step 2 open blind. */
  const canLeaveSetup = typeOption?.available === true;

  const isAuth = category === 'Authentication';
  const isCarousel = templateType === 'carousel';
  const isOffer = templateType === 'limited_time_offer';
  const isFlow = templateType === 'flows';
  const isOrderStatus = templateType === 'order_status';
  const isCallPermission = templateType === 'calling_permission_request';
  const commerceKind: CommerceKind | null =
    templateType === 'catalogue' ||
    templateType === 'multi_product' ||
    templateType === 'order_details'
      ? templateType
      : null;

  const contentProblems = useMemo(() => {
    const problems: string[] = [];
    if (!draft.name.trim()) problems.push('Give the template a name.');
    if (!/^[a-z0-9_]{1,512}$/.test(draft.name.trim()) && draft.name.trim()) {
      problems.push(
        'The name can only use lowercase letters, numbers and underscores.',
      );
    }

    // Authentication has no body to write — Meta supplies it. Requiring
    // one would block the step forever.
    if (isAuth) {
      if (draft.auth.otpType !== 'COPY_CODE') {
        if (!draft.auth.packageName.trim()) {
          problems.push('Add your Android package name.');
        }
        if (!draft.auth.signatureHash.trim()) {
          problems.push('Add your app signing key hash.');
        }
      }
      return problems;
    }

    if (!draft.bodyText.trim()) problems.push('Write the body text.');

    // Validity period: the allowed window depends on the category, and
    // Meta's rejection does not mention which category it judged against.
    const ttlRaw = draft.ttlSeconds.trim();
    if (ttlRaw) {
      const ttl = Number.parseInt(ttlRaw, 10);
      if (!Number.isFinite(ttl)) {
        problems.push('The validity period must be a number of seconds.');
      } else if (ttl !== TTL_LIMITS.defaultSentinel && !isAuth) {
        const window =
          category === 'Marketing' ? TTL_LIMITS.Marketing : TTL_LIMITS.Utility;
        if (ttl < window.min || ttl > window.max) {
          problems.push(
            `A ${category} template's validity period must be ${window.min}–${window.max} seconds, or -1 for 30 days.`,
          );
        }
      }
    }

    // Named variables: Meta forbids mixing the two formats, and requires an
    // example for each name.
    if (draft.parameterFormat === 'NAMED') {
      const positional = extractVariableIndices(draft.bodyText);
      if (positional.length > 0) {
        problems.push(
          'This template uses named variables, so remove the numbered ones.',
        );
      }
      for (const name of extractNamedParams(draft.bodyText)) {
        if (!isValidNamedParam(name)) {
          problems.push(
            `"${name}" is not a valid variable name — lowercase letters, numbers and underscores only.`,
          );
        } else if (!draft.namedSamples[name]?.trim()) {
          problems.push(`Add an example value for {{${name}}}.`);
        }
      }
    } else if (extractNamedParams(draft.bodyText).length > 0) {
      problems.push(
        'Named variables found — switch the variable style to Named, or use {{1}}.',
      );
    }

    if (isOffer) {
      if (!draft.offer.text.trim()) problems.push('Add the offer label.');
      if (!draft.offer.code.trim()) problems.push('Add an example offer code.');
      if (
        (draft.headerFormat === 'image' || draft.headerFormat === 'video') &&
        !draft.headerMediaUrl.trim()
      ) {
        problems.push('Add a sample URL for the header media.');
      }
      return problems;
    }

    // Order status and calling permission need nothing beyond the body,
    // which is checked above — no buttons, no per-type fields.
    if (isOrderStatus || isCallPermission) return problems;

    if (commerceKind) {
      if (!draft.commerceButtonText.trim()) {
        problems.push('Add the button label.');
      }
      // Meta rejects a multi-product template with no text header, and the
      // message names the component rather than the rule.
      if (
        commerceKind === 'multi_product' &&
        (draft.headerFormat !== 'text' || !draft.headerContent.trim())
      ) {
        problems.push('Add the header text — a multi-product template needs one.');
      }
      if (
        commerceKind === 'order_details' &&
        (draft.headerFormat === 'image' || draft.headerFormat === 'document') &&
        !draft.headerMediaUrl.trim()
      ) {
        problems.push('Add a sample URL for the header media.');
      }
      return problems;
    }

    if (isFlow) {
      if (!draft.flow.flowId.trim()) {
        problems.push('Pick the Flow this button should open.');
      }
      if (!draft.flow.buttonText.trim()) {
        problems.push('Add the button label.');
      }
      // Meta requires the starting screen for 'navigate' and refuses one
      // for 'data_exchange'. Caught here because the rejection message
      // names neither the field nor the rule.
      if (
        draft.flow.action === 'navigate' &&
        !draft.flow.navigateScreen.trim()
      ) {
        problems.push('Name the first screen from your Flow JSON.');
      }
      return problems;
    }

    // Carousel: surface the uniformity rules here rather than letting the
    // server reject them after a submit that also uploaded N media files.
    if (isCarousel) {
      const { cards, buttonTypes } = draft.carousel;
      const missingMedia = cards.findIndex((c) => !c.headerMediaUrl.trim());
      if (missingMedia !== -1) {
        problems.push(`Card ${missingMedia + 1} needs a sample media URL.`);
      }
      const withText = cards.filter((c) => c.bodyText.trim()).length;
      if (withText > 0 && withText < cards.length) {
        problems.push('Either every card needs text, or none.');
      }
      buttonTypes.forEach((_, bi) => {
        const blank = cards.findIndex((c) => !c.buttonValues[bi]?.text.trim());
        if (blank !== -1) {
          problems.push(`Card ${blank + 1}: button ${bi + 1} needs a label.`);
        }
      });
    }

    return problems;
  }, [
    draft.name,
    draft.bodyText,
    draft.ttlSeconds,
    draft.parameterFormat,
    draft.namedSamples,
    category,
    draft.auth,
    draft.carousel,
    draft.offer,
    draft.flow,
    draft.headerFormat,
    draft.headerMediaUrl,
    draft.commerceButtonText,
    draft.headerContent,
    isAuth,
    isCarousel,
    isOffer,
    isFlow,
    isOrderStatus,
    isCallPermission,
    commerceKind,
  ]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const sample_values: { body?: string[]; header?: string[] } = {};
      if (draft.bodySamples.some((v) => v.trim())) {
        sample_values.body = draft.bodySamples.map((v) => v.trim());
      }
      if (draft.headerFormat === 'text' && draft.headerSample.trim()) {
        sample_values.header = [draft.headerSample.trim()];
      }

      // Authentication sends a different payload: no body, header, footer
      // or buttons, just the OTP options Meta composes the message from.
      const authBody = isAuth
        ? {
            name: draft.name.trim(),
            category,
            language: draft.language.trim() || 'en_US',
            // The API contract still requires body_text; Meta ignores it
            // for this category and the server derives the real preset.
            body_text: '',
            auth: {
              otp_type: draft.auth.otpType,
              button_text: draft.auth.buttonText.trim() || undefined,
              add_security_recommendation: draft.auth.addSecurityRecommendation,
              code_expiration_minutes:
                Number.parseInt(draft.auth.codeExpirationMinutes, 10) || null,
              autofill_text: draft.auth.autofillText.trim() || undefined,
              package_name: draft.auth.packageName.trim() || undefined,
              signature_hash: draft.auth.signatureHash.trim() || undefined,
            },
            message_send_ttl_seconds:
              Number.parseInt(draft.auth.ttlSeconds, 10) || null,
          }
        : null;

      const standardBody = {
        name: draft.name.trim(),
        category,
        language: draft.language.trim() || 'en_US',
        header_type:
          draft.headerFormat === 'none' ? undefined : draft.headerFormat,
        header_content:
          draft.headerFormat === 'text'
            ? draft.headerContent.trim()
            : undefined,
        header_media_url:
          draft.headerFormat !== 'none' && draft.headerFormat !== 'text'
            ? draft.headerMediaUrl.trim() || undefined
            : undefined,
        body_text: draft.bodyText.trim(),
        footer_text: draft.footerText.trim() || undefined,
        buttons: draft.buttons.length > 0 ? draft.buttons : undefined,
        sample_values:
          Object.keys(sample_values).length > 0 ? sample_values : undefined,
        // Blank means "let Meta use its default", which differs per
        // category — so omit the field rather than sending a number we
        // invented.
        message_send_ttl_seconds: draft.ttlSeconds.trim()
          ? Number.parseInt(draft.ttlSeconds, 10)
          : undefined,
        // Omitted for positional, which is Meta's default. `named_samples`
        // replaces `sample_values.body` entirely — the examples are matched
        // by name, so there is no positional row to send.
        ...(draft.parameterFormat === 'NAMED'
          ? {
              parameter_format: 'NAMED' as const,
              named_samples: draft.namedSamples,
            }
          : {}),
      };

      // Carousel replaces header/footer/buttons with cards. The shared
      // button shape is expanded per card here so the server receives the
      // fully-formed cards it validates.
      const carouselBody = isCarousel
        ? {
            name: draft.name.trim(),
            category,
            language: draft.language.trim() || 'en_US',
            body_text: draft.bodyText.trim(),
            sample_values:
              Object.keys(sample_values).length > 0 ? sample_values : undefined,
            cards: draft.carousel.cards.map((card, i) => ({
              header_format: draft.carousel.headerFormat,
              header_media_url: card.headerMediaUrl.trim(),
              body_text: card.bodyText.trim() || undefined,
              body_samples: card.bodySamples.filter((s) => s.trim()),
              buttons: cardButtons(draft.carousel, i),
            })),
          }
        : null;

      // Limited-time offer: the copy-code button is implied by the type,
      // so it is assembled here rather than asked for.
      const offerBody = isOffer
        ? {
            name: draft.name.trim(),
            category,
            language: draft.language.trim() || 'en_US',
            header_type:
              draft.headerFormat === 'image' || draft.headerFormat === 'video'
                ? draft.headerFormat
                : undefined,
            header_media_url:
              draft.headerFormat === 'image' || draft.headerFormat === 'video'
                ? draft.headerMediaUrl.trim() || undefined
                : undefined,
            body_text: draft.bodyText.trim(),
            sample_values:
              Object.keys(sample_values).length > 0 ? sample_values : undefined,
            offer: {
              text: draft.offer.text.trim(),
              has_expiration: draft.offer.hasExpiration,
            },
            buttons: [
              {
                type: 'COPY_CODE' as const,
                text: 'Copy code',
                example: draft.offer.code.trim(),
              },
              ...(draft.offer.url.trim()
                ? [
                    {
                      type: 'URL' as const,
                      text: draft.offer.urlButtonText.trim() || 'Shop now',
                      url: draft.offer.url.trim(),
                      ...(draft.offer.urlExample.trim()
                        ? { example: draft.offer.urlExample.trim() }
                        : {}),
                    },
                  ]
                : []),
            ],
          }
        : null;

      // Flows: standard content, but the single FLOW button is described
      // by `flow` rather than sent in `buttons`. The server refuses a
      // payload carrying both, so `buttons` is omitted entirely.
      const flowBody = isFlow
        ? {
            ...standardBody,
            buttons: undefined,
            flow: {
              flow_id: draft.flow.flowId.trim(),
              flow_name: draft.flow.flowName.trim() || undefined,
              text: draft.flow.buttonText.trim(),
              flow_action: draft.flow.action,
              navigate_screen:
                draft.flow.action === 'navigate'
                  ? draft.flow.navigateScreen.trim()
                  : undefined,
            },
          }
        : null;

      // Order status: body + optional footer, and the sub_category that is
      // the only thing distinguishing it from a plain Utility template.
      // Header and buttons are dropped rather than sent — Meta rejects
      // both, and the draft may still hold them from an earlier choice.
      const orderStatusBody = isOrderStatus
        ? {
            ...standardBody,
            header_type: undefined,
            header_content: undefined,
            header_media_url: undefined,
            buttons: undefined,
            sub_category: 'ORDER_STATUS' as const,
          }
        : null;

      // Catalogue / multi-product / order details: standard content plus the
      // one button their type fixes. Sent as its own field rather than in
      // `buttons`, which the server refuses alongside these.
      const commerceBody = commerceKind
        ? {
            ...standardBody,
            buttons: undefined,
            // A catalogue's header is a product image chosen by WhatsApp.
            ...(commerceKind === 'catalogue'
              ? {
                  header_type: undefined,
                  header_content: undefined,
                  header_media_url: undefined,
                }
              : {}),
            ...(commerceKind === 'catalogue'
              ? { catalog: { text: draft.commerceButtonText.trim() } }
              : commerceKind === 'multi_product'
                ? { mpm: { text: draft.commerceButtonText.trim() } }
                : { order_details: { text: draft.commerceButtonText.trim() } }),
          }
        : null;

      // Calling permission: text header at most, no buttons, and the
      // sub_category that makes Meta attach the consent options.
      const callPermissionBody = isCallPermission
        ? {
            ...standardBody,
            header_type: draft.headerFormat === 'text' ? ('text' as const) : undefined,
            header_media_url: undefined,
            buttons: undefined,
            sub_category: 'CALL_PERMISSION_REQUEST' as const,
          }
        : null;

      const res = await fetch(
        isEdit
          ? `/api/whatsapp/templates/${existing!.id}`
          : '/api/whatsapp/templates/submit',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            authBody ??
              orderStatusBody ??
              callPermissionBody ??
              commerceBody ??
              offerBody ??
              carouselBody ??
              flowBody ??
              standardBody,
          ),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error ||
            `${isEdit ? 'Save' : 'Submit'} failed (HTTP ${res.status})`,
        );
      }

      toast.success(
        data.dry_run
          ? 'Template saved locally (dry-run mode — nothing sent to Meta).'
          : isEdit
            ? 'Changes sent to Meta for review.'
            : 'Submitted to Meta for review.',
      );
      router.push('/templates');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the template.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/templates')}
            aria-label="Back to templates"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {isEdit ? `Edit ${existing!.name}` : 'Create template'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {category}
              {typeOption ? ` · ${typeOption.title}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Editing an approved template sends it back for review, and Meta
          rate-limits edits. Both are worth knowing BEFORE typing, not
          after clicking save. */}
      {isEdit ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Saving sends this template back to Meta for review — it returns to
            Pending and cannot be used until approved again. Meta allows about
            10 edits per month, and only one a day for an approved template.
            The name and language cannot be changed at all.
          </p>
        </div>
      ) : null}

      {/* Clicking "Use template" and landing on an empty form is confusing
          enough that it is worth naming out loud. */}
      {libraryMissing ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            That starter template could not be loaded, so this form is blank.
            It may have been removed or hidden.{' '}
            <Link href="/templates/library" className="font-medium underline">
              Browse the library again
            </Link>
            , or just build the template from here.
          </p>
        </div>
      ) : null}

      {/* The draft is a copy, not a link back to the library — worth saying
          before someone hesitates to change the wording. */}
      {isFromLibrary ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Pre-filled from the starter library, including example values.
            Everything here is yours to edit — change the wording, samples and
            buttons freely before submitting.
          </p>
        </div>
      ) : null}

      {/* ---- Step indicator ---- */}
      <ol className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {STEPS.filter((s) => !isEdit || s.n !== 1).map(({ n, label }) => {
          const done = step > n;
          const active = step === n;
          return (
            <li key={n} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary text-primary'
                      : 'border-2 border-muted-foreground/30 text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  'text-sm',
                  active
                    ? 'font-semibold text-foreground'
                    : done
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* ---- Body ---- */}
      <div className="mt-6">
        {step === 1 ? (
          <WizardStepSetup
            category={category}
            templateType={templateType}
            onCategoryChange={handleCategoryChange}
            onTypeChange={setTemplateType}
          />
        ) : null}

        {step === 2 ? (
          isAuth ? (
            <WizardStepAuth draft={draft} onChange={patch} />
          ) : isCarousel ? (
            <WizardStepCarousel draft={draft} onChange={patch} />
          ) : isOffer ? (
            <WizardStepOffer draft={draft} onChange={patch} />
          ) : isFlow ? (
            <WizardStepFlow
              draft={draft}
              category={category}
              onChange={patch}
            />
          ) : isOrderStatus ? (
            <WizardStepOrderStatus draft={draft} onChange={patch} />
          ) : isCallPermission ? (
            <WizardStepCallPermission draft={draft} onChange={patch} />
          ) : commerceKind ? (
            <WizardStepCommerce
              draft={draft}
              category={category}
              kind={commerceKind}
              onChange={patch}
            />
          ) : (
            <WizardStepContent
              draft={draft}
              category={category}
              templateType={templateType}
              onChange={patch}
            />
          )
        ) : null}

        {step === 3 ? (
          <WizardStepReview
            draft={draft}
            category={category}
            templateType={templateType}
          />
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-destructive/60 hover:text-destructive"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* ---- Footer nav ---- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={() =>
            // In edit mode step 2 is the first screen, so "Previous"
            // there means leaving, not going back to a step that is
            // deliberately skipped.
            step === 1 || (isEdit && step === 2)
              ? router.push('/templates')
              : setStep((s) => (s === 3 ? 2 : 1))
          }
          disabled={submitting}
        >
          {step === 1 || (isEdit && step === 2) ? 'Cancel' : 'Previous'}
        </Button>

        <div className="flex items-center gap-3">
          {/* Explain a blocked Next rather than leaving a dead button. */}
          {step === 1 && !canLeaveSetup ? (
            <p className="text-xs text-muted-foreground">
              Pick a template type that is available to continue.
            </p>
          ) : null}
          {step === 2 && contentProblems.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {contentProblems[0]}
            </p>
          ) : null}

          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
              disabled={
                step === 1 ? !canLeaveSetup : contentProblems.length > 0
              }
            >
              Next
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isEdit ? 'Saving' : 'Submitting'}
                </>
              ) : isEdit ? (
                'Save and resubmit'
              ) : (
                'Submit for Review'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
