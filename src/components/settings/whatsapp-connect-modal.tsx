'use client';

import { useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  MessageSquare,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

interface WhatsAppConnectModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: (option: string) => void;
  loading: boolean;
}

interface Requirement {
  id: string;
  label: string;
}

/**
 * The three ways a number can arrive, and what the operator must confirm
 * for each.
 *
 * ── Why the requirements live on the option, not on the modal ──────
 *
 * Each path verifies through a DIFFERENT channel, so a single shared
 * "I can receive an OTP" tick was wrong for two of the three:
 *
 *   • new      — Meta sends an SMS / voice OTP to the number.
 *   • existing — Coexistence verifies IN the WhatsApp Business app; no SMS
 *                is sent at all, so asking about SMS misdirects the
 *                operator into watching the wrong place and reporting a
 *                code that "never arrived".
 *   • migrate  — SMS OTP, AND two-step verification must be OFF at the
 *                current provider first. Meta rejects the migration
 *                outright otherwise, and that rejection is the single most
 *                common reason a provider move fails.
 *
 * `id` values are Meta-facing (`launchFBLogin` maps them to featureType) —
 * do not rename them.
 */
export const CONNECTION_OPTIONS: ReadonlyArray<{
  id: string;
  icon: typeof Phone;
  title: string;
  requirements: readonly Requirement[];
}> = [
  {
    id: 'new',
    icon: Phone,
    title:
      'I want to use a new number that is not active on any WhatsApp Business app',
    requirements: [
      {
        id: 'otp_sms',
        label:
          'I confirm that I can receive OTP (One-Time Password) via SMS or Call on this number',
      },
    ],
  },
  {
    id: 'existing',
    icon: MessageSquare,
    title:
      "I want to use a phone number that's currently active on WhatsApp Business app",
    requirements: [
      {
        id: 'otp_whatsapp',
        label:
          'I confirm that I can receive WhatsApp verification code on this number',
      },
    ],
  },
  {
    id: 'migrate',
    icon: ArrowLeftRight,
    title:
      'I want to migrate my existing WhatsApp API number from another provider (Twilio, Wati, Interakt, AiSensy, etc.)',
    requirements: [
      {
        id: 'otp_sms',
        label:
          'I confirm that I can receive OTP (One-Time Password) via SMS or Call on this number',
      },
      {
        id: 'no_2fa',
        label:
          'I confirm that two-factor authentication is disabled for my current WhatsApp Business API',
      },
    ],
  },
];

/**
 * The irreversible parts of Coexistence, kept as a collapsed disclosure.
 *
 * These used to be an always-open amber panel, which buried the actual
 * decision under a wall of warnings. They are still here because every one
 * of them is a one-way door — the profile picture genuinely cannot be
 * changed after connecting — and silently dropping them turns each into a
 * support ticket. Collapsed by default so the modal reads as cleanly as the
 * rest of the flow, and only rendered for the one path it applies to.
 */
const COEXISTENCE_CAVEATS = [
  'Set your profile picture and business info in the WhatsApp Business app first — they cannot be changed after connecting.',
  'Linked devices (WhatsApp Web, tablets) are unlinked. Supported ones can be re-linked afterwards.',
  'Your phone will ask whether to share chat history. Say yes to bring past chats into the CRM — it is a one-time offer.',
  'Keep the app installed and open it at least every 13 days, or Meta disconnects the number.',
  'The green Official Business Account badge and WhatsApp calling are not available on this setup.',
] as const;

/**
 * Checkbox that reads as a checkbox in every theme.
 *
 * The native input was rendered with `accent-primary`, which the browser
 * ignores for the unchecked box: on this dark-by-default palette that left
 * a filled black square that looked broken and did not look selectable.
 * A visually-hidden input keeps full keyboard and screen-reader behaviour
 * while the visible box is ours to style.
 */
function ConfirmCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 py-1">
      <span className="relative mt-px flex size-[18px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        {/* Deliberately no `group-hover` border: it would target the same
            property as `peer-checked`, and Tailwind's variant order decides
            the winner, so a checked box under the cursor could render with
            the unchecked border. The label text carries the hover cue. */}
        <span className="border-muted-foreground/40 bg-card peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-ring/50 pointer-events-none absolute inset-0 rounded-[5px] border-2 transition-colors peer-focus-visible:ring-2" />
        <Check
          className="text-primary-foreground pointer-events-none relative size-3 opacity-0 transition-opacity peer-checked:opacity-100"
          strokeWidth={3.5}
          aria-hidden
        />
      </span>
      <span className="text-muted-foreground group-hover:text-foreground text-sm leading-relaxed transition-colors">
        {label}
      </span>
    </label>
  );
}

