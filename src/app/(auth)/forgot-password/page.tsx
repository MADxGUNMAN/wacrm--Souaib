'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Mail,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [iconUrl, setIconUrl] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('Replai');

  useEffect(() => {
    async function loadBranding() {
      try {
        const res = await fetch('/api/public/settings', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.favicon_url) setIconUrl(data.settings.favicon_url);
          if (data.settings?.site_name) setSiteName(data.settings.site_name);
        }
      } catch (err) {
        console.error('Failed to load branding:', err);
      }
    }
    loadBranding();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send reset link');
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

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-6 selection:bg-[#25D366]/20 selection:text-emerald-900 sm:p-10">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#25D366]/10 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="rounded-3xl border border-slate-200/90 bg-white p-7 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.02)] sm:p-9">
          {success ? (
            <div className="text-center">
              <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-50 text-[#25D366] shadow-sm">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Check your email
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We&apos;ve sent a password reset link to{' '}
                <span className="font-semibold text-slate-900">{email}</span>.
                Please check your inbox.
              </p>

              <div className="mt-7">
                <Link href="/login">
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back to sign in
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-7 flex flex-col items-center text-center">
                <Link
                  href="/"
                  title="Go to home"
                  className="group relative mb-3.5 flex items-center justify-center rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#25D366]/30 to-[#128C7E]/20 opacity-70 blur-md transition duration-300 group-hover:opacity-100" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-white to-emerald-50/70 text-[#25D366] shadow-sm transition-transform group-hover:scale-105">
                    <KeyRound className="h-7 w-7" />
                  </div>
                </Link>

                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Reset password
                </h1>
                <p className="mt-1 text-sm font-normal text-slate-500">
                  Enter your email and we&apos;ll send you a recovery link
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="animate-in fade-in-50 mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-sm text-red-700 shadow-xs duration-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div className="flex-1 leading-snug font-medium">{error}</div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleReset} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
                  >
                    Email
                  </Label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="auth-input h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-3.5 pl-10 text-sm text-slate-900 shadow-none transition-all placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-[#25D366] focus:bg-white focus:ring-4 focus:ring-[#25D366]/15"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-[#25D366] to-[#128C7E] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(37,211,102,0.3)] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(37,211,102,0.4)] hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending link...</span>
                    </>
                  ) : (
                    <>
                      <span>Send reset link</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
