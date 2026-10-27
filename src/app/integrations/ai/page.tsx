import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Eye,
  KeyRound,
  ListChecks,
  Lock,
  MessageSquare,
  PencilLine,
  Send,
  ShieldCheck,
  Sparkles,
  Unplug,
  Users,
  Zap,
  type LucideIcon,
  HelpCircle,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { getConfig } from '@/lib/ai-connector/config';
import { getIntegrationPage, getSiteSettings } from '@/lib/cms/queries';
import { AI_PAGE_SLUG, resolveAiPage } from '@/lib/cms/ai-integration-content';
import { FAQAccordion } from '../google-sheets/faq-accordion';
import { CopyMcpUrl } from './copy-mcp-url';
import { GradientTitle } from '@/components/cms/gradient-title';
import { RichText } from '@/components/cms/rich-text';

export const dynamic = 'force-dynamic';

const FALLBACK_ORIGIN = 'https://wacrm.junkiescoder.com';

const ICONS: Record<string, LucideIcon> = {
  Bot,
  Eye,
  KeyRound,
  ListChecks,
  Lock,
  MessageSquare,
  PencilLine,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
};

const iconFor = (name?: string) => (name && ICONS[name]) || ShieldCheck;

const isExternal = (url: string) => /^https?:\/\//i.test(url);

const CARD_ACCENTS = [
  {
    iconBox: 'bg-emerald-500/10 border-emerald-500/20 text-[#128C7E]',
    hoverGlow: 'from-[#25D366]/20',
    hoverBorder: 'group-hover:border-emerald-500/40',
  },
  {
    iconBox: 'bg-teal-500/10 border-teal-500/20 text-teal-600',
    hoverGlow: 'from-teal-500/20',
    hoverBorder: 'group-hover:border-teal-500/40',
  },
  {
    iconBox: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
    hoverGlow: 'from-blue-500/20',
    hoverBorder: 'group-hover:border-blue-500/40',
  },
  {
    iconBox: 'bg-purple-500/10 border-purple-500/20 text-purple-600',
    hoverGlow: 'from-purple-500/20',
    hoverBorder: 'group-hover:border-purple-500/40',
  },
  {
    iconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
    hoverGlow: 'from-amber-500/20',
    hoverBorder: 'group-hover:border-amber-500/40',
  },
  {
    iconBox: 'bg-rose-500/10 border-rose-500/20 text-rose-600',
    hoverGlow: 'from-rose-500/20',
    hoverBorder: 'group-hover:border-rose-500/40',
  },
];

async function loadPage() {
  return resolveAiPage(await getIntegrationPage(AI_PAGE_SLUG));
}

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([loadPage(), getSiteSettings()]);
  const noIndex = settings?.no_index ?? false;
  const title = page.seo_meta_title;
  const description = page.seo_meta_description;
  return {
    title: `${title} | ${settings?.site_name || 'Replai'}`,
    description,
    openGraph: {
      title,
      description,
      images: settings?.og_image_url ? [{ url: settings.og_image_url }] : [],
    },
    robots: { index: !noIndex, follow: !noIndex },
  };
}