export function WhatsAppConnectModal({
  open,
  onClose,
  onContinue,
  loading,
}: WhatsAppConnectModalProps) {
  const [selectedOption, setSelectedOption] = useState<string>('new');
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const activeOption =
    CONNECTION_OPTIONS.find((o) => o.id === selectedOption) ??
    CONNECTION_OPTIONS[0];

  const allConfirmed = activeOption.requirements.every((r) => confirmed[r.id]);
  const canContinue = allConfirmed && !loading;

  function selectOption(id: string) {
    setSelectedOption(id);
    // Clear the ticks on switch. `otp_sms` is shared between two paths, so
    // carrying state over would let someone confirm it for a new number,
    // switch to migration, and continue having never seen the 2FA
    // condition that path actually depends on.
    setConfirmed({});
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="animate-in fade-in-0 fixed inset-0 z-50 bg-black/60 backdrop-blur-sm duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="border-border bg-card animate-in fade-in-0 zoom-in-95 relative flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ---- Header ---- */}
          <div className="border-border flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
                <MessageSquare className="text-primary size-5" />
              </div>
              <h2 className="text-foreground text-lg font-semibold">
                Connect WhatsApp Business API
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-1.5 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {/* ---- The three paths ---- */}
            <div
              role="radiogroup"
              aria-label="How do you want to connect your number?"
              className="grid gap-3 sm:grid-cols-3"
            >
              {CONNECTION_OPTIONS.map((option) => {
                const isSelected = selectedOption === option.id;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => selectOption(option.id)}
                    className={`focus-visible:ring-ring/50 relative flex h-full flex-col items-start gap-3 rounded-xl border-2 p-4 pr-9 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:outline-none ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40'
                    }`}
                  >
                    {/* Selection indicator */}
                    <span
                      className={`absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {isSelected ? (
                        <Check
                          className="text-primary-foreground size-3"
                          strokeWidth={3.5}
                          aria-hidden
                        />
                      ) : null}
                    </span>

                    <span
                      className={`flex size-10 items-center justify-center rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>

                    {/* mt-auto pins the tutorial link to the bottom so all
                        three cards line up regardless of title length. */}
                    <span className="text-foreground text-sm leading-snug font-medium">
                      {option.title}
                    </span>

                    <span className="text-primary mt-auto text-xs font-medium hover:underline">
                      Watch tutorial
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ---- Coexistence: the one-way doors, collapsed ---- */}
            {selectedOption === 'existing' ? (
              <details className="group border-border bg-muted/20 mt-4 rounded-lg border">
                <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
                  <span>
                    Before you connect — 5 things you can&rsquo;t undo
                  </span>
                  <ChevronDown
                    className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <ul className="text-muted-foreground space-y-2 px-4 pb-4 text-sm">
                  {COEXISTENCE_CAVEATS.map((caveat) => (
                    <li key={caveat} className="flex gap-2 leading-relaxed">
                      <span aria-hidden className="text-primary">
                        •
                      </span>
                      <span>{caveat}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {/* ---- Verification requirements, specific to the path ---- */}
            <div className="border-border bg-muted/30 mt-4 rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck
                  className="text-muted-foreground size-4"
                  aria-hidden
                />
                <span className="text-foreground text-sm font-medium">
                  Verification Requirements
                </span>
              </div>
              <div className="divide-border/60 divide-y">
                {activeOption.requirements.map((requirement) => (
                  <ConfirmCheckbox
                    key={requirement.id}
                    checked={Boolean(confirmed[requirement.id])}
                    onChange={(next) =>
                      setConfirmed((prev) => ({
                        ...prev,
                        [requirement.id]: next,
                      }))
                    }
                    label={requirement.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ---- Footer ---- */}
          <div className="border-border flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">
              By continuing, you agree to our{' '}
              <a href="/terms" className="text-primary hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </a>
            </p>
            <div className="flex items-center gap-3 sm:shrink-0">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={() => onContinue(selectedOption)}
                disabled={!canContinue}
                // Spelled out rather than left to the disabled default: the
                // button is the only thing gating the flow, so "not yet
                // clickable" has to be unmistakable.
                title={
                  allConfirmed
                    ? undefined
                    : 'Confirm the verification requirements above to continue'
                }
              >
                {loading ? (
                  <>
                    <svg
                      className="mr-2 size-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Connecting…
                  </>
                ) : (
                  'Continue with Facebook'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
