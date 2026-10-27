import { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  PlusCircle,
  RefreshCw,
  Calendar,
  FileText,
  CheckCircle2,
  Check,
  Zap,
  Sparkles,
  MessageSquare,
  Clock,
  Layers,
  LucideIcon,
} from 'lucide-react';
import { getIntegrationPage, getSiteSettings } from '@/lib/cms/queries';
import {
  SHEETS_PAGE_SLUG,
  resolveSheetsPage,
} from '@/lib/cms/google-sheets-content';
import { RichText } from '@/components/cms/rich-text';
import { FAQAccordion } from './faq-accordion';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [row, settings] = await Promise.all([
    getIntegrationPage(SHEETS_PAGE_SLUG),
    getSiteSettings(),
  ]);
  const page = resolveSheetsPage(row);
  const isNoIndex = settings?.no_index ?? false;
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
    robots: {
      index: !isNoIndex,
      follow: !isNoIndex,
    },
  };
}

const FEATURE_ICONS: Record<string, LucideIcon> = {
  PlusCircle,
  RefreshCw,
  Calendar,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Sparkles,
  MessageSquare,
  Clock,
  Layers,
};

function renderFeatureIcon(iconName?: string) {
  const Icon = (iconName && FEATURE_ICONS[iconName]) || ShieldCheck;
  return <Icon className="h-6 w-6" strokeWidth={2} />;
}

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
    iconBox: 'bg-emerald-500/10 border-emerald-500/20 text-[#128C7E]',
    hoverGlow: 'from-[#25D366]/20',
    hoverBorder: 'group-hover:border-emerald-500/40',
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
];

