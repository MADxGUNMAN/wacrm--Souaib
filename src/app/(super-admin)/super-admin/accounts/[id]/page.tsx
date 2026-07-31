"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
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
  ChevronDown
} from "lucide-react";
import type { AccountDeepDive } from "@/types/super-admin";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function AccountDeepDivePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<AccountDeepDive | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isBanning, setIsBanning] = useState(false);

  const formatter = useMemo(() => new Intl.NumberFormat("en-US"), []);

  const fetchAccount = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/super-admin/accounts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch account details");
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
    setExpandedRows(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleBanToggle = async () => {
    if (!data?.account) return;
    const isCurrentlyBanned = data.account.is_banned;
    
    const confirmMessage = isCurrentlyBanned 
      ? "Are you sure you want to unban this account?"
      : "Are you sure you want to BAN this account? Users will immediately lose access.";
      
    if (!confirm(confirmMessage)) return;

    setIsBanning(true);
    try {
      const method = isCurrentlyBanned ? "DELETE" : "POST";
      const body = !isCurrentlyBanned ? JSON.stringify({ reason: "Admin enforced ban" }) : undefined;
      
      const res = await fetch(`/api/super-admin/accounts/${id}/ban`, {
        method,
        headers: { "Content-Type": "application/json" },
        body
      });
      
      if (!res.ok) throw new Error("Failed to update ban status");
      
      await fetchAccount();
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setIsBanning(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400">Loading account details...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-400 flex flex-col items-center">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>Failed to load account details. It may not exist.</p>
        <Button variant="link" onClick={() => router.push("/super-admin/accounts")} className="mt-4 text-primary">
          Back to Accounts
        </Button>
      </div>
    );
  }

  const { account, members, stats, whatsapp_config } = data;
  const owner = members.find(m => m.account_role === "owner");

  return (
    <div className="space-y-6">
      {/* Top Nav / Breadcrumbs inside page */}
      <div className="flex items-center space-x-4">
        <Link href="/super-admin/accounts" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-slate-100 hover:text-slate-900 text-slate-500">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <Link href="/super-admin/accounts" className="hover:text-primary transition-colors">Accounts</Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">{account.name}</span>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 shadow-sm">
        <div className="flex items-center gap-5">
          <Avatar className="h-16 w-16 rounded-xl border border-slate-200 bg-slate-50">
            <AvatarFallback className="rounded-xl text-2xl font-black bg-slate-50 text-primary">
              <Building2 className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>
          
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              {account.name}
              {account.is_banned && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-500 border border-red-500/30 uppercase">
                  Banned
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>{owner ? `${owner.full_name} (${owner.email})` : "No Owner"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>Created {format(new Date(account.created_at), "MMM d, yyyy")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-4 w-full lg:w-auto">
          <div className="flex gap-2">
            {!account.is_banned ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Suspended
              </span>
            )}
            
            {whatsapp_config ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <MessageSquare className="h-3.5 w-3.5" /> WA Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                <MessageSquare className="h-3.5 w-3.5" /> WA Disconnected
              </span>
            )}
            
            <Button
              variant={account.is_banned ? "outline" : "destructive"}
              size="sm"
              onClick={handleBanToggle}
              disabled={isBanning}
              className="ml-2 h-6 text-xs px-2"
            >
              {account.is_banned ? (
                <><CheckCircle2 className="mr-1 h-3 w-3" /> Unban</>
              ) : (
                <><Ban className="mr-1 h-3 w-3" /> Ban Account</>
              )}
            </Button>
          </div>
          
          <div className="flex gap-6 text-sm text-slate-600">
            <div className="text-right">
              <div className="font-bold text-slate-900 text-lg">{formatter.format(members.length)}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Members</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-right">
              <div className="font-bold text-slate-900 text-lg">{formatter.format(stats.contact_count)}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Contacts</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-right">
              <div className="font-bold text-slate-900 text-lg">{formatter.format(stats.messages_total)}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Messages</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-right">
              <div className="font-bold text-slate-900 text-lg">{formatter.format(stats.total_automations)}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Automations</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-8 space-y-6">
          {/* Members Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Team Members ({members.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-slate-500">User</TableHead>
                    <TableHead className="text-slate-500">Role</TableHead>
                    <TableHead className="text-slate-500">Status</TableHead>
                    <TableHead className="text-slate-500 text-right">Permissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(member => (
                    <React.Fragment key={member.user_id}>
                      <TableRow className="border-slate-200 hover:bg-slate-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 bg-slate-100">
                              <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-bold">
                                {member.full_name?.substring(0, 2).toUpperCase() || member.email.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-slate-900 font-medium">{member.full_name || "Unknown"}</div>
                              <div className="text-xs text-slate-500">{member.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {member.account_role === "owner" ? (
                            <span className="text-yellow-600 text-xs border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 rounded font-medium">Owner</span>
                          ) : (
                            <span className="text-slate-600 text-xs border border-slate-200 bg-slate-100 px-2 py-0.5 rounded font-medium">Member</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.is_active ? (
                            <div className="flex items-center gap-1.5 text-primary">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <span className="text-xs">Active</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
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
                            <ChevronDown className={`h-5 w-5 transition-transform ${expandedRows[member.user_id] ? "rotate-180" : ""}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                      
                      {expandedRows[member.user_id] && (
                        <TableRow className="bg-slate-50 border-b border-slate-200">
                          <TableCell colSpan={4} className="py-4">
                            <div className="grid grid-cols-4 md:grid-cols-7 gap-2 text-xs">
                              {/* Simple permission display logic for Phase 5 */}
                              {['dashboard', 'inbox', 'contacts', 'pipelines', 'broadcasts', 'automations', 'settings'].map(perm => {
                                const hasPerm = member.account_role === 'owner' || (member.permissions && member.permissions[perm as keyof typeof member.permissions]);
                                return (
                                  <div key={perm} className={`flex flex-col gap-1 items-center bg-white p-2 rounded-lg border ${hasPerm ? 'border-primary/20' : 'border-slate-200 opacity-50'}`}>
                                    <span className={hasPerm ? "text-slate-600 capitalize" : "text-slate-400 capitalize"}>{perm}</span>
                                    {hasPerm ? (
                                      <CheckCircle2 className="h-4 w-4 text-primary" />
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
        </div>

        {/* Right Column */}
        <div className="xl:col-span-4 space-y-6">
          {/* WhatsApp Config Card */}
          <div className="bg-white border border-slate-200 border-t-2 border-t-primary rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <MessageSquare className="h-5 w-5" />
              <h3 className="text-lg font-bold text-slate-900">WhatsApp Configuration</h3>
            </div>
            
            {whatsapp_config ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Phone Number</div>
                    <div className="text-sm font-medium text-slate-900 tracking-wider">{whatsapp_config.phone_number_id || "Connected"}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Phone ID</div>
                    <div className="text-xs font-mono text-slate-600 truncate">{whatsapp_config.phone_number_id}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">WABA ID</div>
                    <div className="text-xs font-mono text-slate-600 truncate">{whatsapp_config.waba_id}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 bg-slate-50 rounded-lg border border-slate-200 text-slate-500">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No WhatsApp API connection configured for this account.</p>
              </div>
            )}
          </div>

          {/* Module Bento */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 rounded-lg bg-slate-50 text-slate-500">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 mb-1">{formatter.format(stats.active_conversations)}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Chats</div>
              </div>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 rounded-lg bg-slate-50 text-slate-500">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 mb-1">{formatter.format(stats.active_automations)}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Autos</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
