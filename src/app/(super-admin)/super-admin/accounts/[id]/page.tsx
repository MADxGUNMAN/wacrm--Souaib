'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  Megaphone,
  MessageSquare,
  Phone,
  UserCheck,
  Users,
  Zap,
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import type { AccountDeepDive } from '@/types/super-admin';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PhoneDisplay } from '@/components/ui/phone-display';
import { PresenceDot } from '@/components/presence/presence-dot';
import { usePresenceForAccount } from '@/hooks/use-presence';
import { formatLastSeen, presenceLabel, summarize } from '@/lib/presence';
import {
  ACCOUNT_ACTIVITY_LABEL,
  accountActivityTooltip,
  deriveAccountActivity,
  isWhatsAppConnected,
} from '@/lib/super-admin/account-status';
import { AccountAutoEmailCard } from '@/components/super-admin/auto-mail/account-auto-email-card';
import { WhatsAppConnectionCard } from '@/components/super-admin/accounts/whatsapp-connection-card';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

/**
 * One metric card in the account header grid.
 *
 * Formats key tenant metrics into a clean, balanced dashboard card with
 * semantic colored icon, title, prominent value, and optional context hint.
 */
function HeaderStatCard({
  icon,
  iconBg,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-all hover:border-slate-300 hover:bg-white hover:shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          {label}
        </span>
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight text-slate-900">
          {value}
        </span>
        {hint && (
          <span className="text-[11px] font-medium text-slate-400">{hint}</span>
        )}
      </div>
    </div>
  );
}

