'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/auth/next-path';
import { useBranding } from '@/hooks/use-branding';
import { AuthShowcase } from '@/components/auth/auth-showcase';
import { reportFailedLogin } from '@/lib/security/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  UsersRound,
  Check,
  Bot,
} from 'lucide-react';

/** True only when the server confirms there is no account for the email. */
async function accountMissing(email: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/account-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { exists?: boolean };
    return data.exists === false;
  } catch {
    return false;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  // Strict allowlist (AI connector consent only) — never an open redirect.
  const nextPath = safeNextPath(searchParams.get('next'));
  // Set by the session heartbeat when this device was signed out from
  // Settings → Login & security on another device.
  const sessionRevoked = searchParams.get('reason') === 'session_revoked';
  const t = useTranslations('LoginPage');
  const { faviconUrl: iconUrl, siteName } = useBranding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNoAccount(false);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Wrong email/password lands in that account's Login activity as a
      // failed login. Other errors (rate limits, network) are not attempts.
      const badCredentials =
        error.status === 400 ||
        /invalid login credentials/i.test(error.message);
      if (badCredentials) {
        reportFailedLogin(email);
        // No account for this email (never created, or deleted by Replai):
        // say so and point to sign-up, like any new visitor.
        if (await accountMissing(email)) {
          setNoAccount(true);
          setLoading(false);
          return;
        }
      }
      setError(error.message);
      setLoading(false);
      return;
    }

    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : (nextPath ?? '/dashboard');
    window.location.href = destination;
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50 selection:bg-[#25D366]/20 selection:text-emerald-900">
      <AuthShowcase variant="gradient" />

      {/* Right Panel: Clean Professional Login Form */}
      <div className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
        <div className="w-full max-w-[400px]">
          {/* Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xl shadow-slate-200/40 sm:p-9">
            {/* Header */}
            <div className="mb-7 flex flex-col items-center text-center">
              <Link
                href="/"
                title="Go to home"
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-xs transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {inviteToken ? (
                  <UsersRound className="h-6 w-6 text-[#25D366]" />
                ) : iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={siteName}
                    suppressHydrationWarning
                    className="h-7 w-7 cursor-pointer object-contain"
                  />
                ) : (
                  <Bot className="h-6 w-6 text-[#25D366]" />
                )}
              </Link>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {inviteToken ? t('titleAccept') : t('titleWelcome')}
              </h1>
              <p className="mt-1 text-sm font-normal text-slate-500">
                {inviteToken ? t('descAccept') : t('descWelcome')}
              </p>
            </div>

            {/* Error Message */}
            {sessionRevoked && !error && (
              <div
                role="status"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-50 p-3.5 text-sm text-amber-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This device was signed out from another device. Sign in again
                  to continue.
                </span>
              </div>
            )}
            {noAccount && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-50 p-3.5 text-sm text-amber-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1 leading-snug">
                  <p className="font-semibold">Account doesn&apos;t exist</p>
                  <p className="mt-0.5">
                    There is no account for this email. Create a new account to
                    get started.
                  </p>
                  <Link
                    href={`/signup?email=${encodeURIComponent(email.trim())}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''}`}
                    className="mt-2 inline-block font-semibold text-emerald-700 underline underline-offset-2"
                  >
                    Create a new account
                  </Link>
                </div>
              </div>
            )}
            {error && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-sm text-red-700 shadow-2xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="flex-1 leading-snug font-medium">{error}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-700"
                >
                  {t('emailLabel')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="auth-input h-11 rounded-xl border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
                  >
                    {t('passwordLabel')}
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-[#25D366] transition-colors hover:text-[#128C7E]"
                  >
                    {t('forgotPassword')}
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="auth-input h-11 rounded-xl border-slate-200 bg-white pr-10 pl-3.5 text-sm text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-[#25D366] text-sm font-medium text-white shadow-md shadow-[#25D366]/20 transition-all hover:bg-[#1ebd59] active:scale-[0.99] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('signingIn')}</span>
                  </>
                ) : (
                  <span>{t('signIn')}</span>
                )}
              </Button>
            </form>

            {/* Footer */}
            <p className="mt-7 text-center text-sm font-normal text-slate-500">
              {t('noAccount')}{' '}
              <Link
                href={
                  inviteToken
                    ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                    : '/signup'
                }
                className="font-semibold text-[#25D366] underline-offset-4 transition-colors hover:text-[#128C7E] hover:underline"
              >
                {t('createAccount')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
