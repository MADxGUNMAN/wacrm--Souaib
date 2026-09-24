import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getIntegrationPage, getSiteSettings } from '@/lib/cms/queries';
import { TableOfContents } from '@/components/legal/TableOfContents';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractHeadings(
  markdown: string
): { level: number; text: string; id: string }[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].replace(/\*\*/g, '').trim();
    headings.push({ level, text, id: slugify(text) });
  }

  return headings;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getIntegrationPage('google-sheets');
  const settings = await getSiteSettings();
  const isNoIndex = settings?.no_index ?? false;

  const title =
    page?.seo_meta_title || `Privacy Policy — Replai for Google Sheets Add-on`;
  const description =
    page?.seo_meta_description ||
    'Privacy Policy and Google API Services User Data Disclosure for the Replai Google Sheets Add-on.';

  return {
    title: `${title} | ${settings?.site_name || 'Replai'}`,
    description,
    robots: {
      index: !isNoIndex,
      follow: !isNoIndex,
    },
  };
}

export default async function GoogleSheetsPrivacyPage() {
  const page = await getIntegrationPage('google-sheets');

  if (!page) {
    notFound();
  }

  const formattedDate = new Date(page.updated_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const markdownContent =
    page.privacy_markdown ||
    `# Privacy Policy — Replai for Google Sheets Add-on\n\nNo privacy policy content configured yet in the Super Admin CMS.`;

  const headings = extractHeadings(markdownContent);

  return (
    <div className="min-h-screen bg-slate-50/50 py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Navigation / Breadcrumbs */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
            <Link href="/" className="transition-colors hover:text-emerald-600">
              Home
            </Link>
            <span>/</span>
            <Link
              href="/integrations/google-sheets"
              className="transition-colors hover:text-emerald-600"
            >
              Google Sheets
            </Link>
            <span>/</span>
            <span className="font-medium text-slate-800">Privacy Policy</span>
          </div>

          <Link
            href="/integrations/google-sheets"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:text-emerald-700 sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Google Sheets Overview</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-10 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
          <div className="mb-3 flex items-center gap-3 text-emerald-600">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <span className="text-xs font-bold tracking-wider text-emerald-700 uppercase">
              Google Workspace Add-on Compliance
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Privacy Policy for Google Sheets Add-on
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Official data privacy disclosures, Google API user data compliance,
            and data retention policies for Replai for Google Sheets.
          </p>
          <div className="mt-4 flex items-center gap-4 text-xs font-medium text-slate-400">
            <span>Last revised: {formattedDate}</span>
            <span>•</span>
            <span className="text-emerald-600">
              Applies to: Replai Workspace Add-on
            </span>
          </div>
        </div>

        {/* Layout: TOC + Markdown Article */}
        <div className="flex flex-col items-start gap-10 lg:flex-row">
          {headings.length > 0 && (
            <div className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72">
              <TableOfContents headings={headings} />
            </div>
          )}

          <article className="legal-prose min-w-0 flex-1 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => {
                  const text =
                    typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h1
                      id={id}
                      className="mt-8 mb-6 scroll-mt-28 border-b border-slate-100 pb-4 text-2xl font-bold text-slate-900 first:mt-0 sm:text-3xl"
                    >
                      {children}
                    </h1>
                  );
                },
                h2: ({ children }) => {
                  const text =
                    typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h2
                      id={id}
                      className="mt-10 mb-4 scroll-mt-28 border-b border-slate-200 pb-2 text-xl font-bold text-slate-900 sm:text-2xl"
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children }) => {
                  const text =
                    typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h3
                      id={id}
                      className="mt-8 mb-3 scroll-mt-28 text-lg font-semibold text-slate-800 sm:text-xl"
                    >
                      {children}
                    </h3>
                  );
                },
                p: ({ children }) => (
                  <p className="mb-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-6 list-outside list-disc space-y-2 pl-6 text-sm text-slate-600 sm:text-base">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-6 list-outside list-decimal space-y-2 pl-6 text-sm text-slate-600 sm:text-base">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed text-slate-600">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-slate-900">
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em className="text-slate-700">{children}</em>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="font-medium text-emerald-600 transition-colors hover:underline"
                    target={href?.startsWith('/') ? undefined : '_blank'}
                    rel={href?.startsWith('/') ? undefined : 'noreferrer'}
                  >
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="my-6 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="px-4 py-3 font-semibold text-slate-800">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                    {children}
                  </td>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-6 rounded-r-xl border-l-4 border-emerald-500 bg-emerald-50/50 p-4 text-sm text-slate-700 italic sm:text-base">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                    {children}
                  </code>
                ),
                hr: () => <hr className="my-8 border-slate-200" />,
              }}
            >
              {markdownContent}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}
