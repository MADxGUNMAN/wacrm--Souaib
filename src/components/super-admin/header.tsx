"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Bell, Building2, Megaphone, Bot, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ActivityEntry {
  type: string;
  description: string;
  account_name: string;
  timestamp: string;
}

interface SuperAdminHeaderProps {
  onOpenSidebar: () => void;
}

function relativeTime(ts: string): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function activityIcon(type: string) {
  switch (type) {
    case "account_created":
      return <UserPlus className="h-3.5 w-3.5 text-emerald-500" />;
    case "broadcast_sent":
      return <Megaphone className="h-3.5 w-3.5 text-blue-500" />;
    case "automation_triggered":
      return <Bot className="h-3.5 w-3.5 text-purple-500" />;
    default:
      return <Building2 className="h-3.5 w-3.5 text-slate-400" />;
  }
}

export function SuperAdminHeader({ onOpenSidebar }: SuperAdminHeaderProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/health");
      if (!res.ok) return;
      const json = await res.json();
      const feed: ActivityEntry[] = json.data?.activity_feed ?? [];
      setActivities(feed.slice(0, 20));
      setUnreadCount(feed.length > 0 ? Math.min(feed.length, 9) : 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 120000); // refresh every 2 min
    return () => clearInterval(interval);
  }, [fetchActivity]);

  // Simple title mapper based on pathname
  let title = "Dashboard";
  let subtitle = "Real-time overview of all Replai accounts";

  if (pathname.includes("/super-admin/accounts")) {
    title = "Accounts Management";
    subtitle = "Monitor and manage all tenant workspaces";
  } else if (pathname.includes("/super-admin/cms")) {
    title = "CMS & Landing Pages";
    subtitle = "Manage public website content and legal documents";
  } else if (pathname.includes("/super-admin/health")) {
    title = "System Health";
    subtitle = "Platform performance and infrastructure status";
  } else if (pathname.includes("/super-admin/settings")) {
    title = "Platform Settings";
    subtitle = "Global configuration and API limits";
  }

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-slate-200 bg-white/80 backdrop-blur-md px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="-m-2.5 p-2.5 text-slate-500 lg:hidden hover:text-slate-900"
        onClick={onOpenSidebar}
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <div className="flex flex-1 items-center justify-between gap-x-4 lg:gap-x-6">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">{subtitle}</p>
        </div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          {/* Notification Bell */}
          <Popover open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (open) setUnreadCount(0);
          }}>
            <PopoverTrigger
              className="relative text-slate-500 hover:text-slate-900 inline-flex items-center justify-center rounded-md h-9 w-9 hover:bg-slate-100 transition-colors"
            >
              <span className="sr-only">View notifications</span>
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-80 p-0 bg-white border border-slate-200 shadow-xl rounded-xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                <span className="text-[10px] text-slate-400 font-medium">
                  {activities.length} recent
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <Bell className="h-6 w-6 mb-2 opacity-40" />
                    <p className="text-xs">No recent activity</p>
                  </div>
                ) : (
                  activities.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="mt-0.5 p-1.5 rounded-full bg-slate-100 flex-shrink-0">
                        {activityIcon(entry.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 leading-snug line-clamp-2">
                          {entry.description}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {entry.account_name} · {relativeTime(entry.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Separator */}
          <div
            className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-200"
            aria-hidden="true"
          />

          {/* Avatar (name + email only, no actions) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 rounded-full outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <Avatar className="size-8 border-2 border-slate-200">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? "Admin avatar"}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="min-w-56 bg-white text-slate-900 border-slate-200 shadow-lg"
            >
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium text-slate-900">
                  {profile?.full_name ?? "Super Admin"}
                </p>
                <p className="truncate text-xs text-slate-500 mt-0.5">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

