"use client";
// Force rebuild to resolve Turbopack hydration mismatch

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("/Replai-logo.png");
  const [iconUrl, setIconUrl] = useState<string>("/logo-icon.png");
  const [siteName, setSiteName] = useState<string>("Replai");
  const supabase = createClient();

  useEffect(() => {
    async function loadBranding() {
      try {
        const res = await fetch("/api/public/settings", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.logo_url) setLogoUrl(data.settings.logo_url);
          if (data.settings?.favicon_url) setIconUrl(data.settings.favicon_url);
          if (data.settings?.site_name) setSiteName(data.settings.site_name);
        }
      } catch (err) {
        console.error("Failed to load branding in login page:", err);
      }
    }
    loadBranding();
  }, []);

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

    // Full-page navigation (not router.push) so the browser issues a
    // fresh top-level request that carries the just-written Supabase
    // auth cookies to the middleware gating /dashboard. A soft
    // client-side navigation can reach the protected route before the
    // server observes the new session, so the middleware bounces it
    // back to /login — which looks like the page "just refreshing"
    // instead of signing in (issue #365). Mirrors the deliberate full
    // reload the invite-accept flow already uses in join/[token].
    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    window.location.href = destination;
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel: Animation & Graphic */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-50 border-r border-slate-100 items-center justify-center overflow-hidden">
        {/* Animated Background Orbs */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#25D366]/20 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-200/50 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-float" style={{ animationDelay: '2s' }} />
        
        {/* Subtle Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        
        <div className="relative z-10 max-w-lg px-8 text-center flex flex-col items-center">
          <img src={logoUrl} alt={siteName} suppressHydrationWarning className="h-24 w-auto max-w-[360px] object-contain mb-8" />
          <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Scale your customer communication</h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Join thousands of businesses using {siteName} to automate WhatsApp support, sales, and marketing.
          </p>
        </div>
      </div>

      {/* Right Panel: Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-4 sm:px-8 bg-white">
        <Card className="w-full max-w-md border-0 sm:border border-slate-200 sm:bg-white shadow-none sm:shadow-xl sm:shadow-slate-200/50">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 shadow-inner">
            {inviteToken ? (
              <UsersRound className="h-8 w-8 text-[#25D366]" />
            ) : (
              <img src={iconUrl} alt={siteName} suppressHydrationWarning className="h-10 w-10 object-contain" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 mt-2">
            {inviteToken ? t('titleAccept') : t('titleWelcome')}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {inviteToken
              ? t('descAccept')
              : t('descWelcome')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-slate-700 font-medium">
                {t('emailLabel')}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#25D366] focus-visible:ring-[#25D366]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  {t('passwordLabel')}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-[#25D366] hover:text-[#1DA851]"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#25D366] focus-visible:ring-[#25D366]/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-4 h-11 w-full bg-[#25D366] text-white hover:bg-[#1DA851] disabled:opacity-50 font-medium shadow-md shadow-[#25D366]/20 transition-all active:scale-[0.98]"
            >
              {loading ? t('signingIn') : t('signIn')}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            {t('noAccount')}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="font-medium text-[#25D366] hover:text-[#1DA851]"
            >
              {t('createAccount')}
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
