'use client';

// ============================================================
// Wizard step 2, AUTHENTICATION variant.
//
// Deliberately a different form from the standard content step, because
// an authentication template is a different thing: Meta owns the message
// wording entirely. You cannot write the body, add a header, or add your
// own buttons. What you choose is how the code is delivered and how long
// it stays valid.
//
// Showing the normal body/header/footer editor here and then discarding
// what was typed would be the worst option — so this form only offers
// what Meta actually accepts, and says so up front.
// ============================================================

import { AlertCircle, Info } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AUTH_LIMITS } from '@/lib/whatsapp/template-limits';
import type { AuthDraft, WizardDraft } from '@/components/templates/wizard-draft';
import { definitionFromDraft } from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  'en_US', 'en_GB', 'en', 'hi', 'bn', 'mr', 'ta', 'te', 'gu', 'kn', 'ml',
  'pa', 'ur', 'es', 'fr', 'de', 'it', 'pt_BR', 'ar', 'id', 'ja', 'ko', 'zh_CN',
];

const OTP_TYPES: {
  value: AuthDraft['otpType'];
  title: string;
  description: string;
}[] = [
  {
    value: 'COPY_CODE',
    title: 'Copy code',
    description:
      'The customer taps to copy the code, then pastes it into your app. Works everywhere.',
  },
  {
    value: 'ONE_TAP',
    title: 'One-tap autofill',
    description:
      'Your Android app receives the code when they tap. Best experience, needs app changes.',
  },
  {
    value: 'ZERO_TAP',
    title: 'Zero-tap',
    description:
      'The code goes straight to your Android app with no tap at all.',
  },
];

