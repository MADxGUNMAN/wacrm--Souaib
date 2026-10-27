'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  ArrowUpRight,
  Globe,
  Puzzle,
  Code2,
  ShieldCheck,
  FileText,
  Calendar,
  ExternalLink,
  Sparkles,
  Layers,
  Terminal,
  Bot,
  Scale,
  Compass,
} from 'lucide-react';
import type {
  PublicSitemap,
  PublicSitemapGroup,
  PublicSitemapRoute,
  SitemapCategory,
} from '@/lib/cms/sitemap';

interface SitemapExplorerProps {
  sitemap: PublicSitemap;
}

const CATEGORY_META: Record<
  SitemapCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }
> = {
  main: {
    label: 'Main & Platform',
    icon: Globe,
    description:
      'Core product pages, feature overviews, support, and resource portals.',
  },
  integrations: {
    label: 'Integrations & Connectors',
    icon: Puzzle,
    description:
      'Native add-ons, AI connectors for Claude & ChatGPT, and marketplace extensions.',
  },
  developers: {
    label: 'Developers & APIs',
    icon: Code2,
    description:
      'REST API endpoints, Model Context Protocol (MCP) server, and integration docs.',
  },
  legal: {
    label: 'Legal & Compliance',
    icon: ShieldCheck,
    description:
      'Privacy policies, service terms, data processing, and platform compliance notices.',
  },
};

function getRouteIcon(
  route: PublicSitemapRoute
): React.ComponentType<{ className?: string }> {
  const p = route.path.toLowerCase();
  if (p === '/') return Globe;
  if (p.includes('/ai')) return Bot;
  if (p.includes('/google-sheets')) return Layers;
  if (p.includes('/api-reference')) return Terminal;
  if (p.includes('/docs')) return FileText;
  if (p.includes('/contact')) return Compass;
  if (p.includes('/privacy')) return ShieldCheck;
  if (p.includes('/terms') || p.includes('/policy') || p.includes('/agreement'))
    return Scale;
  return FileText;
}

