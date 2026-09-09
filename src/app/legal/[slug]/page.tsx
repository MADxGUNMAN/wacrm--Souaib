import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getLegalPage, getSiteSettings } from '@/lib/cms/queries';
import Link from 'next/link';
import { TableOfContents } from '@/components/legal/TableOfContents';

export const dynamic = 'force-dynamic';

interface LegalPageProps {
  params: Promise<{ slug: string }>;
}

/** Generate a URL-safe slug from heading text */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Extract h2 and h3 headings from markdown for the TOC */
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

export async function generateMetadata({
  params,
}: LegalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLegalPage(slug);
  const settings = await getSiteSettings();

  if (!page) return { title: 'Not Found' };

  const isNoIndex = settings?.no_index ?? false;

  return {
    title: `${page.title} | ${settings?.site_name || 'Replai'}`,
    description: `${page.title} for ${settings?.site_name || 'Replai'} - AI-Powered WhatsApp CRM.`,
    robots: {
      index: !isNoIndex,
      follow: !isNoIndex,
    },
  };
}

export default async function LegalPageRoute({ params }: LegalPageProps) {
  const { slug } = await params;
  const page = await getLegalPage(slug);

  if (!page) {
    notFound();
  }

  const formattedDate = new Date(page.last_updated_at).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const headings = extractHeadings(page.content_markdown);

  return (
    <div className="mx-auto max-w-7xl px-6">
      {/* Breadcrumbs */}
      <div className="mb-8 flex items-center gap-2 text-sm text-slate-400">
        <Link href="/" className="transition-colors hover:text-[#25D366]">
          Home
        </Link>
        <span>/</span>
        <span className="text-slate-600">{page.title}</span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <h1 className="mb-3 text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
          {page.title}
        </h1>
        <p className="text-sm text-slate-400">Last updated: {formattedDate}</p>
      </div>

      {/* Two-column layout: TOC left, Content right */}
      <div className="flex items-start gap-10">
        {/* Left — Sticky TOC via Client Component */}
        <TableOfContents headings={headings} />

        {/* Right — Content */}
        <article className="legal-prose min-w-0 flex-1">
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
                    className="mt-12 mb-6 scroll-mt-28 text-3xl font-bold text-slate-900 first:mt-0"
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
                    className="mt-10 mb-4 scroll-mt-28 border-b border-slate-200 pb-3 text-2xl font-bold text-slate-900"
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
                    className="mt-8 mb-3 scroll-mt-28 text-xl font-semibold text-slate-800"
                  >
                    {children}
                  </h3>
                );
              },
              h4: ({ children }) => (
                <h4 className="mt-6 mb-2 text-lg font-semibold text-slate-800">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="mb-4 leading-relaxed text-slate-600">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-6 list-outside list-disc space-y-2 pl-6 text-slate-600">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-6 list-outside list-decimal space-y-2 pl-6 text-slate-600">
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
                  className="font-medium text-[#25D366] transition-colors hover:underline"
                  target={href?.startsWith('/') ? undefined : '_blank'}
                  rel={href?.startsWith('/') ? undefined : 'noreferrer'}
                >
                  {children}
                </a>
              ),
              table: ({ children }) => (
                <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-slate-50 text-slate-700">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                  {children}
                </td>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-6 rounded-r-lg border-l-4 border-[#25D366]/40 bg-slate-50 py-3 pl-4 text-slate-500 italic">
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-slate-800">
                  {children}
                </code>
              ),
              hr: () => <hr className="my-8 border-slate-200" />,
            }}
          >
            {page.content_markdown}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
