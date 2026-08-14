"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  X,
  Activity,
  FileText,
  Mail,
  CreditCard,
  Tag,
  Newspaper,
  LibraryBig,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuperAdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/accounts", label: "Accounts", icon: Users },
  // Payments sits above the catalogue: reviewing money is the daily job,
  // editing prices is occasional.
  { href: "/super-admin/payments", label: "Payments", icon: CreditCard },
  { href: "/super-admin/plans", label: "Plans & Pricing", icon: Tag },
  { href: "/super-admin/cms", label: "CMS & Landing", icon: FileText },
  // Beside CMS rather than under it: both are operator-authored content
  // shipped to every account, and neither is per-tenant data.
  {
    href: "/super-admin/template-library",
    label: "Template Library",
    icon: LibraryBig,
  },
  { href: "/super-admin/contact-submissions", label: "Contact", icon: Mail },
  { href: "/super-admin/newsletter", label: "Newsletter", icon: Newspaper },
  { href: "/super-admin/health", label: "Health", icon: Activity },
  { href: "/super-admin/settings", label: "Settings", icon: Settings },
];

export function SuperAdminSidebar({ open, onClose }: SuperAdminSidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [iconUrl, setIconUrl] = useState<string>("/logo-icon.png");
  const [siteName, setSiteName] = useState<string>("Replai");

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/public/settings", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.favicon_url) setIconUrl(data.settings.favicon_url);
          if (data.settings?.site_name) setSiteName(data.settings.site_name);
        }
      } catch (err) {
        console.error("Failed to load settings in super admin sidebar:", err);
      }
    }
    loadSettings();
  }, []);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white border-r border-slate-200 shadow-2xl transition-transform duration-300 lg:static lg:translate-x-0 py-6 px-4",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-8 px-2">
          <div className="flex items-center gap-3">
            <img src={iconUrl} alt={siteName} className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-black text-[#25D366] tracking-tight">{siteName}</h1>
              <p className="text-xs text-slate-500 font-medium">Super Admin</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-slate-500 hover:text-slate-900"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive =
              item.href === "/super-admin"
                ? pathname === "/super-admin"
                : pathname.startsWith(item.href);

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onClose()}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "bg-[#25D366]/10 text-[#25D366]"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "text-[#25D366]" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-4 space-y-1">
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to logout?")) {
                signOut();
              }
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-200"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
