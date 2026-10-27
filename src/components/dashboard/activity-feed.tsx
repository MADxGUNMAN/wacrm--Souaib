"use client"

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  UserPlus,
  Briefcase,
  Megaphone,
  Zap,
  Inbox,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { loadActivityPage } from '@/lib/dashboard/queries'
import type { ActivityItem, ActivityKind } from '@/lib/dashboard/types'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

const PAGE_SIZES = [5, 10, 20, 50] as const
type PageSize = (typeof PAGE_SIZES)[number]

interface KindTheme {
  icon: ComponentType<{ className?: string }>
  /** Tailwind classes for the round icon badge + label color. */
  badge: string
}

const KIND_THEME: Record<ActivityKind, KindTheme> = {
  message: { icon: MessageSquare, badge: 'bg-blue-500/10 text-blue-400' },
  contact: { icon: UserPlus, badge: 'bg-primary/10 text-primary' },
  deal: { icon: Briefcase, badge: 'bg-primary/10 text-primary' },
  broadcast: { icon: Megaphone, badge: 'bg-amber-500/10 text-amber-400' },
  automation: { icon: Zap, badge: 'bg-rose-500/10 text-rose-400' },
}

/**
 * Dashboard "Recent Activity".
 *
 * Server-side cursor pagination: only the page on screen is fetched
 * (at most pageSize + 1 rows per source, see loadActivityPage), so a
 * workspace with years of history costs the same as a new one.
 * `cursors[i]` is the `before` value that loads page i; page 0 has none.
 * Going back reuses the stored cursor, so Previous never re-walks the
 * history from the start.
 */
export function ActivityFeed() {
  const t = useTranslations('Dashboard.activityFeed')
  const [pageSize, setPageSize] = useState<PageSize>(5)
  const [pageIndex, setPageIndex] = useState(0)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ignore responses that arrive after a newer request was made
  // (fast clicking on Next / page size).
  const requestId = useRef(0)

  const fetchPage = useCallback(
    async (index: number, before: string | null, size: PageSize) => {
      const id = ++requestId.current
      setLoading(true)
      setError(null)
      try {
        const page = await loadActivityPage(createClient(), {
          pageSize: size,
          before,
        })
        if (id !== requestId.current) return
        setItems(page.items)
        setHasMore(page.hasMore)
        setPageIndex(index)
        setCursors((prev) => {
          const next = prev.slice(0, index + 1)
          if (page.nextCursor) next[index + 1] = page.nextCursor
          return next
        })
      } catch (err) {
        if (id !== requestId.current) return
        console.error('[dashboard] activity failed:', err)
        setError(t('loadError'))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    void fetchPage(0, null, 5)
  }, [fetchPage])

  const changeSize = (size: PageSize) => {
    if (size === pageSize) return
    setPageSize(size)
    setCursors([null])
    void fetchPage(0, null, size)
  }
  const goNext = () => {
    const before = cursors[pageIndex + 1]
    if (!hasMore || !before || loading) return
    void fetchPage(pageIndex + 1, before, pageSize)
  }
  const goPrev = () => {
    if (pageIndex === 0 || loading) return
    void fetchPage(pageIndex - 1, cursors[pageIndex - 1] ?? null, pageSize)
  }

  const first = pageIndex * pageSize + 1
  const last = pageIndex * pageSize + (items?.length ?? 0)
  const firstLoad = items === null

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
        <Link
          href="/inbox"
          className="text-xs font-medium text-primary hover:text-primary/80"
        >
          {t('viewAll')}
        </Link>
      </header>

      {firstLoad && loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error && firstLoad ? (
        <p role="alert" className="p-5 text-sm text-destructive">
          {error}
        </p>
      ) : items && items.length === 0 && pageIndex === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={Inbox}
            title={t('noActivity')}
            hint={t('noActivityHint')}
          />
        </div>
      ) : (
        <>
          <ul
            className={cn(
              'divide-y divide-border transition-opacity',
              loading && 'opacity-50'
            )}
            aria-busy={loading}
          >
            {(items ?? []).map((it, i) => {
              const theme = KIND_THEME[it.kind]
              const Icon = theme.icon
              // Alternating row background for scanability. bg-muted/40
              // keeps the stripe visible in both light and dark modes.
              const stripe = i % 2 === 0 ? 'bg-transparent' : 'bg-muted/40'
              const row = (
                <div className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className={cn(
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                      theme.badge
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {it.text}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                    {relativeTime(it.at, t)}
                  </span>
                </div>
              )
              return (
                <li
                  key={it.id}
                  className={cn(stripe, 'transition-colors hover:bg-muted/40')}
                >
                  {it.href ? (
                    <Link href={it.href} className="block">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ul>
          {error ? (
            <p role="alert" className="border-t border-border px-5 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs">
            <span className="text-muted-foreground tabular-nums" aria-live="polite">
              {items && items.length > 0
                ? t('showingRange', { first, last })
                : t('noMore')}
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1" role="group" aria-label={t('show')}>
                <span className="mr-1 text-muted-foreground">{t('show')}</span>
                {PAGE_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => changeSize(size)}
                    aria-pressed={pageSize === size}
                    disabled={loading}
                    className={cn(
                      'rounded-md px-2 py-1 font-medium tabular-nums transition-colors disabled:cursor-not-allowed',
                      pageSize === size
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={pageIndex === 0 || loading}
                  aria-label={t('previous')}
                  className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="min-w-[3.5rem] text-center text-muted-foreground tabular-nums">
                  {t('page', { page: pageIndex + 1 })}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!hasMore || loading}
                  aria-label={t('next')}
                  className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </footer>
        </>
      )}
    </section>
  )
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('timeS', { sec: Math.max(1, diffSec) })
  if (diffSec < 3600) return t('timeM', { min: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('timeH', { hr: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('timeD', { day: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString()
}
