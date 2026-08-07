import type { Metadata } from "next";
import Link from "next/link";

import { DocsExplorer } from "@/components/docs/DocsExplorer";
import {
  getDocsCategories,
  getDocsPageSettings,
  getLegalPagesList,
  getSiteSettings,
} from "@/lib/cms/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, docs] = await Promise.all([
    getSiteSettings(),
    getDocsPageSettings(),
  ]);

  const siteName = settings?.site_name || "Replai";
  const heading = docs?.heading || "Resource centre";

  return {
    title: `${heading} | ${siteName}`,
    description:
      docs?.subheading ||
      `Guides, feature walkthroughs and policies for ${siteName}.`,
  };
}

/**
 * /docs — the resource centre.
 *
 * The footer has linked here since the landing page shipped; this is the
 * page that link was always meant to reach.
 *
 * Split server/client on purpose: the heading and intro render on the
 * server so the page is indexable and has no content flash, while the
 * search box and filtering live in {@link DocsExplorer} because they need
 * state. Everything is CMS-driven, so an operator can reword the whole
 * page without a deploy.
 */
export default async function DocsPage() {
  const [settings, categories, legalPages] = await Promise.all([
    getDocsPageSettings(),
    getDocsCategories(),
    getLegalPagesList(),
  ]);

  const heading = settings?.heading || "Everything you need to run Replai";

  return (
    <div>
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden px-6 pt-8 pb-4">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[#25D366]/20 blur-[110px]" />

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-400"
          >
            <Link href="/" className="transition-colors hover:text-[#25D366]">
              Home
            </Link>
            <span>/</span>
            <span className="text-slate-600">Docs</span>
          </nav>

          {settings?.eyebrow ? (
            <span className="mb-5 inline-block rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold tracking-wider text-white uppercase">
              {settings.eyebrow}
            </span>
          ) : null}

          <h1 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
            {heading}
          </h1>

          {settings?.subheading ? (
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              {settings.subheading}
            </p>
          ) : null}
        </div>
      </section>

      {/* Search, jump nav, categories, policies and support. */}
      <div className="mt-4">
        <DocsExplorer
          settings={settings}
          categories={categories}
          legalPages={legalPages}
        />
      </div>
    </div>
  );
}
