"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Scale, Search, SearchX } from "lucide-react";

import { resolveDocsIcon } from "./docs-icons";
import type {
  DocsCategoryWithResources,
  DocsPageSettings,
  LegalPage,
} from "@/types/super-admin";

/**
 * Rotating accent palette for category icon chips, matching the pattern
 * FeaturesSection uses on the landing page so the two surfaces feel like
 * one product. Brand green leads; the rest keep a long page from turning
 * into a wall of one colour.
 */
const ACCENTS = [
  { bg: "bg-[#25D366]/10", text: "text-[#25D366]" },
  { bg: "bg-blue-500/10", text: "text-blue-600" },
  { bg: "bg-violet-500/10", text: "text-violet-600" },
  { bg: "bg-amber-500/10", text: "text-amber-600" },
  { bg: "bg-rose-500/10", text: "text-rose-600" },
  { bg: "bg-teal-500/10", text: "text-teal-600" },
] as const;

/** Anchor id for a category, so the jump nav can scroll to it. */
function anchorFor(title: string): string {
  return `cat-${title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")}`;
}

interface DocsExplorerProps {
  settings: DocsPageSettings | null;
  categories: DocsCategoryWithResources[];
  legalPages: Pick<LegalPage, "slug" | "title">[];
}

export function DocsExplorer({
  settings,
  categories,
  legalPages,
}: DocsExplorerProps) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const showLegal = settings?.show_legal_section !== false && legalPages.length > 0;

  /**
   * Filtered view. A category survives if its own title/description
   * matches (keeping all its links, since the group itself is the hit) or
   * if any of its resources match (keeping just those).
   */
  const visibleCategories = useMemo(() => {
    if (!term) return categories;

    return categories
      .map((category) => {
        const categoryMatches =
          category.title.toLowerCase().includes(term) ||
          (category.description ?? "").toLowerCase().includes(term);

        if (categoryMatches) return category;

        const resources = category.resources.filter(
          (resource) =>
            resource.title.toLowerCase().includes(term) ||
            (resource.description ?? "").toLowerCase().includes(term) ||
            (resource.badge_label ?? "").toLowerCase().includes(term),
        );

        return { ...category, resources };
      })
      .filter((category) => category.resources.length > 0);
  }, [categories, term]);

  const visibleLegal = useMemo(() => {
    if (!term) return legalPages;
    return legalPages.filter((page) => page.title.toLowerCase().includes(term));
  }, [legalPages, term]);

  const resultCount =
    visibleCategories.reduce((n, c) => n + c.resources.length, 0) +
    (showLegal ? visibleLegal.length : 0);

  const nothingFound = term.length > 0 && resultCount === 0;

  return (
    <>
      {/* ---- Search ---- */}
      {settings?.show_search !== false ? (
        <div className="px-6">
          <div className="mx-auto max-w-2xl">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  settings?.search_placeholder ??
                  "Search guides, features and policies…"
                }
                aria-label="Search the resource centre"
                className="w-full rounded-full border border-slate-200 bg-white py-4 pr-5 pl-12 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15 focus:outline-none"
              />
            </div>
            {/* Live count, so a search that narrows to one card doesn't
                look like the page has broken. */}
            <p
              aria-live="polite"
              className="mt-3 h-5 text-center text-sm text-slate-500"
            >
              {term
                ? `${resultCount} result${resultCount === 1 ? "" : "s"} for “${query.trim()}”`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      {/* ---- Jump nav ---- */}
      {!term && visibleCategories.length > 1 ? (
        <nav
          aria-label="Jump to a section"
          className="mt-8 px-6"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-2">
            {visibleCategories.map((category) => (
              <a
                key={category.id}
                href={`#${anchorFor(category.title)}`}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-[#25D366]/40 hover:text-[#25D366]"
              >
                {category.title}
              </a>
            ))}
            {showLegal ? (
              <a
                href="#legal"
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-[#25D366]/40 hover:text-[#25D366]"
              >
                {settings?.legal_heading ?? "Policies"}
              </a>
            ) : null}
          </div>
        </nav>
      ) : null}

      {/* ---- Empty search state ---- */}
      {nothingFound ? (
        <div className="px-6 py-24 text-center">
          <SearchX className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-xl font-bold text-slate-900">
            Nothing matched “{query.trim()}”
          </h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            Try a different word, or browse the sections below.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#20b958]"
          >
            Clear search
          </button>
        </div>
      ) : null}

      {/* ---- Categories ---- */}
      {visibleCategories.map((category, index) => {
        const accent = ACCENTS[index % ACCENTS.length];
        const CategoryIcon = resolveDocsIcon(category.icon_name);

        return (
          <section
            key={category.id}
            id={anchorFor(category.title)}
            className="px-6 pt-16 scroll-mt-28"
          >
            <div className="mx-auto max-w-7xl">
              <div className="mb-8 flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent.bg} ${accent.text}`}
                >
                  <CategoryIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                    {category.title}
                  </h2>
                  {category.description ? (
                    <p className="mt-1 text-slate-600">{category.description}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {category.resources.map((resource) => {
                  const ResourceIcon = resolveDocsIcon(
                    resource.icon_name ?? category.icon_name,
                  );

                  const cardBody = (
                    <>
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent.bg} ${accent.text} transition-transform group-hover:scale-110`}
                        >
                          <ResourceIcon className="h-5 w-5" />
                        </div>
                        {resource.badge_label ? (
                          <span className="rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-bold tracking-wider text-[#25D366] uppercase">
                            {resource.badge_label}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mb-2 text-lg font-bold text-slate-900">
                        {resource.title}
                      </h3>
                      {resource.description ? (
                        <p className="text-sm leading-relaxed text-slate-600">
                          {resource.description}
                        </p>
                      ) : null}

                      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#25D366]">
                        {resource.is_external ? "Open" : "Go"}
                        {resource.is_external ? (
                          <ExternalLink className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        )}
                      </span>
                    </>
                  );

                  const cardClass =
                    "group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#25D366]/30 hover:shadow-[0_10px_30px_-10px_rgba(37,211,102,0.15)]";

                  // An external link must be a plain anchor: next/link
                  // would try to client-navigate an off-site URL.
                  return resource.is_external ? (
                    <a
                      key={resource.id}
                      href={resource.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClass}
                    >
                      {cardBody}
                    </a>
                  ) : (
                    <Link
                      key={resource.id}
                      href={resource.href}
                      className={cardClass}
                    >
                      {cardBody}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      {/* ---- Legal ----
          Read live from `legal_pages`, never duplicated into the docs
          tables, so a policy is edited in exactly one place. */}
      {showLegal && visibleLegal.length > 0 ? (
        <section id="legal" className="px-6 pt-20 scroll-mt-28">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 text-slate-700">
                <Scale className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  {settings?.legal_heading ?? "Policies & agreements"}
                </h2>
                {settings?.legal_subheading ? (
                  <p className="mt-1 text-slate-600">
                    {settings.legal_subheading}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleLegal.map((page) => (
                <Link
                  key={page.slug}
                  href={`/legal/${page.slug}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-[#25D366]/30 hover:shadow-[0_10px_30px_-10px_rgba(37,211,102,0.12)]"
                >
                  <span className="font-semibold text-slate-800 group-hover:text-slate-900">
                    {page.title}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-[#25D366]" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---- Support ---- */}
      {settings?.show_support_section !== false ? (
        <section className="px-6 pt-20">
          <div className="mx-auto max-w-7xl">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 px-8 py-12 text-center">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#25D366]/20 blur-[90px]" />
              <div className="relative z-10">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  {settings?.support_heading ?? "Still need a hand?"}
                </h2>
                {settings?.support_body ? (
                  <p className="mx-auto mt-3 max-w-2xl text-slate-600">
                    {settings.support_body}
                  </p>
                ) : null}
                {settings?.support_cta_text && settings?.support_cta_link ? (
                  <Link
                    href={settings.support_cta_link}
                    className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(37,211,102,0.2)] transition-colors hover:bg-[#20b958]"
                  >
                    {settings.support_cta_text}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
