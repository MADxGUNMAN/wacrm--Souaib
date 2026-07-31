import { notFound } from "next/navigation";
import { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getLegalPage, getSiteSettings } from "@/lib/cms/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface LegalPageProps {
  params: Promise<{ slug: string }>;
}

/** Generate a URL-safe slug from heading text */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/** Extract h2 and h3 headings from markdown for the TOC */
function extractHeadings(markdown: string): { level: number; text: string; id: string }[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].replace(/\*\*/g, "").trim();
    headings.push({ level, text, id: slugify(text) });
  }

  return headings;
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLegalPage(slug);
  const settings = await getSiteSettings();

  if (!page) return { title: "Not Found" };

  return {
    title: `${page.title} | ${settings?.site_name || "Replai"}`,
    description: `${page.title} for ${settings?.site_name || "Replai"} - AI-Powered WhatsApp CRM.`,
  };
}

export default async function LegalPageRoute({ params }: LegalPageProps) {
  const { slug } = await params;
  const page = await getLegalPage(slug);

  if (!page) {
    notFound();
  }

  const formattedDate = new Date(page.last_updated_at).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const headings = extractHeadings(page.content_markdown);

  return (
    <div className="max-w-7xl mx-auto px-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-8">
        <Link href="/" className="hover:text-[#25D366] transition-colors">
          Home
        </Link>
        <span>/</span>
        <span className="text-slate-600">{page.title}</span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-3">
          {page.title}
        </h1>
        <p className="text-sm text-slate-400">
          Last updated: {formattedDate}
        </p>
      </div>

      {/* Two-column layout: TOC left, Content right */}
      <div className="flex gap-10">
        {/* Left — Sticky TOC */}
        {headings.length > 0 && (
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="sticky top-28 rounded-xl border border-slate-200 bg-slate-50/80 p-5 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-[#25D366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
                </svg>
                On this page
              </h2>
              <ol className="space-y-0.5 list-none">
                {headings.map((heading, index) => (
                  <li key={index}>
                    <a
                      href={`#${heading.id}`}
                      className={`
                        block transition-colors duration-150 hover:text-[#25D366]
                        ${heading.level === 2
                          ? "text-[13px] text-slate-700 font-medium py-1.5 border-l-2 border-transparent hover:border-[#25D366] pl-3"
                          : "text-[12px] text-slate-400 pl-6 py-1 border-l-2 border-transparent hover:border-[#25D366]/50"
                        }
                      `}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        )}

        {/* Right — Content */}
        <article className="legal-prose flex-1 min-w-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => {
                const text = typeof children === "string" ? children : String(children);
                const id = slugify(text);
                return (
                  <h1 id={id} className="text-3xl font-bold mt-12 mb-6 text-slate-900 first:mt-0 scroll-mt-28">
                    {children}
                  </h1>
                );
              },
              h2: ({ children }) => {
                const text = typeof children === "string" ? children : String(children);
                const id = slugify(text);
                return (
                  <h2 id={id} className="text-2xl font-bold mt-10 mb-4 text-slate-900 border-b border-slate-200 pb-3 scroll-mt-28">
                    {children}
                  </h2>
                );
              },
              h3: ({ children }) => {
                const text = typeof children === "string" ? children : String(children);
                const id = slugify(text);
                return (
                  <h3 id={id} className="text-xl font-semibold mt-8 mb-3 text-slate-800 scroll-mt-28">
                    {children}
                  </h3>
                );
              },
              h4: ({ children }) => (
                <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-800">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="text-slate-600 leading-relaxed mb-4">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside space-y-2 text-slate-600 mb-6 pl-6">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside space-y-2 text-slate-600 mb-6 pl-6">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-slate-600 leading-relaxed">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="text-slate-900 font-semibold">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="text-slate-700">{children}</em>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-[#25D366] hover:underline transition-colors font-medium"
                  target={href?.startsWith("/") ? undefined : "_blank"}
                  rel={href?.startsWith("/") ? undefined : "noreferrer"}
                >
                  {children}
                </a>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto mb-6 rounded-xl border border-slate-200">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-slate-50 text-slate-700">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-3 text-left font-semibold border-b border-slate-200">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-3 text-slate-600 border-b border-slate-100">
                  {children}
                </td>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-[#25D366]/40 pl-4 my-6 text-slate-500 italic bg-slate-50 py-3 rounded-r-lg">
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm text-slate-800 font-mono">
                  {children}
                </code>
              ),
              hr: () => <hr className="border-slate-200 my-8" />,
            }}
          >
            {page.content_markdown}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
