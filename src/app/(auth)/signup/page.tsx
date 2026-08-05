"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { MessageSquare, CheckCircle, UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /login.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  // When the user lands here from `/join/<token>` we carry the
  // invite token in the query so it survives the signup → email
  // verification → redirect round-trip. `emailRedirectTo` below
  // points back at /join/<token> so the user lands on the redeem
  // step after verifying instead of being dropped on /dashboard.
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    // If we have an invite token, point Supabase's verification
    // email back at the join page so the user can accept after
    // verifying. Without a token, Supabase uses its default
    // redirect (the app root).
    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
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
            <img src="/Replai-logo.png" alt="Replai Logo" className="h-10 w-auto mb-8" />
            <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Check your email</h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              We&apos;ve sent a confirmation link to verify your account.
            </p>
          </div>
        </div>

        {/* Right Panel: Form */}
        <div className="flex w-full lg:w-1/2 items-center justify-center px-4 sm:px-8 bg-white">
          <Card className="w-full max-w-md border-0 sm:border border-slate-200 sm:bg-white shadow-none sm:shadow-xl sm:shadow-slate-200/50">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 shadow-inner">
              <CheckCircle className="h-7 w-7 text-[#25D366]" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 mt-2">
              Check your email
            </CardTitle>
            <CardDescription className="text-slate-500">
              We&apos;ve sent a confirmation link to{" "}
              <span className="font-medium text-slate-900">{email}</span>. Please check your
              inbox and click the link to verify your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
            >
              <Button
                variant="outline"
                className="w-full border-slate-200 h-11 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium"
              >
                Back to sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

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
          <img src="/Replai-logo.png" alt="Replai Logo" className="h-10 w-auto mb-8" />
          <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Scale your customer communication</h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Join thousands of businesses using Replai to automate WhatsApp support, sales, and marketing.
          </p>
        </div>
      </div>

      {/* Right Panel: Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-4 sm:px-8 bg-white">
        <Card className="w-full max-w-md border-0 sm:border border-slate-200 sm:bg-white shadow-none sm:shadow-xl sm:shadow-slate-200/50">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 shadow-inner">
            {inviteToken ? (
              <UsersRound className="h-7 w-7 text-[#25D366]" />
            ) : (
              <img src="/logo-icon.png" alt="Replai" className="h-8 w-8 object-contain" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 mt-2">
            {inviteToken ? "Create account & join" : "Create account"}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {inviteToken
              ? "Verify your email, then accept the invitation to join your team."
              : "Get started with Replai"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName" className="text-slate-700 font-medium">
                Full name
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#25D366] focus-visible:ring-[#25D366]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-slate-700 font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#25D366] focus-visible:ring-[#25D366]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#25D366] focus-visible:ring-[#25D366]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">
                Confirm password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-[#25D366] focus-visible:ring-[#25D366]/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-4 h-11 w-full bg-[#25D366] text-white hover:bg-[#1DA851] disabled:opacity-50 font-medium shadow-md shadow-[#25D366]/20 transition-all active:scale-[0.98]"
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
              className="font-medium text-[#25D366] hover:text-[#1DA851]"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