export function WizardStepAuth({
  draft,
  onChange,
}: {
  draft: WizardDraft;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const auth = draft.auth;
  const patchAuth = (fields: Partial<AuthDraft>) =>
    onChange({ auth: { ...auth, ...fields } });

  const needsHandshake = auth.otpType !== 'COPY_CODE';
  const definition = definitionFromDraft(draft, 'Authentication', 'authentication');

  const expiryNumber = Number.parseInt(auth.codeExpirationMinutes, 10);
  const expiryInvalid =
    auth.codeExpirationMinutes.trim() !== '' &&
    (!Number.isFinite(expiryNumber) ||
      expiryNumber < AUTH_LIMITS.minExpiryMinutes ||
      expiryNumber > AUTH_LIMITS.maxExpiryMinutes);

  const ttlNumber = Number.parseInt(auth.ttlSeconds, 10);
  const ttlInvalid =
    auth.ttlSeconds.trim() !== '' &&
    (!Number.isFinite(ttlNumber) ||
      ttlNumber < AUTH_LIMITS.minTtlSeconds ||
      ttlNumber > AUTH_LIMITS.maxTtlSeconds);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        {/* Set expectations before the form, not after it. */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>
              WhatsApp writes the message for authentication templates. You
              cannot change the wording, add a header, or add your own buttons
              — that restriction is why these are the cheapest messages to send
              and the least likely to be paused.
            </p>
            <p className="mt-1.5">
              Meta also requires business verification and a messaging limit of
              at least 2,000 conversations a day before it will approve this
              category.
            </p>
          </div>
        </div>

        {/* ---- Name + language ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Name your template</Label>
              <Input
                id="auth-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder="verification_code"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and underscores.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-lang">Select language</Label>
              <Select
                value={draft.language}
                onValueChange={(v) => onChange({ language: v || 'en_US' })}
              >
                <SelectTrigger id="auth-lang" className="w-full">
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

        {/* ---- Code delivery ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            How the customer gets the code
          </h2>

          <div
            role="radiogroup"
            aria-label="One-time password button type"
            className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border"
          >
            {OTP_TYPES.map((option) => {
              const active = auth.otpType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => patchAuth({ otpType: option.value })}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                    active ? 'bg-primary/[0.07]' : 'hover:bg-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                      active ? 'border-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {active ? (
                      <span className="size-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="auth-btn-text">
              Button label{' '}
              <span className="text-muted-foreground">· optional</span>
            </Label>
            <Input
              id="auth-btn-text"
              value={auth.buttonText}
              onChange={(e) => patchAuth({ buttonText: e.target.value })}
              maxLength={AUTH_LIMITS.buttonTextMaxLength}
              placeholder="Copy code"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank and WhatsApp uses its own wording, translated to the
              template language. Max {AUTH_LIMITS.buttonTextMaxLength}{' '}
              characters.
            </p>
          </div>

          {needsHandshake ? (
            <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {auth.otpType} works on Android only, and needs your app to
                  complete a handshake with Meta. On iOS — or if the handshake
                  fails — WhatsApp shows a copy-code button instead, using the
                  label above. That fallback is why the label matters even here.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-package">Android package name</Label>
                <Input
                  id="auth-package"
                  value={auth.packageName}
                  onChange={(e) => patchAuth({ packageName: e.target.value })}
                  placeholder="com.example.myapp"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-hash">App signing key hash</Label>
                <Input
                  id="auth-hash"
                  value={auth.signatureHash}
                  onChange={(e) => patchAuth({ signatureHash: e.target.value })}
                  placeholder="K8a/AINcGX7"
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-autofill">
                  Autofill label{' '}
                  <span className="text-muted-foreground">· optional</span>
                </Label>
                <Input
                  id="auth-autofill"
                  value={auth.autofillText}
                  onChange={(e) => patchAuth({ autofillText: e.target.value })}
                  maxLength={AUTH_LIMITS.buttonTextMaxLength}
                  placeholder="Autofill"
                />
              </div>
            </div>
          ) : null}
        </section>

        {/* ---- Wording add-ons + validity ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Security and expiry
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The only parts of the wording you control.
          </p>

          <label className="mt-4 flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3">
            <span>
              <span className="block text-sm font-medium text-foreground">
                Add the security disclaimer
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Appends &ldquo;For your security, do not share this
                code.&rdquo; Meta recommends it.
              </span>
            </span>
            <Switch
              checked={auth.addSecurityRecommendation}
              onCheckedChange={(v: boolean) =>
                patchAuth({ addSecurityRecommendation: v })
              }
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="auth-expiry">Code expires after (minutes)</Label>
              <Input
                id="auth-expiry"
                inputMode="numeric"
                value={auth.codeExpirationMinutes}
                onChange={(e) =>
                  patchAuth({
                    codeExpirationMinutes: e.target.value.replace(/\D/g, ''),
                  })
                }
                placeholder="10"
                aria-invalid={expiryInvalid}
                className={expiryInvalid ? 'border-destructive' : undefined}
              />
              <p
                className={cn(
                  'text-xs',
                  expiryInvalid
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {expiryInvalid
                  ? `Must be between ${AUTH_LIMITS.minExpiryMinutes} and ${AUTH_LIMITS.maxExpiryMinutes}.`
                  : 'Adds an expiry line to the message and disables the button after this long. Blank shows no warning — the button still stops working after 10 minutes.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-ttl">
                Stop trying to deliver after (seconds)
              </Label>
              <Input
                id="auth-ttl"
                inputMode="numeric"
                value={auth.ttlSeconds}
                onChange={(e) =>
                  patchAuth({ ttlSeconds: e.target.value.replace(/\D/g, '') })
                }
                placeholder="600"
                aria-invalid={ttlInvalid}
                className={ttlInvalid ? 'border-destructive' : undefined}
              />
              <p
                className={cn(
                  'text-xs',
                  ttlInvalid ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {ttlInvalid
                  ? `Must be between ${AUTH_LIMITS.minTtlSeconds} and ${AUTH_LIMITS.maxTtlSeconds}.`
                  : 'Best set at or below the code expiry, so a customer never receives a code that has already stopped working.'}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ---- Preview ---- */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Template preview
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            WhatsApp&apos;s fixed wording, with your choices applied.
          </p>

          <WhatsAppPreview definition={definition} className="mt-3" />

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            The{' '}
            <span className="rounded bg-primary/15 px-1 font-medium text-primary">
              {'{{1}}'}
            </span>{' '}
            is the code, filled in when you send.
            {draft.language !== 'en_US' && draft.language !== 'en' ? (
              <>
                {' '}
                Shown in English here — WhatsApp translates this wording into{' '}
                {draft.language} on delivery.
              </>
            ) : null}
          </p>
        </div>
      </aside>
    </div>
  );
}
