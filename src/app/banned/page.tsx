"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldBan, LogOut, Mail, MessageSquare } from "lucide-react";

export default function BannedPage() {
  const [reason, setReason] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBanInfo() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("account_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile?.account_id) {
          const { data: account } = await supabase
            .from("accounts")
            .select("name, is_banned, banned_reason")
            .eq("id", profile.account_id)
            .maybeSingle();

          if (account) {
            setAccountName(account.name || "");
            setReason(account.banned_reason);

            // If they're not actually banned, redirect to dashboard
            if (!account.is_banned) {
              window.location.href = "/dashboard";
              return;
            }
          }
        }
      } catch {
        // Silently handle errors
      } finally {
        setLoading(false);
      }
    }
    fetchBanInfo();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0F1A]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#25D366] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1A] text-white flex flex-col items-center justify-center p-6">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(239,68,68,0.08)_0%,rgba(10,15,26,0)_70%)] rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-lg text-center">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-12 opacity-60">
          <img src="/logo-icon.png" alt="Replai" className="h-9 w-9 object-contain" />
          <span className="text-xl font-black tracking-tight text-white/60">
            Replai
          </span>
        </div>

        {/* Ban Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 mb-8">
          <ShieldBan className="h-10 w-10 text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          Account Suspended
        </h1>

        {/* Subtitle */}
        <p className="text-white/50 leading-relaxed mb-6">
          The workspace{" "}
          {accountName && (
            <span className="text-white/70 font-medium">&quot;{accountName}&quot;</span>
          )}{" "}
          has been suspended by a platform administrator. All users in this
          workspace are temporarily unable to access CRM features.
        </p>

        {/* Reason Card */}
        {reason && (
          <div className="w-full p-4 rounded-xl bg-red-500/5 border border-red-500/10 mb-8 text-left">
            <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">
              Suspension Reason
            </p>
            <p className="text-sm text-white/60 leading-relaxed">{reason}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-2">
          <a
            href="mailto:support@junkiescoder.com"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm font-medium"
          >
            <Mail className="h-4 w-4" />
            Contact Support
          </a>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>

        {/* Footer note */}
        <p className="mt-10 text-xs text-white/30">
          If you believe this is an error, please reach out to{" "}
          <a
            href="mailto:support@junkiescoder.com"
            className="text-[#25D366]/60 hover:text-[#25D366] transition-colors"
          >
            support@junkiescoder.com
          </a>
        </p>
      </div>
    </div>
  );
}
