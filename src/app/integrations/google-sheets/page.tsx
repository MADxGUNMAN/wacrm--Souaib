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
} from 'lucide-react';
import { getIntegrationPage, getSiteSettings } from '@/lib/cms/queries';
import { FAQAccordion } from './faq-accordion';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getIntegrationPage('google-sheets');
  const settings = await getSiteSettings();
  const isNoIndex = settings?.no_index ?? false;

  const title =
    page?.seo_meta_title ||
    'Replai for Google Sheets — Automated WhatsApp Messaging';
  const description =
    page?.seo_meta_description ||
    'Send WhatsApp messages, notifications, and reminders directly from Google Sheets with Replai. Trigger sends on new rows, cell changes, or schedules.';

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

// Icon mapping helper
function renderFeatureIcon(iconName?: string) {
  switch (iconName) {
    case 'PlusCircle':
      return <PlusCircle className="h-6 w-6 text-emerald-500" />;
    case 'RefreshCw':
      return <RefreshCw className="h-6 w-6 text-emerald-500" />;
    case 'Calendar':
      return <Calendar className="h-6 w-6 text-emerald-500" />;
    case 'FileText':
      return <FileText className="h-6 w-6 text-emerald-500" />;
    case 'CheckCircle2':
      return <CheckCircle2 className="h-6 w-6 text-emerald-500" />;
    case 'ShieldCheck':
    default:
      return <ShieldCheck className="h-6 w-6 text-emerald-500" />;
  }
}