export default function AccountDeepDivePage() {
  const confirm = useConfirm();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<AccountDeepDive | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isBanning, setIsBanning] = useState(false);

  const formatter = useMemo(() => new Intl.NumberFormat('en-US'), []);

  // Live presence for the account being INSPECTED, not the super admin's
  // own workspace — hence the explicit-account variant of the hook. Reads
  // `member_presence` over Realtime exactly as the tenant's own Settings →
  // Team members page does, so both surfaces agree and there is one
  // implementation of the online/away/offline rules.
  //
  // Independent of `fetchAccount`: the deep-dive payload is a snapshot with
  // no polling, and `fn_account_deep_dive` does not return the stored
  // `status` at all (only `last_seen_at` and a 5-minute `is_online`), so it
  // cannot tell away from online. The subscription supersedes it here.
  const { getPresence, getRow, now } = usePresenceForAccount(id);

  const fetchAccount = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/super-admin/accounts/${id}`);
      if (!res.ok) throw new Error('Failed to fetch account details');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, [id]);

  const toggleRow = (userId: string) => {
    setExpandedRows((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleBanToggle = async () => {
    if (!data?.account) return;
    const isCurrentlyBanned = data.account.is_banned;

    const ok = await confirm({
      title: isCurrentlyBanned ? 'Unban this account?' : 'Ban this account?',
      description: isCurrentlyBanned
        ? 'Users will regain immediate access to this workspace.'
        : 'Users will immediately lose access to this CRM account. You can unban at any time.',
      confirmText: isCurrentlyBanned ? 'Unban Account' : 'Ban Account',
      cancelText: 'Cancel',
      variant: isCurrentlyBanned ? 'default' : 'destructive',
    });

    if (!ok) return;

    setIsBanning(true);
    try {
      const method = isCurrentlyBanned ? 'DELETE' : 'POST';
      const body = !isCurrentlyBanned
        ? JSON.stringify({ reason: 'Admin enforced ban' })
        : undefined;

      const res = await fetch(`/api/super-admin/accounts/${id}/ban`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) throw new Error('Failed to update ban status');

      toast.success(
        isCurrentlyBanned ? 'Account unbanned successfully' : 'Account banned'
      );
      await fetchAccount();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsBanning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading account details...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center p-8 text-center text-red-400">
        <AlertCircle className="mb-2 h-8 w-8" />
        <p>Failed to load account details. It may not exist.</p>
        <Button
          variant="link"
          onClick={() => router.push('/super-admin/accounts')}
          className="text-primary mt-4"
        >
          Back to Accounts
        </Button>
      </div>
    );
  }

  const { account, members, stats, whatsapp_config } = data;
  const owner = members.find((m) => m.account_role === 'owner');

  // Same inputs the accounts-list view exposes as `whatsapp_status` and
  // `messages_30d`, run through the same helper — so the badge here is
  // guaranteed to match the badge the list showed for this row.
  const activityInput = {
    whatsappStatus: whatsapp_config?.status ?? null,
    messages30d: stats.messages_30d,
  };
  const activity = deriveAccountActivity(activityInput);
  const activityTooltip = accountActivityTooltip(activityInput);
  const waConnected = isWhatsAppConnected(whatsapp_config?.status);

  return (
    <div className="space-y-6">
      {/* Top Nav / Breadcrumbs inside page */}
      <div className="flex items-center space-x-4">
        <Link
          href="/super-admin/accounts"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <Link
            href="/super-admin/accounts"
            className="hover:text-primary transition-colors"
          >
            Accounts
          </Link>
          <span>/</span>
          <span className="font-medium text-slate-900">{account.name}</span>
        </div>
      </div>

      {/* Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Top: Identity & Action Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-slate-50">
              <AvatarFallback className="text-primary rounded-xl bg-slate-50 text-xl font-black">
                <Building2 className="h-7 w-7" />
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900">
                  {account.name}
                </h2>
                {account.is_banned && (
                  <span className="shrink-0 rounded border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-500 uppercase">
                    Banned
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">
                    {owner ? `${owner.full_name} (${owner.email})` : 'No Owner'}
                  </span>
                </div>
                {/* The owner's number, repeated up here so it is reachable
                    without scrolling to the members table on an account
                    with a long team. */}
                {owner?.phone ? (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <PhoneDisplay phone={owner.phone} showFlag copyable />
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>
                    Created{' '}
                    {format(new Date(account.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Banned is an ACCESS fact and gets its own loud badge. It used
                to be folded into a single "Active / Suspended" pill, which
                meant every unbanned workspace read as "Active" here even
                when the accounts list — using a usage-based rule — had just
                labelled it Inactive. Filtering by Inactive and opening the
                row showed "Active" on the next screen. */}
            {account.is_banned ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600"
                title="Banned by a super admin — this workspace has no access, regardless of its activity."
              >
                <Ban className="h-3.5 w-3.5" /> Banned
              </span>
            ) : null}

            {/* Usage, derived by the SAME helper the accounts list uses, so
                the two screens can no longer contradict each other. */}
            <span
              className={
                activity === 'active'
                  ? 'bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500'
              }
              title={activityTooltip}
            >
              <span
                className={
                  activity === 'active'
                    ? 'bg-primary h-1.5 w-1.5 rounded-full'
                    : 'h-1.5 w-1.5 rounded-full bg-slate-400'
                }
              />
              {ACCOUNT_ACTIVITY_LABEL[activity]}
            </span>

            {/* Reads the status column rather than the mere existence of a
                config row — a row that had since disconnected reported
                "WA Connected" here while the list said "Disconnected". */}
            {waConnected ? (
              <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                <MessageSquare className="h-3.5 w-3.5" /> WA Connected
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
                title={
                  whatsapp_config
                    ? `WhatsApp config exists but its status is "${whatsapp_config.status ?? 'unknown'}".`
                    : 'No WhatsApp configuration for this account.'
                }
              >
                <MessageSquare className="h-3.5 w-3.5" /> WA Disconnected
              </span>
            )}

            <Button
              variant={account.is_banned ? 'outline' : 'destructive'}
              size="sm"
              onClick={handleBanToggle}
              disabled={isBanning}
              className="ml-1 h-7 px-2.5 text-xs font-medium"
            >
              {account.is_banned ? (
                <>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Unban
                </>
              ) : (
                <>
                  <Ban className="mr-1 h-3.5 w-3.5" /> Ban Account
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Bottom: 6 Metric Cards Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3 lg:grid-cols-6">
          <HeaderStatCard
            icon={<Users className="size-4 text-blue-600" />}
            iconBg="bg-blue-50"
            value={formatter.format(members.length)}
            label="Members"
          />
          <HeaderStatCard
            icon={<UserCheck className="size-4 text-emerald-600" />}
            iconBg="bg-emerald-50"
            value={formatter.format(stats.contact_count)}
            label="Contacts"
          />
          <HeaderStatCard
            icon={<MessageSquare className="size-4 text-sky-600" />}
            iconBg="bg-sky-50"
            value={formatter.format(stats.messages_total)}
            label="Messages"
          />
          <HeaderStatCard
            icon={<Megaphone className="size-4 text-purple-600" />}
            iconBg="bg-purple-50"
            value={formatter.format(stats.broadcasts_total)}
            label="Broadcasts"
            hint={
              stats.broadcasts_total > stats.broadcasts_sent
                ? `${formatter.format(stats.broadcasts_sent)} sent`
                : null
            }
          />
          <HeaderStatCard
            icon={<FileText className="size-4 text-amber-600" />}
            iconBg="bg-amber-50"
            value={formatter.format(stats.templates_approved)}
            label="Templates"
            hint={
              stats.templates_total > stats.templates_approved
                ? `of ${formatter.format(stats.templates_total)}`
                : null
            }
          />
          <HeaderStatCard
            icon={<Zap className="size-4 text-orange-600" />}
            iconBg="bg-orange-50"
            value={formatter.format(stats.total_automations)}
            label="Automations"
          />
        </div>
      </div>

      {/* `items-start` so the two columns size to their own content.
          Grid items stretch by default, which would make both columns the
          height of the taller one and leave `position: sticky` below with
          nothing to stick within. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Left column — pinned while the right one scrolls.

            The WhatsApp card grew from three fields to two tiers of state, so
            it is now several times taller than Team Members and Auto Email
            combined. Reading it scrolled the team and email context off the
            screen entirely, which is the context you need to make sense of it.

            `top-0` pins the cards right at the top of `<main>`, immediately
            under the super-admin header (which lives outside `<main>`).
            A previous version used `top-20` assuming the header was inside the
            scroll container, which created an 80px empty gap above the cards.

            Only from `xl`, where the two columns exist. Below that they stack,
            and pinning the first one would cover the second.

            NO max-height and NO inner overflow here, deliberately. A first
            version added both as a guard against a very long member list
            outgrowing the viewport, and that guard was the bug: `overflow-y`
            turns this into a scroll container, which is then laid out at its
            max-height rather than hugging its content, so on a short column
            (the normal case — two cards) it reserved a screen-tall box and
            rendered as a slab of empty space beside the WhatsApp card.

            Without it the element is exactly its content height, which is what
            makes `sticky` behave. The case the guard was for is real but rare,
            and the honest trade is a long column scrolling with the page
            instead of an empty box on every normal account. */}
        <div className="space-y-6 xl:sticky xl:top-0 xl:col-span-8 xl:self-start">
          {/* Members Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-900">
                Team Members ({members.length})
              </h3>

              {/* Live roster summary, mirroring the tenant's own Settings →
                  Team members line. Updates without a page refresh as
                  heartbeats land and the local re-derive tick advances. */}
              {members.length > 0
                ? (() => {
                    const counts = summarize(
                      members.map((m) => getPresence(m.user_id))
                    );
                    return (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <PresenceDot status="online" />
                          {counts.online} online
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <PresenceDot status="away" />
                          {counts.away} away
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <PresenceDot status="offline" />
                          {counts.offline} offline
                        </span>
                      </div>
                    );
                  })()
                : null}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-slate-500">User</TableHead>
                    <TableHead className="text-slate-500">Role</TableHead>
                    <TableHead className="text-slate-500">Status</TableHead>
                    <TableHead className="text-right text-slate-500">
                      Permissions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <React.Fragment key={member.user_id}>
                      <TableRow className="border-slate-200 hover:bg-slate-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 bg-slate-100">
                              <AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-600">
                                {member.full_name
                                  ?.substring(0, 2)
                                  .toUpperCase() ||
                                  member.email.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900">
                                {member.full_name || 'Unknown'}
                              </div>
                              <div className="text-xs text-slate-500">
                                {member.email}
                              </div>
                              {/* Captured at signup. Rendered only in this
                                  super-admin panel — no tenant screen shows
                                  it. Absent for members who predate the
                                  field or who were created directly by an
                                  admin, so the row stays quiet rather than
                                  showing an empty line. */}
                              {member.phone ? (
                                <div className="mt-0.5 flex items-center gap-1">
                                  <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                                  <PhoneDisplay phone={member.phone} copyable />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {member.account_role === 'owner' ? (
                            <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600">
                              Owner
                            </span>
                          ) : (
                            <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              Member
                            </span>
                          )}
                        </TableCell>
                        {/* Presence and suspension are different facts and
                            both matter: presence is "are they at their desk
                            right now", suspension is "are they allowed in at
                            all". The cell used to show only suspension
                            (mislabelled "Active"), which read as a liveness
                            indicator it never was. Now presence leads, and
                            suspension is called out beneath it only when it
                            applies — a suspended member still reports
                            presence until their session ends, so collapsing
                            the two would hide one of them. */}
                        <TableCell>
                          {(() => {
                            const presence = getPresence(member.user_id);
                            const row = getRow(member.user_id);
                            // Prefer the live subscription, but fall back to
                            // the timestamp the deep-dive payload already
                            // carries so the first paint isn't blank while
                            // the Realtime snapshot is still in flight.
                            const lastSeenAt =
                              row?.last_seen_at ?? member.last_seen_at ?? null;
                            const label = presenceLabel(
                              presence,
                              lastSeenAt,
                              now
                            );
                            const text =
                              presence === 'online'
                                ? 'Online'
                                : presence === 'away'
                                  ? 'Away'
                                  : 'Offline';
                            return (
                              <div className="flex flex-col gap-1">
                                <span
                                  className="inline-flex items-center gap-1.5"
                                  title={label}
                                >
                                  <PresenceDot status={presence} />
                                  <span className="text-xs text-slate-700">
                                    {text}
                                  </span>
                                </span>
                                {/* Only for offline, and only when we have a
                                    real timestamp: a member who has never
                                    signed in has no presence row at all, and
                                    "last seen a while ago" would invent a
                                    visit that never happened. */}
                                {presence === 'offline' && lastSeenAt ? (
                                  <span className="text-[11px] whitespace-nowrap text-slate-500">
                                    Last seen {formatLastSeen(lastSeenAt, now)}
                                  </span>
                                ) : null}
                                {!member.is_active ? (
                                  <span className="inline-flex w-fit items-center rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                                    Suspended
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleRow(member.user_id)}
                            className="text-slate-500 hover:text-slate-900"
                          >
                            <ChevronDown
                              className={`h-5 w-5 transition-transform ${expandedRows[member.user_id] ? 'rotate-180' : ''}`}
                            />
                          </Button>
                        </TableCell>
                      </TableRow>

                      {expandedRows[member.user_id] && (
                        <TableRow className="border-b border-slate-200 bg-slate-50">
                          <TableCell colSpan={4} className="py-4">
                            <div className="grid grid-cols-4 gap-2 text-xs md:grid-cols-7">
                              {/* Simple permission display logic for Phase 5 */}
                              {[
                                'dashboard',
                                'inbox',
                                'contacts',
                                'pipelines',
                                'broadcasts',
                                'automations',
                                'settings',
                              ].map((perm) => {
                                const hasPerm =
                                  member.account_role === 'owner' ||
                                  (member.permissions &&
                                    member.permissions[
                                      perm as keyof typeof member.permissions
                                    ]);
                                return (
                                  <div
                                    key={perm}
                                    className={`flex flex-col items-center gap-1 rounded-lg border bg-white p-2 ${hasPerm ? 'border-primary/20' : 'border-slate-200 opacity-50'}`}
                                  >
                                    <span
                                      className={
                                        hasPerm
                                          ? 'text-slate-600 capitalize'
                                          : 'text-slate-400 capitalize'
                                      }
                                    >
                                      {perm}
                                    </span>
                                    {hasPerm ? (
                                      <CheckCircle2 className="text-primary h-4 w-4" />
                                    ) : (
                                      <Ban className="h-4 w-4 text-slate-600" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Auto Mail history for this workspace. In the wide column
              because it is a list, and directly under Team Members because
              both answer "who is on the other end of this account". */}
          <AccountAutoEmailCard accountId={id} />
        </div>

        {/* Right Column */}
        <div className="space-y-6 xl:col-span-4">
          {/* WhatsApp connection, in full.
              Extracted from this page because it grew from three fields to
              two tiers of state (ours, then Meta's live view) with its own
              fetch and refresh — see whatsapp-connection-card.tsx. */}
          <WhatsAppConnectionCard accountId={id} config={whatsapp_config} />

          {/* Module Bento */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between">
                <div className="rounded-lg bg-slate-50 p-2 text-slate-500">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
              <div>
                <div className="mb-1 text-2xl font-bold text-slate-900">
                  {formatter.format(stats.active_conversations)}
                </div>
                <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                  Active Chats
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between">
                <div className="rounded-lg bg-slate-50 p-2 text-slate-500">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
              <div>
                <div className="mb-1 text-2xl font-bold text-slate-900">
                  {formatter.format(stats.active_automations)}
                </div>
                <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                  Active Autos
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
