'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useBranding } from '@/hooks/use-branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { EMAIL_INVALID_MESSAGE, isValidEmail } from '@/lib/validation/email';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  UsersRound,
  Loader2,
  AlertCircle,
  Bot,
  CheckCheck,
} from 'lucide-react';

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const { logoUrl, faviconUrl: iconUrl, siteName } = useBranding();

  const [fullName, setFullName] = useState('');
  // Full E.164 (e.g. +919876543210) as emitted by PhoneInput, plus the
  // component's own per-country validity verdict. Both are needed: the
  // string is what we submit, the flag is what gates the submit.
  const [phone, setPhone] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here as well as on the server. The browser's own
    // `type="email"` validation is not enough: it accepts a domain with
    // no dot (`akash@junkiescoder`) by design, which is an address no
    // confirmation link can ever reach.
    if (!isValidEmail(email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }

    // PhoneInput shows its own inline, country-specific message (e.g.
    // "must be exactly 10 digits"). This guard only has to stop the
    // submit; repeating the detail here would contradict it.
    if (!isPhoneValid) {
      setError('Please enter a valid phone number');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone,
          inviteToken: inviteToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        setLoading(false);
        return;
      }
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  const LeftHeroPanel = (
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

      {/* Center Hero Content */}
      <div className="relative z-10 my-auto max-w-lg py-8">
        <h2 className="text-3xl leading-tight font-bold tracking-tight text-slate-900 xl:text-4xl">
          Scale your customer communication
        </h2>
        <p className="mt-3.5 text-base leading-relaxed text-slate-600">
          Join thousands of businesses using {siteName} to automate WhatsApp
          support, sales, and marketing.
        </p>

        {/* WhatsApp CRM Preview Card */}
        <div className="mt-8 space-y-3 rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
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

          <div className="space-y-2 text-xs">
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2 text-slate-700 shadow-2xs">
                <p>
                  Can I automate WhatsApp notifications for customer inquiries?
                </p>
                <span className="mt-1 block text-right text-[10px] text-slate-400">
                  10:42 AM
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2 text-slate-800 shadow-2xs">
                <p>
                  Yes! Connect your WhatsApp Business API and trigger smart
                  workflows in under 2 minutes. ⚡
                </p>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                  <span>10:42 AM</span>
                  <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="relative z-10 flex items-center justify-between border-t border-slate-200/60 pt-4 text-xs text-slate-500">
        <span>Official WhatsApp Cloud API</span>
        <span>
          © {new Date().getFullYear()} {siteName}
        </span>
      </div>
    </div>
  );

  if (success) {
    return (
      <div className="flex min-h-screen w-full bg-slate-50 selection:bg-[#25D366]/20 selection:text-emerald-900">
        {LeftHeroPanel}

        <div className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
          <div className="w-full max-w-[420px]">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-xl shadow-slate-200/40 sm:p-9">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-50 text-[#25D366]">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Check your email
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We&apos;ve sent a confirmation link to{' '}
                <span className="font-semibold text-slate-900">{email}</span>.
                Please check your inbox to activate your account.
              </p>

              <div className="mt-7">
                <Link
                  href={
                    inviteToken
                      ? `/login?invite=${encodeURIComponent(inviteToken)}`
                      : '/login'
                  }
                >
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl border-slate-200 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Back to sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-slate-50 selection:bg-[#25D366]/20 selection:text-emerald-900">
      {LeftHeroPanel}

      {/* Right Panel: Signup Form */}
      <div className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xl shadow-slate-200/40 sm:p-9">
            {/* Header */}
            <div className="mb-6 flex flex-col items-center text-center">
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
                {inviteToken ? 'Create account & join' : 'Create account'}
              </h1>
              <p className="mt-1 text-sm font-normal text-slate-500">
                {inviteToken
                  ? 'Verify your email, then accept the invitation to join your team.'
                  : `Get started with ${siteName}`}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-sm text-red-700 shadow-2xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="flex-1 leading-snug font-medium">{error}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSignup} className="flex flex-col gap-3.5">
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="fullName"
                  className="text-sm font-medium text-slate-700"
                >
                  Full name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  className="auth-input h-11 rounded-xl border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15"
                />
              </div>

              {/* Phone number — required, validated per country */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="phone"
                  className="text-sm font-medium text-slate-700"
                >
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                {/* PhoneInput is built for the themed app shell: it styles
                    itself from the `--muted` / `--border` / `--foreground`
                    CSS variables, which default to the DARK palette
                    (globals.css sets the dark values on `:root`). This page
                    is hard-coded light, so the control would render dark on
                    a white card. `data-mode="light"` re-declares those
                    variables for this subtree only — the same mechanism the
                    theme switcher uses — instead of forking the shared
                    component, which the contacts and broadcast screens also
                    depend on.

                    The arbitrary selectors only fix GEOMETRY (the control
                    is h-9 by default; every field on this form is h-11 with
                    a pill radius). Colours are left to the variables. */}
                <div data-mode="light">
                  <PhoneInput
                    id="phone"
                    value={phone}
                    defaultCountryCode="IN"
                    required
                    placeholder="98765 43210"
                    onChange={(fullE164, valid) => {
                      setPhone(fullE164);
                      setIsPhoneValid(valid);
                      // Clear a stale "valid phone number" banner as soon
                      // as the field is being corrected.
                      setError(null);
                    }}
                    className="[&>div]:h-11 [&>div]:rounded-xl [&>div]:border-slate-200 [&>div]:bg-white [&>div]:shadow-2xs [&>div>button]:h-11 [&>div>button]:rounded-l-xl [&>div>button]:bg-slate-50 [&>div>input]:h-11"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-700"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="auth-input h-11 rounded-xl border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-700"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
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

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-slate-700"
                >
                  Confirm password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="auth-input h-11 rounded-xl border-slate-200 bg-white pr-10 pl-3.5 text-sm text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
                  >
                    {showConfirmPassword ? (
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
                    <span>Creating account...</span>
                  </>
                ) : (
                  <span>Create account</span>
                )}
              </Button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-sm font-normal text-slate-500">
              Already have an account?{' '}
              <Link
                href={
                  inviteToken
                    ? `/login?invite=${encodeURIComponent(inviteToken)}`
                    : '/login'
                }
                className="font-semibold text-[#25D366] underline-offset-4 transition-colors hover:text-[#128C7E] hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
