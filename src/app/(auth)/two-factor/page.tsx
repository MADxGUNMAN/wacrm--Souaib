'use client';

// ============================================================
// /two-factor — second sign-in step.
//
// The proxy sends a signed-in session here while it still owes a code:
//   personal → the user's own authenticator code (or a recovery code)
//   owner    → the workspace owner's authenticator code; required for
//              members when the owner turned on "Require Owner 2FA
//              Verification for Members". The member's own code is not
//              accepted.
// ============================================================

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { AuthShowcase } from '@/components/auth/auth-showcase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { browserTimezone, signOutWithAudit } from '@/lib/security/client';
import { safeTwoFactorNext } from '@/lib/two-factor/next-path';

type Required = 'none' | 'personal' | 'owner';

interface Challenge {
  required: Required;
  satisfied: boolean;
  owner_name: string | null;
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={null}>
      <TwoFactorInner />
    </Suspense>
  );
}

function TwoFactorInner() {
  const searchParams = useSearchParams();
  const next = safeTwoFactorNext(searchParams.get('next'));
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = useCallback(() => {
    window.location.replace(next);
  }, [next]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/security/two-factor/challenge', {
        cache: 'no-store',
      });
      if (res.status === 401) {
        window.location.replace('/login');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load verification');
      if (data.required === 'none' || data.satisfied) {
        finish();
        return;
      }
      setChallenge(data as Challenge);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [finish]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (challenge) inputRef.current?.focus();
  }, [challenge, useRecovery]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/security/two-factor/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          method: useRecovery ? 'recovery' : 'totp',
          timezone: browserTimezone(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        finish();
        return;
      }
      if (res.status === 401) {
        window.location.replace('/login');
        return;
      }
      if (data.code === 'requirement_changed') {
        await load();
      }
      setError(data.error || 'Verification failed. Try again.');
      setCode('');
      inputRef.current?.focus();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await signOutWithAudit('local');
    window.location.replace('/login');
  };

  const isOwner = challenge?.required === 'owner';
  const digitsOnly = !useRecovery;
  const canSubmit = digitsOnly
    ? /^\d{6}$/.test(code)
    : code.replace(/[^A-Za-z0-9]/g, '').length === 10;

  return (
    <div className="flex min-h-screen w-full bg-slate-50 selection:bg-[#25D366]/20 selection:text-emerald-900">
      <AuthShowcase variant="gradient" />

      <div className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xl shadow-slate-200/40 sm:p-9">
            {!challenge ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-slate-500">
                {loadError ? (
                  <>
                    <AlertCircle className="h-6 w-6 text-red-500" />
                    <p>{loadError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void load()}
                    >
                      Try again
                    </Button>
                  </>
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                )}
              </div>
            ) : (
              <>
                <div className="mb-6 flex flex-col items-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                    {isOwner ? (
                      <UserRoundCheck className="h-6 w-6 text-[#25D366]" />
                    ) : (
                      <ShieldCheck className="h-6 w-6 text-[#25D366]" />
                    )}
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    {isOwner
                      ? 'Workspace Owner Verification Required'
                      : 'Two-Factor Authentication'}
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {isOwner
                      ? "Your workspace owner has enabled additional security verification. To continue, enter the 6-digit verification code from your workspace owner's authenticator app."
                      : useRecovery
                        ? 'Enter one of the recovery codes you saved when you set up two-factor authentication. Each code works once.'
                        : 'Enter the 6-digit verification code from your authenticator app to securely access your account.'}
                  </p>
                </div>

                {isOwner ? (
                  <div
                    role="note"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-800"
                  >
                    <Info
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Your personal authentication code cannot be used for this
                      verification. Please contact your workspace owner
                      {challenge.owner_name
                        ? ` (${challenge.owner_name})`
                        : ''}{' '}
                      to obtain the required code.
                    </span>
                  </div>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-sm text-red-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <span className="flex-1 leading-snug font-medium">
                      {error}
                    </span>
                  </div>
                ) : null}

                <form onSubmit={submit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="two-factor-code"
                      className="text-sm font-medium text-slate-700"
                    >
                      {isOwner
                        ? 'Workspace Owner Authentication Code'
                        : useRecovery
                          ? 'Recovery Code'
                          : 'Authentication Code'}
                    </Label>
                    <Input
                      ref={inputRef}
                      id="two-factor-code"
                      name="code"
                      value={code}
                      onChange={(e) =>
                        setCode(
                          digitsOnly
                            ? e.target.value.replace(/\D/g, '').slice(0, 6)
                            : e.target.value.toUpperCase().slice(0, 11)
                        )
                      }
                      inputMode={digitsOnly ? 'numeric' : 'text'}
                      autoComplete="one-time-code"
                      placeholder={digitsOnly ? '000000' : 'XXXXX-XXXXX'}
                      maxLength={digitsOnly ? 6 : 11}
                      aria-invalid={!!error}
                      className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.4em]"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!canSubmit || submitting}
                    className="h-11 rounded-xl bg-[#25D366] text-sm font-medium text-white hover:bg-[#1ebd59]"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Verify & Continue'
                    )}
                  </Button>
                </form>

                <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                  {!isOwner ? (
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecovery((v) => !v);
                        setCode('');
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {useRecovery
                        ? 'Use your authenticator app instead'
                        : 'Use a recovery code instead'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out and use a different account
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
