'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useSupportTenant } from '@/hooks/use-support-tenant';
import { hasSectionAccess, canAccessSettingsSection } from '@/lib/auth/roles';
import { THEMES } from '@/lib/themes';
import { CURRENCIES } from '@/lib/currency';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import { type SettingsSection } from './settings-sections';
import { SettingsChip, StatusDot } from './settings-chip';
import { ROLE_META } from './role-meta';
import {
  DEFAULT_LAYOUT,
  SHORTCUTS,
  getShortcut,
  moveItem,
  normaliseLayout,
  storageKey,
  type ShortcutDef,
  type ShortcutGroup,
  type ShortcutId,
  type ShortcutLayout,
} from './overview-shortcuts';

interface OverviewCounts {
  members: number | null;
  pendingInvites: number | null;
  templates: number | null;
  templatesPending: number | null;
  tags: number | null;
  customFields: number | null;
}

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
}

const GROUP_ORDER: ShortcutGroup[] = ['workspace', 'app', 'account', 'help'];

export function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const {
    user,
    profile,
    accountId,
    accountRole,
    defaultCurrency,
    canManageMembers,
  } = useAuth();
  const { mode, theme } = useTheme();
  const { available: liveChatAvailable } = useSupportTenant();
  const t = useTranslations('Settings.overview');
  const tRoles = useTranslations('Settings.roles');
  const tSections = useTranslations('Settings.sections');

  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  // WhatsApp status is tracked separately: its health check decrypts the
  // token and pings Meta, which is far slower than the cheap count
  // queries. Gating it independently keeps a slow/flaky Meta round-trip
  // from blanking the rest of the landing.
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);

  // Shortcut layout: per user, per device (localStorage), like the theme.
  const [layout, setLayout] = useState<ShortcutLayout>(DEFAULT_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  // Drag and drop: while dragging, `preview` holds the live order so the
  // other tiles slide out of the way; it is saved on drop and dropped if
  // the drag is cancelled.
  const [draggingId, setDraggingId] = useState<ShortcutId | null>(null);
  const [preview, setPreview] = useState<ShortcutId[] | null>(null);
  const dropped = useRef(false);
  const lastSwapAt = useRef(0);
  // FLIP animation: each tile's last position inside the grid.
  const tileEls = useRef(new Map<string, HTMLElement>());
  const lastPos = useRef(new Map<string, { x: number; y: number }>());
  const lastMode = useRef('');

  useEffect(() => {
    if (!user?.id) return;
    const key = storageKey(user.id);
    (async () => {
      let stored: unknown = null;
      try {
        const raw = localStorage.getItem(key);
        stored = raw ? JSON.parse(raw) : null;
      } catch {
        stored = null;
      }
      setLayout(stored ? normaliseLayout(stored) : DEFAULT_LAYOUT);
      setLayoutReady(true);
    })();
  }, [user?.id]);

  const saveLayout = (next: ShortcutLayout) => {
    setLayout(next);
    if (!user?.id) return;
    try {
      localStorage.setItem(storageKey(user.id), JSON.stringify(next));
    } catch {
      // Private browsing: the change still applies for this session.
    }
  };

  useEffect(() => {
    if (!user || !accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const acctId = accountId;

    // Cheap counts — resolve fast, render immediately.
    (async () => {
      setCountsLoading(true);
      const [
        membersRes,
        invitesRes,
        templatesTotal,
        templatesPending,
        tagsRes,
        fieldsRes,
      ] = await Promise.allSettled([
        fetch('/api/account/members', { cache: 'no-store' }).then((r) =>
          r.json()
        ),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' }).then((r) =>
              r.json()
            )
          : Promise.resolve(null),
        supabase
          .from('message_templates')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', acctId),
        supabase
          .from('message_templates')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', acctId)
          .eq('status', 'PENDING'),
        supabase
          .from('tags')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', acctId),
        supabase
          .from('custom_fields')
          .select('id', { count: 'exact', head: true }),
      ]);

      if (cancelled) return;

      const members =
        membersRes.status === 'fulfilled' &&
        Array.isArray(membersRes.value?.members)
          ? membersRes.value.members.length
          : null;
      const pendingInvites =
        invitesRes.status === 'fulfilled' &&
        invitesRes.value &&
        Array.isArray(invitesRes.value.invitations)
          ? invitesRes.value.invitations.length
          : null;

      setCounts({
        members,
        pendingInvites,
        templates:
          templatesTotal.status === 'fulfilled'
            ? (templatesTotal.value.count ?? null)
            : null,
        templatesPending:
          templatesPending.status === 'fulfilled'
            ? (templatesPending.value.count ?? null)
            : null,
        tags:
          tagsRes.status === 'fulfilled' ? (tagsRes.value.count ?? null) : null,
        customFields:
          fieldsRes.status === 'fulfilled'
            ? (fieldsRes.value.count ?? null)
            : null,
      });
      setCountsLoading(false);
    })();

    // WhatsApp connection status — slower, independent.
    (async () => {
      setWhatsappLoading(true);
      const [row, health] = await Promise.allSettled([
        supabase
          .from('whatsapp_config')
          .select('phone_number_id')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/whatsapp/config', { cache: 'no-store' }).then((r) =>
          r.json()
        ),
      ]);
      if (cancelled) return;
      setWhatsapp({
        configured:
          row.status === 'fulfilled' && !!row.value.data?.phone_number_id,
        connected: health.status === 'fulfilled' && !!health.value?.connected,
      });
      setWhatsappLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, accountId, canManageMembers]);

  const displayName = profile?.full_name || profile?.email || t('yourAccount');
  const initial = (profile?.full_name || profile?.email || 'U')
    .charAt(0)
    .toUpperCase();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;

  const currencyLabel =
    CURRENCIES.find((c) => c.code === defaultCurrency)?.label ??
    defaultCurrency;
  const themeName = THEMES.find((th) => th.id === theme)?.name ?? theme;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---- Which shortcuts this person may use (same rules as the rails) ----
  const role = profile?.account_role ?? accountRole;
  const permissions = profile?.permissions;
  const canUseSettings = hasSectionAccess(role, permissions, 'settings');
  const allowed = (def: ShortcutDef): boolean => {
    if (def.section) {
      if (def.section === 'live-chat' && !liveChatAvailable) return false;
      if (!canUseSettings && def.group !== 'account') return false;
      return canAccessSettingsSection(role, permissions, def.section);
    }
    return def.pageAccess
      ? hasSectionAccess(role, permissions, def.pageAccess)
      : true;
  };

  const visibleItems = (preview ?? layout.items)
    .map((id) => getShortcut(id))
    .filter((d): d is ShortcutDef => !!d && allowed(d));
  const hiddenOptions = SHORTCUTS.filter(
    (d) => allowed(d) && !layout.items.includes(d.id)
  );

  const label = (def: ShortcutDef): string =>
    def.section
      ? tSections(def.section)
      : t(`shortcuts.pages.${def.id.replace('page:', '')}`);

  // Live status where we have it; a short description everywhere else.
  const subtitle = (
    def: ShortcutDef
  ): { loading: boolean; node: ReactNode } => {
    switch (def.id) {
      case 'whatsapp':
        return {
          loading: whatsappLoading,
          node: !whatsapp?.configured ? (
            t('notSetup')
          ) : whatsapp.connected ? (
            <>
              <StatusDot tone="ok" /> {t('connected')}
            </>
          ) : (
            <>
              <StatusDot tone="muted" /> {t('needsReconnecting')}
            </>
          ),
        };
      case 'members':
        return {
          loading: countsLoading,
          node:
            counts?.members == null
              ? t('viewTeamMembers')
              : `${t('membersCount', { count: counts.members })}${
                  counts.pendingInvites
                    ? ` · ${t('pendingInvites', { count: counts.pendingInvites })}`
                    : ''
                }`,
        };
      case 'deals':
        return {
          loading: false,
          node: `${defaultCurrency} — ${currencyLabel}`,
        };
      case 'fields':
        return {
          loading: countsLoading,
          node:
            counts?.tags == null && counts?.customFields == null
              ? t('tagsAndFields')
              : `${t('tagsCount', { count: counts?.tags ?? 0 })} · ${t(
                  'fieldsCount',
                  { count: counts?.customFields ?? 0 }
                )}`,
        };
      case 'appearance':
        return {
          loading: false,
          node: t('appearance', { mode: cap(mode), theme: themeName }),
        };
      case 'page:templates':
        return {
          loading: countsLoading,
          node:
            counts?.templates == null
              ? t('manageTemplates')
              : `${t('templatesCount', { count: counts.templates })}${
                  counts.templatesPending
                    ? ` · ${t('pendingReview', { count: counts.templatesPending })}`
                    : ''
                }`,
        };
      default:
        return {
          loading: false,
          node: t(`shortcuts.desc.${def.id.replace('page:', '')}`),
        };
    }
  };

  // ---- Layout editing ----
  const removeAt = (id: ShortcutId) =>
    saveLayout({ ...layout, items: layout.items.filter((x) => x !== id) });
  const addItem = (id: ShortcutId) =>
    saveLayout({ ...layout, items: [...layout.items, id] });
  // Keyboard reordering on the drag handle (no visible arrow buttons).
  // Steps over items this user can't see, so one key press always moves
  // the tile by one visible place.
  const moveBy = (id: ShortcutId, delta: number) => {
    const from = layout.items.indexOf(id);
    if (from < 0) return;
    const visibleIds = visibleItems.map((d) => d.id);
    const neighbour = visibleIds[visibleIds.indexOf(id) + delta];
    if (!neighbour) return;
    saveLayout({
      ...layout,
      items: moveItem(layout.items, from, layout.items.indexOf(neighbour)),
    });
  };

  const startDrag = (id: ShortcutId) => {
    dropped.current = false;
    setDraggingId(id);
    setPreview([...layout.items]);
  };
  // Live reorder as the dragged tile passes over another one. Throttled to
  // the animation length so a tile sliding under the cursor can't bounce
  // the order straight back.
  const dragOver = (targetId: ShortcutId, now: number) => {
    if (!draggingId || !preview || targetId === draggingId) return;
    if (now - lastSwapAt.current < 180) return;
    const from = preview.indexOf(draggingId);
    const to = preview.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    lastSwapAt.current = now;
    setPreview(moveItem(preview, from, to));
  };
  const commitDrag = () => {
    dropped.current = true;
    if (preview) saveLayout({ ...layout, items: preview });
    setPreview(null);
    setDraggingId(null);
  };
  const endDrag = () => {
    // Fires after drop too; only a cancelled drag (Esc, dropped outside)
    // restores the saved order.
    if (!dropped.current) setPreview(null);
    setDraggingId(null);
  };
  const resetLayout = () =>
    saveLayout({ items: [...DEFAULT_LAYOUT.items], view: layout.view });

  const compact = layout.view === 'compact';

  // FLIP: after each reorder, slide every tile from its old spot to the
  // new one. Positions are relative to the grid (offsetLeft/Top), so page
  // scrolling never triggers a false animation. Switching edit mode or the
  // layout only records positions, it doesn't animate.
  const orderKey = visibleItems.map((d) => d.id).join('|');
  const modeKey = `${editing}|${layout.view}`;
  useLayoutEffect(() => {
    const animate =
      lastMode.current === modeKey &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, { x: number; y: number }>();
    tileEls.current.forEach((el, id) => {
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, pos);
      const prev = lastPos.current.get(id);
      if (animate && prev && (prev.x !== pos.x || prev.y !== pos.y)) {
        el.animate(
          [
            {
              transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)`,
            },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
        );
      }
    });
    lastPos.current = next;
    lastMode.current = modeKey;
  }, [orderKey, modeKey]);

  const tileRef = (id: string) => (el: HTMLElement | null) => {
    if (el) tileEls.current.set(id, el);
    else tileEls.current.delete(id);
  };

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Identity */}
      <Card className="flex-row items-center gap-4 px-5 py-5">
        <Avatar className="ring-primary/20 border-background size-14 overflow-hidden rounded-full border shadow-xs ring-2">
          {profile?.avatar_url ? (
            <AvatarImage
              src={profile.avatar_url}
              alt={displayName}
              className="size-full object-cover object-center"
            />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-base font-semibold">
            {displayName}
          </div>
          {profile?.email ? (
            <div className="text-muted-foreground truncate text-sm">
              {profile.email}
            </div>
          ) : null}
        </div>
        {roleMeta && RoleIcon ? (
          <SettingsChip variant={roleMeta.variant}>
            <RoleIcon />
            {tRoles(accountRole!)}
          </SettingsChip>
        ) : null}
      </Card>

      {/* Shortcuts toolbar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-foreground text-sm font-semibold">
            {t('shortcuts.title')}
          </h2>
          <p className="text-muted-foreground text-xs">
            {editing ? t('shortcuts.editHint') : t('shortcuts.hint')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!editing ? (
            <div
              role="group"
              aria-label={t('shortcuts.viewLabel')}
              className="border-border bg-muted/40 inline-flex rounded-lg border p-0.5"
            >
              {(
                [
                  ['cards', LayoutGrid, t('shortcuts.viewCards')],
                  ['compact', List, t('shortcuts.viewCompact')],
                ] as const
              ).map(([view, ViewIcon, viewLabel]) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={layout.view === view}
                  aria-label={viewLabel}
                  title={viewLabel}
                  onClick={() => saveLayout({ ...layout, view })}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    layout.view === view
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ViewIcon className="size-3.5" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPicking(true)}
                disabled={hiddenOptions.length === 0}
              >
                <Plus className="size-3.5" aria-hidden />
                {t('shortcuts.add')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetLayout}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t('shortcuts.reset')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraggingId(null);
                  setPreview(null);
                }}
              >
                <Check className="size-3.5" aria-hidden />
                {t('shortcuts.done')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              {t('shortcuts.customize')}
            </Button>
          )}
        </div>
      </div>

      {/* Shortcut grid */}
      {!layoutReady ? (
        <div
          className={cn(
            'mt-3 grid gap-3',
            compact
              ? 'sm:grid-cols-2 xl:grid-cols-4'
              : 'sm:grid-cols-2 xl:grid-cols-3'
          )}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border-border bg-muted/30 h-[74px] animate-pulse rounded-xl border"
            />
          ))}
        </div>
      ) : visibleItems.length === 0 && !editing ? (
        <div className="border-border text-muted-foreground mt-3 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          <p>{t('shortcuts.empty')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(true);
              setPicking(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            {t('shortcuts.add')}
          </Button>
        </div>
      ) : (
        <ul
          onDragOver={(e) => {
            if (draggingId) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!draggingId) return;
            e.preventDefault();
            commitDrag();
          }}
          className={cn(
            'relative mt-3 grid gap-3',
            compact
              ? 'gap-2 sm:grid-cols-2 xl:grid-cols-4'
              : 'sm:grid-cols-2 xl:grid-cols-3'
          )}
        >
          {visibleItems.map((def) => {
            const Icon = def.icon;
            const name = label(def);
            const sub = compact ? null : subtitle(def);
            const body = (
              <>
                <span
                  className={cn(
                    'bg-primary-soft text-primary flex shrink-0 items-center justify-center rounded-lg',
                    compact ? 'size-7' : 'size-9'
                  )}
                >
                  <Icon
                    className={compact ? 'size-3.5' : 'size-4'}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  {/* Full name, wrapping onto a second line when needed. */}
                  <span className="text-foreground block text-sm leading-snug font-semibold break-words">
                    {name}
                  </span>
                  {sub ? (
                    <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-xs">
                      {sub.loading ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />{' '}
                          {t('loading')}
                        </>
                      ) : (
                        sub.node
                      )}
                    </span>
                  ) : null}
                </span>
              </>
            );
            const tileClass = cn(
              'group border-border bg-card flex w-full items-center gap-3 rounded-xl border text-left transition-colors',
              compact ? 'px-3 py-2.5' : 'p-4',
              !editing && 'hover:border-primary-soft-2 hover:bg-card-2'
            );

            if (editing) {
              return (
                <li
                  key={def.id}
                  ref={tileRef(def.id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    // Firefox only starts a drag when data is set.
                    e.dataTransfer.setData('text/plain', def.id);
                    startDrag(def.id);
                  }}
                  onDragEnter={(e) => dragOver(def.id, e.timeStamp)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    dragOver(def.id, e.timeStamp);
                  }}
                  onDragEnd={endDrag}
                  className={cn(
                    tileClass,
                    'cursor-grab border-dashed active:cursor-grabbing',
                    draggingId === def.id &&
                      'border-primary bg-primary-soft/40 opacity-50'
                  )}
                >
                  <button
                    type="button"
                    aria-label={t('shortcuts.reorderHandle', { name })}
                    title={t('shortcuts.reorderHandle', { name })}
                    onKeyDown={(e) => {
                      const delta =
                        e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                          ? -1
                          : e.key === 'ArrowRight' || e.key === 'ArrowDown'
                            ? 1
                            : 0;
                      if (!delta) return;
                      e.preventDefault();
                      moveBy(def.id, delta);
                    }}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-1 inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded outline-none focus-visible:ring-2"
                  >
                    <GripVertical className="size-4" aria-hidden />
                  </button>
                  {body}
                  <IconButton
                    label={t('shortcuts.remove', { name })}
                    onClick={() => removeAt(def.id)}
                    destructive
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </li>
              );
            }

            return (
              <li key={def.id}>
                {def.section ? (
                  <Link
                    href={`/settings?tab=${def.section}`}
                    replace={true}
                    scroll={false}
                    onClick={(e) => {
                      // Keep Ctrl/Cmd/middle-click "open in new tab".
                      if (
                        e.metaKey ||
                        e.ctrlKey ||
                        e.shiftKey ||
                        e.button !== 0
                      )
                        return;
                      // In-page switch, same as the rail (no server round trip).
                      e.preventDefault();
                      onSelect(def.section!);
                    }}
                    className={tileClass}
                  >
                    {body}
                    <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <Link
                    href={def.href!}
                    {...(def.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className={tileClass}
                  >
                    {body}
                    {def.external ? (
                      <ExternalLink className="text-muted-foreground size-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </Link>
                )}
              </li>
            );
          })}

          {editing ? (
            <li>
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={hiddenOptions.length === 0}
                className={cn(
                  'border-border text-muted-foreground hover:text-foreground hover:border-primary-soft-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium transition-colors disabled:opacity-50',
                  compact ? 'min-h-[46px]' : 'min-h-[74px]'
                )}
              >
                <Plus className="size-4" aria-hidden />
                {hiddenOptions.length === 0
                  ? t('shortcuts.allAdded')
                  : t('shortcuts.add')}
              </button>
            </li>
          ) : null}
        </ul>
      )}

      <AddShortcutDialog
        open={picking}
        onOpenChange={setPicking}
        options={hiddenOptions}
        label={label}
        onAdd={addItem}
      />
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'text-muted-foreground focus-visible:ring-ring/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-30',
        destructive
          ? 'hover:bg-destructive/10 hover:text-destructive'
          : 'hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function AddShortcutDialog({
  open,
  onOpenChange,
  options,
  label,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ShortcutDef[];
  label: (def: ShortcutDef) => string;
  onAdd: (id: ShortcutId) => void;
}) {
  const t = useTranslations('Settings.overview');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        items: options.filter(
          (d) => d.group === group && (!q || label(d).toLowerCase().includes(q))
        ),
      })).filter((g) => g.items.length > 0),
    [options, q, label]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery('');
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.addTitle')}</DialogTitle>
          <DialogDescription>{t('shortcuts.addDescription')}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shortcuts.search')}
            aria-label={t('shortcuts.search')}
            className="border-border bg-background text-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
          />
        </div>

        <div className="-mx-1 max-h-[55vh] space-y-4 overflow-y-auto px-1">
          {grouped.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {options.length === 0
                ? t('shortcuts.allAdded')
                : t('shortcuts.noMatch')}
            </p>
          ) : (
            grouped.map(({ group, items }) => (
              <section key={group}>
                <h3 className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-wide uppercase">
                  {t(`shortcuts.groups.${group}`)}
                </h3>
                <ul className="space-y-1">
                  {items.map((def) => {
                    const Icon = def.icon;
                    return (
                      <li key={def.id}>
                        <button
                          type="button"
                          onClick={() => onAdd(def.id)}
                          className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2"
                        >
                          <span className="bg-primary-soft text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
                            <Icon className="size-3.5" aria-hidden />
                          </span>
                          <span className="text-foreground flex-1 font-medium">
                            {label(def)}
                          </span>
                          <Plus
                            className="text-muted-foreground size-4"
                            aria-hidden
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
