"use client";

// ============================================================
// Browse the in-app starter template library.
//
// Industry chips across the top, search, and a grid of cards showing the
// message roughly as WhatsApp will render it. "Use template" hands the
// operator to the wizard with everything filled in, still editable.
//
// ─── Why a real preview on the card ───────────────────────────────
//
// A library card that shows raw `{{1}}` placeholders makes every template
// look the same and tells you nothing about whether it fits. The cards
// substitute the shipped sample values, so you read the actual sentence a
// customer would receive before committing to it.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  LibraryBig,
  Loader2,
  Search,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  matchesSearch,
  previewBody,
  variableCount,
  type StarterCategory,
  type StarterTemplate,
} from '@/lib/templates/starter-library';

const CATEGORY_BADGE: Record<string, string> = {
  MARKETING: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  UTILITY: 'border-sky-500/30 bg-sky-500/10 text-sky-600',
  AUTHENTICATION: 'border-violet-500/30 bg-violet-500/10 text-violet-600',
};

export function StarterLibraryBrowser() {
  const [categories, setCategories] = useState<StarterCategory[]>([]);
  const [templates, setTemplates] = useState<StarterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/template-library');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || `Could not load the library (${res.status}).`);
          return;
        }
        setCategories(data.categories ?? []);
        setTemplates(data.templates ?? []);
        // Land on the first category rather than "everything": 67 cards at
        // once is a wall, and the industry is the decision the operator is
        // actually making.
        setActiveCategory(data.categories?.[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load the library.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    // A search spans EVERY category — when you type "payment" you want the
    // matches wherever they live, not only inside the chip you happen to
    // have selected.
    const searching = search.trim() !== '';
    return templates.filter((t) => {
      if (searching) return matchesSearch(t, search);
      return t.category_id === activeCategory;
    });
  }, [templates, activeCategory, search]);

  const searching = search.trim() !== '';
  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? '';

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading the template library…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---- Search ---- */}
      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all templates — payment, delivery, reminder…"
          className="pl-9"
          aria-label="Search templates"
        />
      </div>

      {/* ---- Industry chips ---- */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = !searching && c.id === activeCategory;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSearch('');
                setActiveCategory(c.id);
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
              )}
            >
              <span aria-hidden>{c.emoji}</span>
              {c.name}
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px]',
                  active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                )}
              >
                {c.template_count ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- Active category blurb ---- */}
      {!searching && activeCategory ? (
        <p className="text-sm text-muted-foreground">
          {categories.find((c) => c.id === activeCategory)?.description}
        </p>
      ) : null}

      {searching ? (
        <p className="text-sm text-muted-foreground">
          {visible.length} template{visible.length === 1 ? '' : 's'} matching
          &ldquo;{search.trim()}&rdquo; across every industry.
        </p>
      ) : null}

      {/* ---- Cards ---- */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <LibraryBig className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-foreground">Nothing matched.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a broader search, or start from a blank template.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <article
              key={t.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="flex items-start gap-2 border-b border-border p-4">
                <span className="text-lg" aria-hidden>
                  {t.emoji ?? '📄'}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold break-words text-foreground">
                    {t.title}
                  </h3>
                  {t.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  ) : null}
                </div>
                <Badge
                  className={cn(
                    'shrink-0 border text-[10px]',
                    CATEGORY_BADGE[t.meta_category] ?? '',
                  )}
                >
                  {t.meta_category}
                </Badge>
              </div>

              {/* The message, with sample values substituted so the card
                  reads like a real conversation rather than a form. */}
              <div className="flex-1 bg-[#ECE5DD] p-4 dark:bg-muted/30">
                <div className="rounded-lg rounded-tl-none bg-white p-3 shadow-sm dark:bg-card">
                  {t.header_type === 'text' && t.header_content ? (
                    <p className="mb-1 text-xs font-bold text-slate-900 dark:text-foreground">
                      {t.header_content}
                    </p>
                  ) : null}
                  <p className="text-xs leading-relaxed whitespace-pre-line text-slate-800 dark:text-foreground">
                    {previewBody(t)}
                  </p>
                  {t.footer_text ? (
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-muted-foreground">
                      {t.footer_text}
                    </p>
                  ) : null}
                  {t.buttons && t.buttons.length > 0 ? (
                    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-border">
                      {t.buttons.slice(0, 3).map((b, i) => (
                        <p
                          key={i}
                          className="text-center text-[11px] font-medium text-[#00A5F4]"
                        >
                          {b.text}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                <span className="text-[10px] text-muted-foreground">
                  {searching ? categoryName(t.category_id) : null}
                  {searching && variableCount(t) > 0 ? ' · ' : null}
                  {variableCount(t) > 0
                    ? `${variableCount(t)} variable${variableCount(t) === 1 ? '' : 's'}`
                    : 'No variables'}
                </span>
                <Link
                  href={`/templates/new?library=${encodeURIComponent(t.slug)}`}
                  // prefetch OFF deliberately. The wizard's prefill is
                  // resolved on the server FROM THE QUERY STRING, and a
                  // prefetched render of /templates/new is not guaranteed to
                  // carry it — serve that payload on click and the operator
                  // gets a blank form while the URL bar says otherwise.
                  // There are 67 of these links on screen; prefetching them
                  // all was wasteful anyway.
                  prefetch={false}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Use template
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
        Every template here ships with example values already filled in — vague
        samples are one of the most common reasons Meta rejects a template. You
        can edit everything before submitting.
      </p>
    </div>
  );
}