/** Internal paths use next/link; full URLs open in a new tab. */
function SmartLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function CenteredSectionHeader({
  badge,
  badgeIcon: BadgeIcon = Sparkles,
  title,
  subtitle,
}: {
  badge?: string;
  badgeIcon?: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-16 max-w-3xl space-y-3 text-center">
      {badge ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-1 text-xs font-bold tracking-wider text-emerald-800 uppercase">
          <BadgeIcon className="h-3.5 w-3.5 text-emerald-600" />
          <span>{badge}</span>
        </div>
      ) : null}
      <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export default async function AiConnectorPage() {
  const page = await loadPage();
  const c = page.content;
  const origin = getConfig().issuer || FALLBACK_ORIGIN;
  const mcpUrl = `${origin}/mcp`;
  const ctas = [page.primary_cta, page.secondary_cta].filter(
    (x): x is { text: string; url: string } => x !== null
  );

  return (
    <div className="relative overflow-hidden">
      {/* Background Ambient Radial Glows (matching landing page) */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.15)_0%,rgba(255,255,255,0)_70%)] blur-[80px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(18,140,126,0.1)_0%,rgba(255,255,255,0)_70%)] blur-[100px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-6 py-12 lg:py-20">
        {/* Breadcrumbs - Centered Pill */}
        <div className="mb-10 flex justify-center">
          <nav
            aria-label="Breadcrumb"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/80 px-4 py-1.5 text-xs font-medium text-slate-500 shadow-xs backdrop-blur-md"
          >
            <Link href="/" className="transition-colors hover:text-emerald-700">
              Home
            </Link>
            <span aria-hidden="true" className="text-slate-300">
              /
            </span>
            <span className="text-slate-400">Integrations</span>
            <span aria-hidden="true" className="text-slate-300">
              /
            </span>
            <span className="font-semibold text-emerald-800">
              {c.breadcrumb_label}
            </span>
          </nav>
        </div>

        {/* HERO SECTION - Centered Enterprise Presentation (matching Google Sheets & Landing Page) */}
        <header className="mx-auto mb-20 max-w-4xl space-y-7 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/90 px-4 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs backdrop-blur-md">
            <Bot className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span>{page.badge_text}</span>
          </div>

          <h1 className="text-4xl leading-[1.12] font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            <GradientTitle title={page.title} />
          </h1>

          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            {page.subtitle}
          </p>

          {ctas.length > 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 pt-3 sm:flex-row">
              {ctas.map((cta, idx) => (
                <SmartLink
                  key={cta.url}
                  href={cta.url}
                  className={
                    idx === 0
                      ? 'inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-[#25D366] px-8 py-4 text-base font-bold text-white shadow-[0_0_20px_rgba(37,211,102,0.25)] transition-all duration-300 hover:scale-[1.02] hover:bg-[#20b958] hover:shadow-[0_0_30px_rgba(37,211,102,0.4)] active:scale-95 sm:w-auto'
                      : 'inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-emerald-900/15 bg-white/90 px-8 py-4 text-base font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-emerald-600/30 hover:bg-white active:scale-95 sm:w-auto'
                  }
                >
                  <span>{cta.text}</span>
                  {isExternal(cta.url) ? (
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-emerald-600" />
                  )}
                </SmartLink>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-6 pt-3 text-xs font-medium text-slate-500 sm:text-sm">
            {page.highlights.map((t, idx) => (
              <span key={idx} className="flex items-center gap-2">
                <CheckCircle2
                  className="h-4 w-4 text-[#25D366]"
                  aria-hidden="true"
                />
                <span>{t}</span>
              </span>
            ))}
          </div>
        </header>

        {/* VISUAL PREVIEW MOCKUP - AI Connector Chat Window Simulation (CMS: content.mockup_*) */}
        <div className="relative mb-28">
          <div className="pointer-events-none absolute inset-0 -top-8 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent opacity-60 blur-3xl" />

          <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-2xl backdrop-blur-md">
            {/* Window Chrome Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-3 font-mono text-xs font-medium text-slate-500">
                  {c.mockup_window_title}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#25D366]" />
                <span>{c.mockup_status_badge}</span>
              </div>
            </div>

            {/* Chat Simulation Conversation */}
            <div className="space-y-4 p-6 sm:p-8">
              {c.mockup_messages.map((m, idx) =>
                m.role === 'user' ? (
                  <div
                    key={idx}
                    className={`flex items-start justify-end gap-3 ${idx > 0 ? 'pt-2' : ''}`}
                  >
                    <div className="max-w-xl rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm">
                      <RichText text={m.body} />
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      {c.mockup_user_label}
                    </div>
                  </div>
                ) : m.role === 'tool' ? (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-100 text-emerald-800 shadow-xs">
                      <Bot className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="max-w-2xl rounded-2xl border border-emerald-500/30 bg-emerald-50/40 p-4 text-xs text-emerald-950 shadow-xs sm:text-sm">
                      <div className="flex items-center justify-between gap-3 font-mono text-xs font-bold text-emerald-800">
                        <span>{m.label}</span>
                        {m.badge ? (
                          <span className="rounded bg-emerald-200/70 px-2 py-0.5 text-emerald-900">
                            {m.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
                        <RichText text={m.body} />
                      </p>
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-100 text-emerald-800 shadow-xs">
                      <Bot className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="max-w-2xl space-y-2 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-5 text-sm text-slate-800 shadow-xs">
                      {m.label ? (
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{m.label}</span>
                        </div>
                      ) : null}
                      <p className="leading-relaxed">
                        <RichText text={m.body} />
                      </p>
                      {m.items.length > 0 ? (
                        <ul className="space-y-1.5 pl-2 text-xs sm:text-sm">
                          {m.items.map((item, i) => (
                            <li key={i}>
                              • <RichText text={item} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* EXAMPLES SECTION */}
        <section id="examples" className="mb-28">
          <CenteredSectionHeader
            badge={c.examples_eyebrow}
            badgeIcon={Sparkles}
            title={c.examples_heading}
            subtitle={c.examples_subtitle}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.examples.map((e, idx) => {
              const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];

              return (
                <div
                  key={idx}
                  className={`group relative flex items-start gap-4 overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/80 p-6 shadow-[0_4px_20px_-4px_rgba(18,140,126,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(18,140,126,0.12)] ${accent.hoverBorder}`}
                >
                  <div className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-gradient-to-br from-[#25D366]/15 to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 shadow-2xs transition-transform duration-300 group-hover:scale-105">
                    <MessageSquare className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase">
                      {c.example_card_label}
                    </span>
                    <p className="text-sm leading-relaxed font-semibold text-slate-800 group-hover:text-slate-950 sm:text-[15px]">
                      &ldquo;{e}&rdquo;
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* HOW TO CONNECT SECTION */}
        <section id="connect" className="mb-28">
          <CenteredSectionHeader
            badge={c.connect_eyebrow}
            badgeIcon={Zap}
            title={c.connect_heading}
            subtitle={c.connect_subtitle}
          />

          <div className="grid gap-8 md:grid-cols-2">
            {c.connect_cards.map((card, idx) => (
              <div
                key={idx}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/90 p-8 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-emerald-500/40 hover:shadow-md"
              >
                <div>
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-50 text-emerald-700 shadow-2xs">
                        <Bot className="h-6 w-6" />
                      </div>
                      <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                        {card.title}
                      </h3>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      {c.connect_card_badge}
                    </span>
                  </div>

                  <ol className="space-y-4">
                    {card.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-xs font-bold text-white shadow-xs">
                          {i + 1}
                        </span>
                        <span className="text-sm leading-relaxed font-medium text-slate-700 sm:text-base">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive 1-Click Copy MCP Server URL */}
          <CopyMcpUrl
            url={mcpUrl}
            label={c.server_url_label}
            note={c.server_url_note}
            buttonText={c.copy_button_text}
          />
        </section>

        {/* PERMISSIONS SECTION */}
        <section id="permissions" className="mb-28">
          <CenteredSectionHeader
            badge={c.permissions_eyebrow}
            badgeIcon={ShieldCheck}
            title={c.permissions_heading}
            subtitle={c.permissions_subtitle}
          />

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {page.levels.map((level, idx) => {
              const Icon = iconFor(level.icon);
              const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];

              return (
                <div
                  key={idx}
                  className={`group relative flex flex-col justify-start overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/80 p-8 shadow-[0_4px_20px_-4px_rgba(18,140,126,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_-15px_rgba(18,140,126,0.12)] ${accent.hoverBorder}`}
                >
                  <div
                    className={`pointer-events-none absolute -top-16 -right-16 h-36 w-36 rounded-full bg-gradient-to-br ${accent.hoverGlow} to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
                  />

                  <div
                    className={`relative mb-6 flex h-13 w-13 items-center justify-center rounded-2xl border ${accent.iconBox} shadow-2xs transition-transform duration-300 group-hover:scale-105`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>

                  <h3 className="mb-2.5 text-xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-slate-950">
                    {level.title}
                  </h3>

                  <p className="text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                    {level.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* SAFEGUARDS & DATA PRIVACY IN TWO BALANCED CARDS */}
        <div className="mb-28 grid gap-8 lg:grid-cols-2">
          {/* Safeguards Card */}
          <div className="group relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/90 p-8 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-emerald-500/40 hover:shadow-md sm:p-10">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-50 text-emerald-700 shadow-2xs">
                <Shield className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase">
                  {c.safeguards_eyebrow}
                </span>
                <h3 className="text-2xl font-black tracking-tight text-slate-900">
                  {c.safeguards_heading}
                </h3>
              </div>
            </div>

            <ul className="space-y-4">
              {c.safeguards.map((s, idx) => (
                <li key={idx} className="flex items-start gap-3.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-[#25D366]" />
                  </div>
                  <span className="text-sm leading-relaxed text-slate-700 sm:text-base">
                    {s}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Data Privacy Card */}
          <div className="group relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/90 p-8 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-emerald-500/40 hover:shadow-md sm:p-10">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-50 text-emerald-700 shadow-2xs">
                <Lock className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase">
                  {c.data_eyebrow}
                </span>
                <h3 className="text-2xl font-black tracking-tight text-slate-900">
                  {c.data_heading}
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              {c.data_cards.map((card, idx) => {
                const Icon = iconFor(card.icon);
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-emerald-700" />
                      <h4 className="text-sm font-bold text-slate-900">
                        {card.title}
                      </h4>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                      {card.body}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-xs text-slate-500 sm:text-sm">
              {c.legal_note_prefix}{' '}
              <Link
                href="/privacy"
                className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
              >
                {c.privacy_link_text}
              </Link>{' '}
              and{' '}
              <Link
                href="/terms"
                className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
              >
                {c.terms_link_text}
              </Link>
              .
            </p>
          </div>
        </div>

        {/* FAQ ACCORDION SECTION */}
        <section id="faq" className="mx-auto mb-28 max-w-4xl">
          <CenteredSectionHeader
            badge={c.faq_eyebrow}
            badgeIcon={HelpCircle}
            title={c.faq_heading}
            subtitle={c.faq_subtitle}
          />

          <FAQAccordion items={page.faqs} />
        </section>

        {/* HIGH CONVERSION CTA & SUPPORT BANNER (matching landing page CTABanner) */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-10 text-center text-white shadow-2xl sm:p-14">
          <div
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#25D366]/20 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-2xl space-y-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              {c.support_heading}
            </h2>
            <p className="text-base leading-relaxed text-slate-300 sm:text-lg">
              {c.support_body}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
              <SmartLink
                href={c.support_cta_url}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-8 py-4 text-base font-bold text-slate-950 shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-all duration-300 hover:scale-[1.02] hover:bg-[#20b958] active:scale-95 sm:w-auto"
              >
                <span>{c.support_cta_text}</span>
                <ExternalLink className="h-4 w-4" />
              </SmartLink>
              <SmartLink
                href={c.manage_cta_url}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-8 py-4 text-base font-semibold text-white shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-slate-800 active:scale-95 sm:w-auto"
              >
                <Unplug className="h-4 w-4" aria-hidden="true" />
                <span>{c.manage_cta_text}</span>
              </SmartLink>
            </div>
          </div>
        </div>

        {/* TRADEMARK NOTE */}
        <p className="mt-16 text-center text-xs text-slate-400">
          {c.trademark_note}
        </p>
      </div>
    </div>
  );
}
