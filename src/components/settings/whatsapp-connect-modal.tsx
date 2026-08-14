'use client';

import { useState } from 'react';
import { Phone, MessageSquare, ArrowLeftRight, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WhatsAppConnectModalProps {
  open: boolean;
  onClose: () => void;
  onContinue: (option: string) => void;
  loading: boolean;
}

const CONNECTION_OPTIONS = [
  {
    id: 'new',
    icon: Phone,
    title: 'I want to use a new number that is not active on any WhatsApp Business app',
    tutorial: '#',
  },
  {
    id: 'existing',
    icon: MessageSquare,
    title: "I want to use a phone number that's currently active on WhatsApp Business app",
    tutorial: '#',
  },
  {
    id: 'migrate',
    icon: ArrowLeftRight,
    title: 'I want to migrate my existing WhatsApp API number from another provider (Twilio, Wati, Interakt, AiSensy, etc.)',
    tutorial: '#',
  },
] as const;

export function WhatsAppConnectModal({ open, onClose, onContinue, loading }: WhatsAppConnectModalProps) {
  const [selectedOption, setSelectedOption] = useState<string>('new');
  const [otpConfirmed, setOtpConfirmed] = useState(false);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="size-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Connect WhatsApp Business API</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Options */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-3 gap-3">
              {CONNECTION_OPTIONS.map((option) => {
                const isSelected = selectedOption === option.id;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => setSelectedOption(option.id)}
                    className={`relative flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-150 ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/50'
                    }`}
                  >
                    {/* Selection indicator */}
                    <div className={`absolute right-3 top-3 flex size-5 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    }`}>
                      {isSelected && (
                        <svg className="size-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    <div className={`flex size-10 items-center justify-center rounded-lg transition-colors ${
                      isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="size-5" />
                    </div>

                    <p className="text-sm font-medium leading-snug text-foreground pr-6">
                      {option.title}
                    </p>

                    <span className="text-xs font-medium text-primary hover:underline cursor-pointer">
                      Watch tutorial
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ---- Coexistence: the things that cannot be undone ----
                Shown only for the "already on WhatsApp Business app"
                option, because that is the one that goes through Meta's
                Coexistence flow.

                These are BEFORE-you-connect facts, not nice-to-knows. The
                profile picture in particular cannot be changed afterwards,
                so learning it later means living with the wrong logo or
                re-onboarding. Every one of these becomes a support ticket
                if it is not said here. */}
            {selectedOption === 'existing' ? (
              <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Do these first — they cannot be changed afterwards
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-amber-700/90 dark:text-amber-400/90">
                  <li className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>
                      <strong>Set your profile picture and business info</strong>{' '}
                      in the WhatsApp Business app now. They cannot be updated
                      once connected.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>
                      Any <strong>linked devices</strong> (WhatsApp Web, tablets)
                      will be unlinked. You can re-link supported ones after.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>
                      You will be asked on your phone whether to{' '}
                      <strong>share chat history</strong>. Say yes if you want
                      your past chats in the CRM — this is a one-time offer.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>
                      Keep the app installed and <strong>open it every 13
                      days</strong>, or Meta will disconnect the number.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>
                      The green <strong>Official Business Account</strong> badge
                      and WhatsApp calling are not available on this setup.
                    </span>
                  </li>
                </ul>
              </div>
            ) : null}

            {/* Verification Requirements */}
            <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Verification Requirements</span>
              </div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={otpConfirmed}
                  onChange={(e) => setOtpConfirmed(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border accent-primary cursor-pointer"
                />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                  I confirm that I can receive OTP (One-Time Password) via SMS or Call on this number
                </span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to our{' '}
              <a href="/terms" className="text-primary hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={() => onContinue(selectedOption)}
                disabled={!otpConfirmed || loading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {loading ? (
                  <>
                    <svg className="mr-2 size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connecting...
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
