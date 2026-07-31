import Link from "next/link";
import { MessageSquare } from "lucide-react";
import type { SiteSettings, LegalPage } from "@/types/super-admin";

interface LandingFooterProps {
  settings: SiteSettings | null;
  legalPages: Pick<LegalPage, "slug" | "title">[];
}

export function LandingFooter({ settings, legalPages }: LandingFooterProps) {
  const siteName = settings?.site_name || "Replai";
  const copyrightFull =
    settings?.copyright_text || `© ${new Date().getFullYear()} Junkies Coder. All rights reserved.|||Made with ❤️ in India`;
  const [copyrightLeft, copyrightRight] = copyrightFull.includes("|||") 
    ? copyrightFull.split("|||") 
    : [copyrightFull, "Made with ❤️ in India"];
  const logoUrl = settings?.logo_url;

  return (
    <footer className="bg-white w-full py-12 px-6 border-t border-slate-200">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
        {/* Brand Column */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center mb-6">
            <img src="/meta-business-partner-badge.webp" alt="Meta Business Partner" className="h-16 object-contain" />
          </div>
          <p className="text-sm text-slate-600 mb-6">
            {settings?.site_description || "As an official Meta Business Partner, we deliver secure, reliable, and enterprise-grade WhatsApp solutions trusted by businesses globally."}
          </p>
          {settings?.show_social_icons && (
            <div className="flex gap-4 text-slate-400">
              {settings.social_twitter && (
                <a href={settings.social_twitter} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
              )}
              {settings.social_linkedin && (
                <a href={settings.social_linkedin} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                </a>
              )}
              {settings.social_github && (
                <a href={settings.social_github} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Footer Columns */}
        {settings?.footer_links?.map((column, colIdx) => (
          <div key={colIdx} className="flex flex-col gap-3 text-sm text-slate-600">
            <h4 className="text-slate-900 font-semibold mb-2">{column.title}</h4>
            {column.links.map((link, linkIdx) => (
              <Link
                key={linkIdx}
                href={link.href}
                target={link.isExternal ? "_blank" : undefined}
                rel={link.isExternal ? "noopener noreferrer" : undefined}
                className="hover:text-[#25D366] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* BIG Branding Name */}
      <div className="max-w-7xl mx-auto w-full pt-16 pb-8 flex justify-center items-center overflow-hidden mt-12 px-6">
         <img 
           src={logoUrl || "/Replai-logo.png"} 
           alt={siteName} 
           className="w-full max-w-xl object-contain opacity-95" 
         />
      </div>

      <div className="max-w-7xl mx-auto pt-6 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-sm text-slate-500">{copyrightLeft}</p>
        <p className="text-sm text-slate-500 font-medium">{copyrightRight}</p>
      </div>
    </footer>
  );
}