export default async function GoogleSheetsIntegrationLandingPage() {
  // All copy comes from the CMS (integration_pages, slug 'google-sheets');
  // resolveSheetsPage fills any empty field from the code defaults.
  const page = resolveSheetsPage(await getIntegrationPage(SHEETS_PAGE_SLUG));
  const c = page.content;
  const {
    title,
    subtitle,
    prerequisites,
    features,
    faqs,
    how_it_works: howItWorks,
    badge_text: badgeText,
    primary_cta_text: primaryCtaText,
    primary_cta_url: primaryCtaUrl,
    secondary_cta_text: secondaryCtaText,
    secondary_cta_url: secondaryCtaUrl,
  } = page;

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

        {/* HERO SECTION - Centered Enterprise Presentation */}
        <div className="mx-auto mb-20 max-w-4xl space-y-7 text-center">
          {badgeText && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/90 px-4 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs backdrop-blur-md">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#25D366]" />
              <span>{badgeText}</span>
            </div>
          )}

          <h1 className="text-4xl leading-[1.12] font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            {title.includes('—') ? (
              <>
                {title.split('—')[0]}
                {' — '}
                <span className="bg-gradient-to-r from-[#25D366] via-emerald-600 to-[#128C7E] bg-clip-text text-transparent">
                  {title.split('—')[1]?.trim()}
                </span>
              </>
            ) : (
              title
            )}
          </h1>

          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            {subtitle}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 pt-3 sm:flex-row">
            <a
              href={primaryCtaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-[#25D366] px-8 py-4 text-base font-bold text-white shadow-[0_0_20px_rgba(37,211,102,0.25)] transition-all duration-300 hover:scale-[1.02] hover:bg-[#20b958] hover:shadow-[0_0_30px_rgba(37,211,102,0.4)] active:scale-95 sm:w-auto"
            >
              <span>{primaryCtaText}</span>
              <ExternalLink className="h-4 w-4" />
            </a>

            <Link
              href={secondaryCtaUrl}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-emerald-900/15 bg-white/90 px-8 py-4 text-base font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-emerald-600/30 hover:bg-white active:scale-95 sm:w-auto"
            >
              <span>{secondaryCtaText}</span>
              <ArrowRight className="h-4 w-4 text-emerald-600" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 pt-3 text-xs font-medium text-slate-500 sm:text-sm">
            {c.hero_checks.map((check, idx) => (
              <span key={idx} className="flex items-center gap-2">
                <CheckCircle2
                  className="h-4 w-4 text-[#25D366]"
                  aria-hidden="true"
                />
                <span>{check}</span>
              </span>
            ))}
          </div>
        </div>

        {/* PREREQUISITES & DISCLOSURE CARD */}
        <div className="group relative mb-24 overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/90 p-8 shadow-[0_4px_20px_-4px_rgba(18,140,126,0.06)] backdrop-blur-md transition-all duration-300 hover:border-emerald-500/30 sm:p-10">
          <div className="pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full bg-emerald-500/10 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>{c.requirements_eyebrow}</span>
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {c.requirements_heading}
              </h3>
              <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                {c.requirements_body}
              </p>
            </div>
            <ul className="shrink-0 space-y-3 text-sm font-medium text-slate-700">
              {prerequisites.map((req, idx) => (
                <li key={idx} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-50 text-emerald-700">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* VISUAL PREVIEW MOCKUP - High Fidelity macOS Window & Phone Card (CMS: content.mockup_*, bubble_*) */}
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

            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3 lg:p-8">
              {/* Spreadsheet Table Mock */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200/90 lg:col-span-2">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      {c.mockup_columns.map((col, i) => (
                        <th
                          key={i}
                          className={
                            i === c.mockup_columns.length - 1
                              ? 'bg-emerald-50/90 p-3.5 font-bold text-emerald-800'
                              : 'p-3.5 font-bold'
                          }
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {c.mockup_rows.map((row, i) => (
                      <tr
                        key={i}
                        className={`transition-colors hover:bg-slate-50/50 ${i % 2 === 1 ? 'bg-slate-50/20' : ''}`}
                      >
                        <td className="p-3.5 font-sans font-semibold text-slate-900">
                          {row.customer}
                        </td>
                        <td className="p-3.5 text-slate-600">{row.phone}</td>
                        <td className="p-3.5 font-bold text-slate-700">
                          {row.order_id}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              row.tone === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td
                          className={`bg-emerald-50/40 p-3.5 ${
                            row.tone === 'pending'
                              ? 'text-slate-400'
                              : 'font-semibold text-emerald-700'
                          }`}
                        >
                          {row.delivery}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sidebar Rule & Live WhatsApp Bubble Preview */}
              <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-emerald-900/10 bg-gradient-to-b from-slate-50/80 to-emerald-50/20 p-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Zap className="h-4 w-4 fill-emerald-600 text-emerald-600" />
                      <span>{c.mockup_rule_title}</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-800 uppercase">
                      {c.mockup_rule_badge}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
                    <div className="text-xs font-bold text-slate-900">
                      {c.mockup_template_name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {c.mockup_template_meta}
                    </div>
                    <div className="mt-2 font-mono text-[10px] text-emerald-700">
                      {c.mockup_trigger}
                    </div>
                  </div>

                  {/* Simulated WhatsApp Bubble */}
                  <div className="rounded-xl border border-emerald-200/80 bg-[#e7ffdb] p-3 text-xs text-slate-800 shadow-xs">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[#128C7E]">
                      <span>{c.bubble_sender}</span>
                      <span>{c.bubble_time}</span>
                    </div>
                    <p className="leading-snug">
                      <RichText text={c.bubble_text} />
                    </p>
                    <div className="mt-1 text-right text-[10px] font-bold text-emerald-700">
                      {c.bubble_status}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/60 pt-3 text-[10px] font-medium text-slate-400">
                  <span>{c.mockup_footer_left}</span>
                  <span>{c.mockup_footer_right}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES GRID - Landing Page Styled Enterprise Cards */}
        <div className="mb-28">
          <div className="mx-auto mb-16 max-w-3xl space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-1 text-xs font-bold tracking-wider text-emerald-800 uppercase">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              <span>{c.features_eyebrow}</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              {c.features_heading}
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {c.features_subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {features.map((feat, idx) => {
              const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];

              return (
                <div
                  key={idx}
                  className={`group relative flex flex-col justify-start overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/80 p-8 shadow-[0_4px_20px_-4px_rgba(18,140,126,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_-15px_rgba(18,140,126,0.12)] ${accent.hoverBorder}`}
                >
                  {/* Hover Ambient Glow */}
                  <div
                    className={`pointer-events-none absolute -top-16 -right-16 h-36 w-36 rounded-full bg-gradient-to-br ${accent.hoverGlow} to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
                  />

                  {/* Icon Container */}
                  <div
                    className={`relative mb-6 flex h-13 w-13 items-center justify-center rounded-2xl border ${accent.iconBox} shadow-2xs transition-transform duration-300 group-hover:scale-105`}
                  >
                    {renderFeatureIcon(feat.icon)}
                  </div>

                  {/* Feature Title */}
                  <h3 className="mb-2.5 text-xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-slate-950">
                    {feat.title}
                  </h3>

                  {/* Feature Description */}
                  <p className="text-sm leading-relaxed font-normal text-slate-600 sm:text-[15px]">
                    {feat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* HOW IT WORKS - 3 Connected Steps */}
        <div className="relative mb-28 overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-b from-white via-emerald-50/20 to-white p-8 shadow-sm sm:p-14">
          <div className="mx-auto mb-16 max-w-2xl space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-1 text-xs font-bold tracking-wider text-emerald-800 uppercase">
              <Zap className="h-3.5 w-3.5 text-emerald-600" />
              <span>{c.steps_eyebrow}</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              {c.steps_heading}
            </h2>
            <p className="text-base text-slate-600 sm:text-lg">
              {c.steps_subtitle}
            </p>
          </div>

          <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3">
            {howItWorks.map((step, idx) => (
              <div
                key={idx}
                className="group relative flex flex-col justify-start rounded-3xl border border-emerald-900/10 bg-white/90 p-8 shadow-xs backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-md"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366] text-lg font-black text-white shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-transform duration-300 group-hover:scale-105">
                  {step.step_number || idx + 1}
                </div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-slate-900">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ ACCORDION SECTION */}
        <div className="mx-auto mb-28 max-w-4xl">
          <div className="mb-14 space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50/70 px-3.5 py-1 text-xs font-bold tracking-wider text-emerald-800 uppercase">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span>{c.faq_eyebrow}</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              {c.faq_heading}
            </h2>
            <p className="text-base text-slate-600">{c.faq_subtitle}</p>
          </div>

          <FAQAccordion items={faqs} />
        </div>

        {/* HIGH CONVERSION CTA BANNER (matching landing page CTABanner) */}
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
              {c.cta_heading}
            </h2>
            <p className="text-base leading-relaxed text-slate-300 sm:text-lg">
              {c.cta_body}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
              <a
                href={primaryCtaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-8 py-4 text-base font-bold text-slate-950 shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-all duration-300 hover:scale-[1.02] hover:bg-[#20b958] active:scale-95 sm:w-auto"
              >
                <span>{c.cta_primary_text}</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link
                href={c.cta_secondary_url}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-8 py-4 text-base font-semibold text-white shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:bg-slate-800 active:scale-95 sm:w-auto"
              >
                <span>{c.cta_secondary_text}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* LEGAL LINKS & TRADEMARK */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 pt-8 text-xs text-slate-500 sm:flex-row">
          <div>{c.trademark_note}</div>
          <div className="flex items-center gap-4">
            <Link
              href="/integrations/google-sheets/privacy"
              className="underline underline-offset-2 transition-colors hover:text-emerald-700"
            >
              {c.privacy_link_text}
            </Link>
            <span>•</span>
            <Link
              href="/integrations/google-sheets/terms"
              className="underline underline-offset-2 transition-colors hover:text-emerald-700"
            >
              {c.terms_link_text}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
