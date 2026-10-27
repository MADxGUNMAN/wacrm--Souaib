'use client';

// Left-side showcase on /login and /signup. Copy is CMS-managed
// (site_settings.marketing_copy.auth, edited in CMS → Global Settings)
// and handed down by the (auth) layout through AuthCopyProvider; the
// defaults in lib/cms/marketing-copy apply when nothing is configured.

import { createContext, useContext } from 'react';
import Link from 'next/link';
import { Bot, CheckCheck } from 'lucide-react';
import { useBranding } from '@/hooks/use-branding';
import { withSiteName } from '@/lib/cms/content-helpers';
import {
  MARKETING_COPY_DEFAULTS,
  type AuthShowcaseCopy,
} from '@/lib/cms/marketing-copy';

const AuthCopyContext = createContext<AuthShowcaseCopy>(
  MARKETING_COPY_DEFAULTS.auth
);

export function AuthCopyProvider({
  value,
  children,
}: {
  value: AuthShowcaseCopy;
  children: React.ReactNode;
}) {
  return (
    <AuthCopyContext.Provider value={value}>
      {children}
    </AuthCopyContext.Provider>
  );
}

/**
 * `gradient` is the login look, `whatsapp` the signup look (WhatsApp-green
 * reply bubble with blue ticks). Same copy for both.
 */
export function AuthShowcase({
  variant = 'gradient',
}: {
  variant?: 'gradient' | 'whatsapp';
}) {
  const raw = useContext(AuthCopyContext);
  const { logoUrl, faviconUrl: iconUrl, siteName } = useBranding();
  const s = (v: string) => withSiteName(v, siteName);

  return (
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
            // eslint-disable-next-line @next/next/no-img-element
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

      {/* Center Hero Content + Chat Preview */}
      <div className="relative z-10 my-auto max-w-lg py-8">
        <h2 className="text-3xl leading-tight font-bold tracking-tight text-slate-900 xl:text-4xl">
          {s(raw.heading)}
        </h2>
        <p className="mt-3.5 text-base leading-relaxed text-slate-600">
          {s(raw.description)}
        </p>

        <div className="mt-8 space-y-3 rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
          {/* Conversation Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5 shadow-2xs">
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={iconUrl}
                    alt=""
                    suppressHydrationWarning
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Bot className="h-5 w-5 text-[#25D366]" aria-hidden="true" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800">
                    {s(raw.chat_title)}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
                </div>
                <span className="text-[11px] text-slate-400">
                  {s(raw.chat_subtitle)}
                </span>
              </div>
            </div>
            <span className="rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              {s(raw.chat_status)}
            </span>
          </div>

          {/* Messages */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-start">
              <div
                className={`max-w-[85%] rounded-2xl bg-slate-100 px-3.5 py-2 shadow-2xs ${
                  variant === 'whatsapp'
                    ? 'rounded-tl-sm text-slate-700'
                    : 'rounded-tl-xs text-slate-800'
                }`}
              >
                <p>{s(raw.customer_message)}</p>
                <span
                  className={`mt-1 block text-[10px] text-slate-400 ${variant === 'whatsapp' ? 'text-right' : ''}`}
                >
                  {raw.customer_time}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              {variant === 'whatsapp' ? (
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2 text-slate-800 shadow-2xs">
                  <p>{s(raw.bot_reply)}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <span>{raw.bot_time}</span>
                    <CheckCheck
                      className="h-3.5 w-3.5 text-[#53bdeb]"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ) : (
                <div className="max-w-[88%] rounded-2xl rounded-tr-xs border border-emerald-500/20 bg-gradient-to-r from-emerald-100 to-[#25D366]/20 px-3.5 py-2 text-slate-900 shadow-2xs">
                  <p className="font-medium text-emerald-950">
                    {s(raw.bot_reply)}
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-emerald-800">
                    <span>{raw.bot_time}</span>
                    <CheckCheck
                      className="h-3 w-3 text-[#25D366]"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="relative z-10 flex items-center justify-between border-t border-slate-200/60 pt-4 text-xs text-slate-500">
        <span>{s(raw.footer_badge)}</span>
        <span>
          © {new Date().getFullYear()} {siteName}
        </span>
      </div>
    </div>
  );
}
