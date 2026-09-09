'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useBranding } from '@/hooks/use-branding';
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
  CheckCheck,
  Bot,
} from 'lucide-react';

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
  const t = useTranslations('LoginPage');
  const { logoUrl, faviconUrl: iconUrl, siteName } = useBranding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : '/dashboard';
    window.location.href = destination;
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50 selection:bg-[#25D366]/20 selection:text-emerald-900">
      {/* Left Panel: Clean Brand Hero & Product Preview */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-200/80 bg-gradient-to-br from-emerald-50/50 via-slate-50 to-emerald-50/20 p-12 lg:flex lg:w-1/2 xl:p-16">
        {/* Subtle Ambient Orbs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#25D366]/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

        {/* Brand Header */}
        <div className="relative z-10">
          <Link
            href="/"
            title="Go to home"
            className="inline-block rounded-lg transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={siteName}
                suppressHydrationWarning
                className="h-12 w-auto cursor-pointer object-contain"
              />
            ) : (
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {siteName}
              </span>
            )}
          </Link>
        </div>

        {/* Center Hero Content + Realistic Chat Preview */}
        <div className="relative z-10 my-auto max-w-lg py-8">
          <h2 className="text-3xl leading-tight font-bold tracking-tight text-slate-900 xl:text-4xl">
            Scale your customer communication
          </h2>
          <p className="mt-3.5 text-base leading-relaxed text-slate-600">
            Join thousands of businesses using {siteName} to automate WhatsApp
            support, sales, and marketing.
          </p>

          {/* Interactive-style WhatsApp CRM Card */}
          <div className="mt-8 space-y-3 rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
            {/* Conversation Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5 shadow-2xs">
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt={siteName}
                      suppressHydrationWarning
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Bot className="h-5 w-5 text-[#25D366]" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800">
                      {siteName} Assistant
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Automated Bot Flow
                  </span>
                </div>
              </div>
              <span className="rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Active
              </span>
            </div>

            {/* Messages */}
            <div className="space-y-2 text-xs">
              {/* Customer message */}
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-xs bg-slate-100 px-3.5 py-2 text-slate-800 shadow-2xs">
                  <p>
                    Can I automate WhatsApp notifications for customer
                    inquiries?
                  </p>
                  <span className="mt-1 block text-[10px] text-slate-400">
                    10:42 AM
                  </span>
                </div>
              </div>

              {/* Bot response */}
              <div className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-tr-xs border border-emerald-500/20 bg-gradient-to-r from-emerald-100 to-[#25D366]/20 px-3.5 py-2 text-slate-900 shadow-2xs">
                  <p className="font-medium text-emerald-950">
                    Yes! Connect your WhatsApp Business API and trigger smart
                    workflows in under 2 minutes. ⚡
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-emerald-800">
                    <span>10:42 AM</span>
                    <CheckCheck className="h-3 w-3 text-[#25D366]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Meta info */}
        <div className="relative z-10 flex items-center justify-between border-t border-slate-200/60 pt-4 text-xs text-slate-500">
          <span>Official WhatsApp Cloud API</span>
          <span>
            © {new Date().getFullYear()} {siteName}
          </span>
        </div>
      </div>

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