function formatDate(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function SitemapExplorer({ sitemap }: SitemapExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SitemapCategory | 'all'>(
    'all'
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sitemap.groups
      .map((group) => {
        if (activeCategory !== 'all' && group.category !== activeCategory) {
          return null;
        }

        const matchingRoutes = group.routes.filter((route) => {
          if (!query) return true;
          return (
            route.title.toLowerCase().includes(query) ||
            route.path.toLowerCase().includes(query) ||
            (route.description &&
              route.description.toLowerCase().includes(query))
          );
        });

        if (matchingRoutes.length === 0) return null;

        return {
          ...group,
          routes: matchingRoutes,
        };
      })
      .filter((g): g is PublicSitemapGroup => g !== null);
  }, [sitemap.groups, searchQuery, activeCategory]);

  const totalFilteredCount = useMemo(() => {
    return filteredGroups.reduce((acc, g) => acc + g.routes.length, 0);
  }, [filteredGroups]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sitemap.routes.length };
    for (const group of sitemap.groups) {
      counts[group.category] = group.routes.length;
    }
    return counts;
  }, [sitemap.groups, sitemap.routes.length]);

  return (
    <div className="space-y-12">
      {/* Controls: Search Bar & Category Filter Pills */}
      <div className="rounded-3xl border border-emerald-900/10 bg-white/80 p-4 shadow-lg shadow-emerald-900/5 backdrop-blur-md sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pages by title, path (/api, /legal, /docs) or keyword..."
              className="w-full rounded-2xl border border-slate-200/90 bg-white py-3.5 pr-11 pl-12 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Machine-Readable XML Feed Button */}
          <Link
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-emerald-900/15 bg-white px-5 py-3.5 text-xs font-bold text-slate-800 shadow-xs transition-all duration-200 hover:border-emerald-500/40 hover:bg-emerald-50/50 hover:text-emerald-900 active:scale-95"
          >
            <Code2 className="h-4 w-4 text-[#25D366]" />
            <span>Raw XML Sitemap</span>
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </Link>
        </div>

        {/* Category Filter Tabs */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${
              activeCategory === 'all'
                ? 'bg-[#25D366] text-white shadow-md shadow-[#25D366]/25'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
            }`}
          >
            <span>All Categories</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                activeCategory === 'all'
                  ? 'bg-white/25 text-white'
                  : 'bg-white text-slate-600'
              }`}
            >
              {categoryCounts.all ?? 0}
            </span>
          </button>

          {(
            ['main', 'integrations', 'developers', 'legal'] as SitemapCategory[]
          ).map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const count = categoryCounts[cat] ?? 0;
            const isActive = activeCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-800 text-white shadow-md shadow-emerald-950/20'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{meta.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-white text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Showing</span>
          <span className="font-bold text-slate-900">{totalFilteredCount}</span>
          <span>of {sitemap.routes.length} total pages</span>
          {searchQuery && (
            <span className="text-emerald-700">
              for &ldquo;{searchQuery}&rdquo;
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          Auto-synchronized with{' '}
          <code className="font-mono font-semibold text-emerald-700">
            sitemap.xml
          </code>
        </span>
      </div>

      {/* Empty State */}
      {filteredGroups.length === 0 && (
        <div className="rounded-3xl border border-dashed border-emerald-900/15 bg-white/60 p-16 text-center shadow-xs backdrop-blur-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No pages found</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            No active public pages matched your search for &ldquo;{searchQuery}
            &rdquo;. Try another keyword or clear the filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('all');
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#25D366]/25 transition-all hover:bg-[#20bd5a]"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Categorized Route Sections */}
      {filteredGroups.map((group) => {
        const meta = CATEGORY_META[group.category];
        const CategoryIcon = meta.icon;

        return (
          <section key={group.category} className="space-y-6">
            {/* Category Header */}
            <div className="flex flex-col gap-1 border-b border-emerald-900/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-900/10 bg-emerald-50 text-emerald-700 shadow-xs">
                  <CategoryIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {meta.label}
                  </h2>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    {meta.description}
                  </p>
                </div>
              </div>
              <span className="self-start rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 sm:self-auto">
                {group.routes.length}{' '}
                {group.routes.length === 1 ? 'page' : 'pages'}
              </span>
            </div>

            {/* Route Cards Grid */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {group.routes.map((route) => {
                const RouteIcon = getRouteIcon(route);

                return (
                  <Link
                    key={route.path}
                    href={route.path}
                    className="group relative flex flex-col justify-between rounded-3xl border border-emerald-900/10 bg-white/80 p-6 shadow-xs backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-emerald-500/40 hover:bg-white hover:shadow-xl hover:shadow-emerald-900/5"
                  >
                    {/* Top Row: Icon + Path Badge */}
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-emerald-50 to-white text-emerald-700 shadow-2xs transition-all group-hover:scale-105 group-hover:border-emerald-500/40 group-hover:text-emerald-800">
                          <RouteIcon className="h-5 w-5" />
                        </div>
                        <span className="max-w-[190px] truncate rounded-full bg-slate-100/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-500 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-800">
                          {route.path}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className="mt-4 text-base font-bold text-slate-900 transition-colors group-hover:text-emerald-700 sm:text-lg">
                        {route.title}
                      </h3>

                      {route.description ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
                          {route.description}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-400 italic">
                          Official live page on {sitemap.siteName}.
                        </p>
                      )}
                    </div>

                    {/* Bottom Metadata & Link Indicator */}
                    <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatDate(route.lastModified)}</span>
                      </div>

                      <div className="inline-flex items-center gap-1 text-xs font-bold text-[#128C7E] transition-colors group-hover:text-[#25D366]">
                        <span>Visit page</span>
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Bottom Crawler & RSS Info Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-white via-emerald-50/30 to-white p-8 shadow-sm backdrop-blur-md sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#25D366]/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5 text-[#25D366]" />
              <span>Machine-Readable Protocol</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Automatic XML Crawler Index
            </h3>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
              Our sitemap engine continuously synchronizes newly created CMS
              pages, legal agreements, and public tools with Googlebot, Bingbot,
              and AI agent web crawlers at standard XML endpoints.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-xs font-bold text-white shadow-md shadow-[#25D366]/25 transition-all hover:bg-[#20bd5a] hover:shadow-lg"
            >
              <span>Open XML Feed</span>
              <ExternalLink className="h-4 w-4" />
            </Link>
            <Link
              href="/robots.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50"
            >
              <span>View robots.txt</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