export default async function GoogleSheetsIntegrationLandingPage() {
  const page = await getIntegrationPage('google-sheets');

  // Fallback defaults if table was empty
  const title =
    page?.title || 'Replai for Google Sheets — Automated WhatsApp Messaging';
  const subtitle =
    page?.subtitle ||
    'Send WhatsApp messages, order confirmations, status alerts, and scheduled reminders directly from your Google Sheets spreadsheets.';
  const badgeText = page?.badge_text || 'Google Workspace Marketplace Add-on';
  const primaryCtaText = page?.primary_cta_text || 'Install from Marketplace';
  const primaryCtaUrl =
    page?.primary_cta_url || 'https://workspace.google.com/marketplace';
  const secondaryCtaText = page?.secondary_cta_text || 'Get Started Free';
  const secondaryCtaUrl = page?.secondary_cta_url || '/register';

  const prerequisites = page?.prerequisites?.length
    ? page.prerequisites
    : [
        'Active Replai CRM account with WhatsApp Business API connected',
        'Pre-approved Meta WhatsApp message templates',
        'Google Sheets document with contact numbers',
      ];

  const features = page?.features?.length
    ? page.features
    : [
        {
          title: 'Send on New Rows & Form Submissions',
          description:
            'Automatically send customized WhatsApp messages whenever a new row is appended or submitted through Google Forms.',
          icon: 'PlusCircle',
        },
        {
          title: 'Trigger on Cell Changes',
          description:
            'Watch specific columns like Status and automatically dispatch messages when a cell changes to Pass, Shipped, or Approved.',
          icon: 'RefreshCw',
        },
        {
          title: 'Time-Based & Recurring Reminders',
          description:
            'Automate birthday greetings, monthly rent/EMI dues, and appointment reminders with 9 smart date-aware comparison operators.',
          icon: 'Calendar',
        },
        {
          title: 'Dynamic Variable & Media Mapping',
          description:
            'Map spreadsheet columns directly to {{1}}, {{2}} template placeholders and attach dynamic invoice PDFs or image URLs.',
          icon: 'FileText',
        },
        {
          title: 'Live Status Feedback in Your Sheet',
          description:
            'The add-on creates a Replai Status column and logs real-time delivery timestamps directly on the row.',
          icon: 'CheckCircle2',
        },
        {
          title: 'Strict Duplicate Protection',
          description:
            'Cryptographically hashed idempotency keys guarantee that rows matching a rule send exactly once and never double-charge.',
          icon: 'ShieldCheck',
        },
      ];

  const howItWorks = page?.how_it_works?.length
    ? page.how_it_works
    : [
        {
          step_number: 1,
          title: 'Install & Connect',
          description:
            'Install the add-on from Google Workspace Marketplace and link your Replai account using your secure API key.',
        },
        {
          step_number: 2,
          title: 'Build Automation Rule',
          description:
            'Select your target sheet, choose your trigger condition (New Row, On Change, or Reminder), and map your columns.',
        },
        {
          step_number: 3,
          title: 'Automatic & Instant Delivery',
          description:
            'Edit or append rows in Google Sheets. Replai evaluates your rules in real time and delivers the WhatsApp template message instantly.',
        },
      ];

  const faqs = page?.faqs?.length
    ? page.faqs
    : [
        {
          question: 'Does this add-on require a Replai account?',
          answer:
            'Yes. The add-on connects to your Replai account via an API key to securely send messages through the official Meta WhatsApp Business Cloud API.',
        },
        {
          question: 'What WhatsApp message templates can I send?',
          answer:
            'You can send any Meta-approved WhatsApp template created in your Replai dashboard or Meta Business Manager, complete with dynamic variables and media.',
        },
        {
          question: 'What data does the add-on access in my Google Sheets?',
          answer:
            'The add-on accesses only the current spreadsheet you open (spreadsheets.currentonly). We never access other files in your Google Drive.',
        },
      ];

  return (
    <div className="relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-[130px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-6 py-12 lg:py-20">
        {/* Breadcrumbs */}
        <div className="mb-8 flex items-center gap-2 text-xs font-medium text-slate-400">
          <Link href="/" className="transition-colors hover:text-emerald-600">
            Home
          </Link>
          <span>/</span>
          <span>Integrations</span>
          <span>/</span>
          <span className="text-slate-700">Google Sheets</span>
        </div>

        {/* HERO SECTION */}
        <div className="mx-auto mb-16 max-w-3xl space-y-6 text-center">
          {badgeText && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50/80 px-4 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur-sm">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span>{badgeText}</span>
            </div>
          )}

          <h1 className="text-4xl leading-[1.15] font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            {subtitle}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <a
              href={primaryCtaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-150 hover:bg-emerald-700 hover:shadow-emerald-600/35 active:scale-[0.99] sm:w-auto"
            >
              <span>{primaryCtaText}</span>
              <ExternalLink className="h-4 w-4" />
            </a>

            <Link
              href={secondaryCtaUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] sm:w-auto"
            >
              <span>{secondaryCtaText}</span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" /> Official Meta Cloud
              API
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" /> No Code Required
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" /> End-to-End
              Encrypted
            </span>
          </div>
        </div>

        {/* PREREQUISITES & DISCLOSURE (Google Marketplace Review Compliance) */}
        <div className="mb-20 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Integration Requirements</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                What you need to get started
              </h3>
              <p className="max-w-xl text-sm text-slate-600">
                This Google Sheets editor add-on transmits row data over secure
                HTTPS strictly to deliver WhatsApp messages through your
                authorized account.
              </p>
            </div>
            <ul className="shrink-0 space-y-2 text-sm text-slate-700">
              {prerequisites.map((req, idx) => (
                <li key={idx} className="flex items-center gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="h-3 w-3" />
                  </div>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* VISUAL PREVIEW MOCKUP */}
        <div className="mb-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-amber-400" />
              <div className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-2 font-mono text-xs text-slate-400">
                Google Sheets · Orders &amp; Delivery Automation
              </span>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              ● Add-on Active
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Spreadsheet Table Mock */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 lg:col-span-2">
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Whatsapp</th>
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Status</th>
                    <th className="bg-emerald-50/80 p-3 text-emerald-700">
                      Replai Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-white">
                    <td className="p-3 font-sans font-medium text-slate-900">
                      Souaib Ansari
                    </td>
                    <td className="p-3">+91 98765 43210</td>
                    <td className="p-3">ORD-8921</td>
                    <td className="p-3">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                        Pass
                      </span>
                    </td>
                    <td className="bg-emerald-50/40 p-3 font-semibold text-emerald-600">
                      ✓ Sending · 16 Sep 18:30
                    </td>
                  </tr>
                  <tr className="bg-slate-50/30">
                    <td className="p-3 font-sans font-medium text-slate-900">
                      Rahul Sharma
                    </td>
                    <td className="p-3">+91 98111 22233</td>
                    <td className="p-3">ORD-8922</td>
                    <td className="p-3">
                      <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                        Pending
                      </span>
                    </td>
                    <td className="bg-emerald-50/40 p-3 text-slate-400">—</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="p-3 font-sans font-medium text-slate-900">
                      Priya Patel
                    </td>
                    <td className="p-3">+91 98222 33344</td>
                    <td className="p-3">ORD-8923</td>
                    <td className="p-3">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                        Pass
                      </span>
                    </td>
                    <td className="bg-emerald-50/40 p-3 font-semibold text-emerald-600">
                      ✓ Sending · 16 Sep 18:32
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Sidebar Mock */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <Zap className="h-4 w-4 fill-emerald-600 text-emerald-600" />
                    <span>Replai Automation</span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                    ACTIVE
                  </span>
                </div>
                <div className="mb-3 space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                  <div className="text-xs font-bold text-slate-900">
                    Order Delivery Rule
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Sheet1 • delivery_confirmation
                  </div>
                  <div className="pt-1 font-mono text-[10px] text-emerald-600">
                    Trigger: On Change (Status == &quot;Pass&quot;)
                  </div>
                </div>
                <div className="text-[11px] leading-relaxed text-slate-500">
                  Watching for changes in real time. Sent messages are
                  automatically stamped in the Replai Status column.
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/80 pt-3 text-[10px] text-slate-400">
                <span>Runs as souaib@junkiescoder.com</span>
                <span>v0.5.0</span>
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES GRID */}
        <div className="mb-24">
          <div className="mx-auto mb-14 max-w-2xl space-y-3 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Powerful WhatsApp Triggers for Spreadsheets
            </h2>
            <p className="text-base text-slate-600">
              Everything you need to automate alerts, customer follow-ups, and
              notifications without writing code.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100/80">
                  {renderFeatureIcon(feat.icon)}
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-900">
                  {feat.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {feat.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div className="mb-24 rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-8 shadow-sm sm:p-12">
          <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Get Started in 3 Simple Steps
            </h2>
            <p className="text-base text-slate-600">
              Set up your first automated workflow in less than two minutes.
            </p>
          </div>

          <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3">
            {howItWorks.map((step, idx) => (
              <div key={idx} className="relative space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-base font-bold text-white shadow-md shadow-emerald-600/20">
                  {step.step_number || idx + 1}
                </div>
                <h3 className="text-lg font-bold text-slate-900">
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
        <div className="mx-auto mb-24 max-w-3xl">
          <div className="mb-10 space-y-2 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-600">
              Common questions about security, templates, and permissions.
            </p>
          </div>

          <FAQAccordion items={faqs} />
        </div>

        {/* CTA BANNER */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-8 text-center text-white shadow-xl sm:p-12">
          <div
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-2xl space-y-5">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to automate WhatsApp from your spreadsheets?
            </h2>
            <p className="text-base text-slate-300">
              Install the Replai add-on from the Google Workspace Marketplace
              and start sending messages in seconds.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
              <a
                href={primaryCtaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-slate-950 shadow-md transition-colors hover:bg-emerald-400 sm:w-auto"
              >
                <span>{primaryCtaText}</span>
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-slate-800 sm:w-auto"
              >
                <span>Contact Support</span>
              </Link>
            </div>
          </div>
        </div>

        {/* LEGAL LINKS FOR REVIEW */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 text-xs text-slate-500 sm:flex-row">
          <div>
            WhatsApp™ is a trademark of Meta Platforms, Inc. Google Sheets™ is a
            trademark of Google LLC.
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/integrations/google-sheets/privacy"
              className="underline underline-offset-2 transition-colors hover:text-emerald-600"
            >
              Add-on Privacy Policy
            </Link>
            <span>•</span>
            <Link
              href="/integrations/google-sheets/terms"
              className="underline underline-offset-2 transition-colors hover:text-emerald-600"
            >
              Add-on Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
