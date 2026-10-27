'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useBranding } from '@/hooks/use-branding';
import { AuthShowcase } from '@/components/auth/auth-showcase';
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
  const { faviconUrl: iconUrl, siteName } = useBranding();

  const [fullName, setFullName] = useState('');
  // Full E.164 (e.g. +919876543210) as emitted by PhoneInput, plus the
  // component's own per-country validity verdict. Both are needed: the
  // string is what we submit, the flag is what gates the submit.
  const [phone, setPhone] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  // Prefilled when the login page sends someone here with ?email=.
  const [email, setEmail] = useState(() =>
    (searchParams.get('email') ?? '').trim().slice(0, 254)
  );
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

  const LeftHeroPanel = <AuthShowcase variant="whatsapp" />;

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
                  Phone number
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
