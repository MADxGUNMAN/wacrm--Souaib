'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Calendar,
  MessageSquare,
  Users,
  Zap,
  Phone,
  Settings,
  AlertCircle,
  Ban,
  CheckCircle2,
  MoreVertical,
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
import { AccountAutoEmailCard } from '@/components/super-admin/auto-mail/account-auto-email-card';
import {
  formatDisplayPhoneNumber,
  PHONE_UNKNOWN_LABEL,
} from '@/lib/whatsapp/format-phone-display';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

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
      <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-center gap-5">
          <Avatar className="h-16 w-16 rounded-xl border border-slate-200 bg-slate-50">
            <AvatarFallback className="text-primary rounded-xl bg-slate-50 text-2xl font-black">
              <Building2 className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>

          <div>
            <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900">
              {account.name}
              {account.is_banned && (
                <span className="rounded border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-500 uppercase">
                  Banned
                </span>
              )}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>
                  {owner ? `${owner.full_name} (${owner.email})` : 'No Owner'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>
                  Created {format(new Date(account.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col items-end gap-4 lg:w-auto">
          <div className="flex gap-2">
            {!account.is_banned ? (
              <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                <span className="bg-primary h-1.5 w-1.5 rounded-full" /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{' '}
                Suspended
              </span>
            )}

            {whatsapp_config ? (
              <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
                <MessageSquare className="h-3.5 w-3.5" /> WA Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                <MessageSquare className="h-3.5 w-3.5" /> WA Disconnected
              </span>
            )}

            <Button
              variant={account.is_banned ? 'outline' : 'destructive'}
              size="sm"
              onClick={handleBanToggle}
              disabled={isBanning}
              className="ml-2 h-6 px-2 text-xs"
            >
              {account.is_banned ? (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Unban
                </>
              ) : (
                <>
                  <Ban className="mr-1 h-3 w-3" /> Ban Account
                </>
              )}
            </Button>
          </div>

          <div className="flex gap-6 text-sm text-slate-600">
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">
                {formatter.format(members.length)}
              </div>
              <div className="text-xs tracking-wider text-slate-500 uppercase">
                Members
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">
                {formatter.format(stats.contact_count)}
              </div>
              <div className="text-xs tracking-wider text-slate-500 uppercase">
                Contacts
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">
                {formatter.format(stats.messages_total)}
              </div>
              <div className="text-xs tracking-wider text-slate-500 uppercase">
                Messages
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">
                {formatter.format(stats.total_automations)}
              </div>
              <div className="text-xs tracking-wider text-slate-500 uppercase">
                Automations
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column */}
        <div className="space-y-6 xl:col-span-8">
          {/* Members Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-900">
                Team Members ({members.length})
              </h3>
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
                            <div>
                              <div className="font-medium text-slate-900">
                                {member.full_name || 'Unknown'}
                              </div>
                              <div className="text-xs text-slate-500">
                                {member.email}
                              </div>
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
                        <TableCell>
                          {member.is_active ? (
                            <div className="text-primary flex items-center gap-1.5">
                              <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                              <span className="text-xs">Active</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500">
                              <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              <span className="text-xs">Suspended</span>
                            </div>
                          )}
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
          {/* WhatsApp Config Card */}
          <div className="border-t-primary rounded-xl border border-t-2 border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-primary mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <h3 className="text-lg font-bold text-slate-900">
                WhatsApp Configuration
              </h3>
            </div>

            {whatsapp_config ? (
              <div className="space-y-4">
                {/* The NUMBER, not the phone_number_id. This used to
                    render `phone_number_id` under a "Phone Number" label,
                    so every account appeared to have a 15-digit number
                    like 870875646113078. When Meta has not given us the
                    number yet, say so — the id is shown below in its own
                    field, correctly labelled. */}
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="min-w-0">
                    <div className="mb-0.5 text-xs text-slate-500">
                      Phone Number
                    </div>
                    {formatDisplayPhoneNumber(
                      whatsapp_config.display_phone_number
                    ) ? (
                      <div className="text-sm font-medium tracking-wider text-slate-900">
                        {formatDisplayPhoneNumber(
                          whatsapp_config.display_phone_number
                        )}
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-slate-400 italic">
                        {PHONE_UNKNOWN_LABEL}
                      </div>
                    )}
                    {whatsapp_config.verified_name ? (
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {whatsapp_config.verified_name}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-1 text-[10px] tracking-wider text-slate-500 uppercase">
                      Phone ID
                    </div>
                    <div className="truncate font-mono text-xs text-slate-600">
                      {whatsapp_config.phone_number_id}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-1 text-[10px] tracking-wider text-slate-500 uppercase">
                      WABA ID
                    </div>
                    <div className="truncate font-mono text-xs text-slate-600">
                      {whatsapp_config.waba_id}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                <Phone className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">
                  No WhatsApp API connection configured for this account.
                </p>
              </div>
            )}
          </div>

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
