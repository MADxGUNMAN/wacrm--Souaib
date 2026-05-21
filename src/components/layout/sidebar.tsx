"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import type { VendorPermissions } from "@/types";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  GitBranch,
  Radio,
  Zap,
  Settings,
  LogOut,
  User,
  X,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const ALL_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permKey: "dashboard" as keyof VendorPermissions },
  { href: "/inbox", label: "Inbox", icon: MessageSquare, permKey: "inbox" as keyof VendorPermissions },
  { href: "/contacts", label: "Contacts", icon: Users, permKey: "contacts" as keyof VendorPermissions },
  { href: "/pipelines", label: "Pipelines", icon: GitBranch, permKey: "pipelines" as keyof VendorPermissions },
  { href: "/broadcasts", label: "Broadcasts", icon: Radio, permKey: "broadcasts" as keyof VendorPermissions },
  { href: "/automations", label: "Automations", icon: Zap, permKey: "automations" as keyof VendorPermissions },
];

const bottomNavItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile, isVendor, hasPermission, signOut } = useAuth();
  const totalUnread = useTotalUnread();

  // Filter nav items based on role and permissions
  const navItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => hasPermission(item.permKey));
  }, [hasPermission]);

  // Close the drawer when route changes
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-sidebar backdrop-blur-md",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Primary"
      >
        {/* Logo row */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 bg-sidebar">
          <Link href={isVendor ? "/inbox" : "/dashboard"} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary shadow-[0_0_8px_rgba(45,212,191,0.1)]">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4.5 w-4.5"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M19.077 4.928A9.886 9.886 0 0 0 12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.459 3.45 1.331 4.966L2 22l5.302-1.39A9.86 9.86 0 0 0 12.036 22c5.46 0 9.9-4.44 9.9-9.9a9.896 9.896 0 0 0-2.859-7.072zm-7.037 14.37h-.003c-1.55 0-3.07-.417-4.4-1.206l-.316-.188-3.272.858.874-3.19-.206-.328A8.22 8.22 0 0 1 3.52 11.9c0-4.54 3.7-8.24 8.245-8.24 2.2 0 4.269.858 5.825 2.417a8.18 8.18 0 0 1 2.41 5.833c-.001 4.54-3.7 8.24-8.239 8.24zm4.568-6.223c-.25-.125-1.478-.73-1.706-.813-.228-.083-.393-.125-.56.125-.166.25-.644.813-.79 1-.145.187-.29.208-.54.083-.25-.125-1.054-.388-2.008-1.24-.74-.66-1.24-1.475-1.385-1.725-.145-.25-.015-.385.11-.51.113-.11.25-.29.375-.436.125-.145.166-.25.25-.417.083-.166.042-.312-.02-.437-.063-.125-.56-1.354-.768-1.854-.203-.488-.41-.422-.56-.43-.146-.007-.312-.008-.479-.008-.166 0-.437.062-.666.312-.228.25-.873.854-.873 2.083 0 1.23.894 2.417.997 2.562.104.146 1.76 2.688 4.265 3.77.595.258 1.06.41 1.422.526.608.193 1.162.166 1.6.1.488-.073 1.478-.604 1.686-1.188.208-.583.208-1.083.146-1.187-.063-.105-.229-.167-.479-.292z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-sm font-extrabold tracking-wider text-sidebar-foreground uppercase">
                WACRM
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Role badge for vendors */}
        {isVendor && (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-primary/10 bg-primary/5 px-3 py-1.5">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">
              Vendor Mode
            </span>
          </div>
        )}

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all lg:py-2",
                      isActive
                        ? "bg-primary/5 text-primary border-l-2 border-primary rounded-l-none pl-2.5"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border-l-2 border-transparent pl-2.5",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 font-heading font-medium tracking-wide">{item.label}</span>
                    {showUnreadDot && (
                      <span
                        aria-label={`${totalUnread} unread conversation${totalUnread === 1 ? "" : "s"}`}
                        className="font-mono text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(45,212,191,0.05)]"
                      >
                        {totalUnread}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 border-t border-border" />

          <ul className="flex flex-col gap-1">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all lg:py-2",
                      isActive
                        ? "bg-primary/5 text-primary border-l-2 border-primary rounded-l-none pl-2.5"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border-l-2 border-transparent pl-2.5",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-heading font-medium tracking-wide">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="shrink-0 border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent focus:bg-sidebar-accent focus:outline-none data-popup-open:bg-sidebar-accent">
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? "Avatar"}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile?.full_name ?? "User"}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60 font-mono">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-card border border-border text-card-foreground shadow-sm"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-card-foreground/80 focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4 text-primary" />
                Profile
              </DropdownMenuItem>
              {!isVendor && (
                <DropdownMenuItem
                  render={
                    <Link
                      href="/settings?tab=whatsapp"
                      onClick={onClose}
                      className="text-card-foreground/80 focus:bg-accent focus:text-accent-foreground"
                    />
                  }
                >
                  <Settings className="size-4 text-primary" />
                  Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-card-foreground/80 focus:bg-accent focus:text-accent-foreground cursor-pointer"
              >
                <LogOut className="size-4 text-red-500" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
