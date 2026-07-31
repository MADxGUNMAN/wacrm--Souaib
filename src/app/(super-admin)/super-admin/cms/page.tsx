"use client";

import Link from "next/link";
import { 
  FileText, 
  Settings, 
  LayoutTemplate, 
  Star, 
  CreditCard,
  Puzzle,
  Scale
} from "lucide-react";
import { Button } from "@/components/ui/button";

const cmsModules = [
  {
    title: "Global Settings",
    description: "Manage site title, tagline, SEO metadata, and social links.",
    icon: Settings,
    href: "/super-admin/cms/settings",
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    borderColor: "border-blue-400/20"
  },
  {
    title: "Landing Sections",
    description: "Edit hero text, CTA buttons, and main landing page blocks.",
    icon: LayoutTemplate,
    href: "/super-admin/cms/sections",
    color: "text-indigo-400",
    bgColor: "bg-indigo-400/10",
    borderColor: "border-indigo-400/20"
  },
  {
    title: "Navigation Links",
    description: "Manage header navbar and footer column links.",
    icon: LayoutTemplate,
    href: "/super-admin/cms/navigation",
    color: "text-pink-400",
    bgColor: "bg-pink-400/10",
    borderColor: "border-pink-400/20"
  },
  {
    title: "Legal Pages",
    description: "Markdown editor for Privacy Policy, Terms of Service, etc.",
    icon: Scale,
    href: "/super-admin/cms/legal",
    color: "text-rose-400",
    bgColor: "bg-rose-400/10",
    borderColor: "border-rose-400/20"
  }
];

export default function CMSDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">CMS & Landing Manager</h2>
        <p className="text-sm text-slate-500 mt-1">Manage all public-facing content, landing pages, and legal documents.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cmsModules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.href} href={module.href} className="group block">
              <div className={`h-full p-6 rounded-xl border bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:bg-slate-50 ${module.borderColor}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-lg ${module.bgColor}`}>
                    <Icon className={`h-6 w-6 ${module.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 group-hover:text-primary transition-colors">
                    {module.title}
                  </h3>
                </div>
                <p className="text-sm text-slate-500">
                  {module.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
