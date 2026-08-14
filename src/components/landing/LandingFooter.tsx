"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Loader2 } from "lucide-react";
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

  // Newsletter form state
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterLoading(true);
    setNewsletterMessage(null);

    try {
      const res = await fetch('/api/public/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail }),
      });

      const data = await res.json();

      if (res.ok) {
        setNewsletterMessage({ type: 'success', text: data.message || 'Check your email to confirm!' });
        setNewsletterEmail('');
      } else {
        setNewsletterMessage({ type: 'error', text: data.error || 'Something went wrong.' });
      }
    } catch {
      setNewsletterMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <footer className="bg-white w-full py-12 px-6 border-t border-slate-200">
      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 ${settings?.show_newsletter ? 'lg:grid-cols-5' : ''} gap-8 max-w-7xl mx-auto`}>
        {/* Brand Column */}
        <div className="col-span-1">
          <div className="flex items-center mb-6">
            <img
              src={settings?.meta_partner_badge_url || "/meta-business-partner-badge.webp"}
              alt="Meta Business Partner"
              className="h-16 object-contain"
            />
          </div>
          <p className="text-sm text-slate-600 mb-6">
            {settings?.site_description || "As an official Meta Business Partner, we deliver secure, reliable, and enterprise-grade WhatsApp solutions trusted by businesses globally."}
          </p>
          {settings?.show_social_icons && (
            <div className="flex gap-4 text-slate-400">
              {settings.social_twitter && (
                <a href={settings.social_twitter} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors" title="Twitter / X">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
              )}
              {settings.social_linkedin && (
                <a href={settings.social_linkedin} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors" title="LinkedIn">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                </a>
              )}
              {settings.social_github && (
                <a href={settings.social_github} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors" title="GitHub">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                </a>
              )}
              {settings.social_instagram && (
                <a href={settings.social_instagram} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors" title="Instagram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
              )}
              {settings.social_youtube && (
                <a href={settings.social_youtube} target="_blank" rel="noreferrer" className="hover:text-[#25D366] transition-colors" title="YouTube">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Footer Columns */}
        {settings?.footer_links?.map((column, colIdx) => (
          <div key={colIdx} className="flex flex-col gap-3 text-sm text-slate-600 lg:justify-self-center">
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

        {/* Newsletter Signup (5th Column right of Legal) */}
        {settings?.show_newsletter && (
          <div className="flex flex-col gap-3 text-sm text-slate-600 col-span-1">
            <h4 className="text-slate-900 font-semibold mb-2">Subscribe to newsletter</h4>
            <p className="text-xs text-slate-500 mb-1 leading-relaxed">
              Get the latest updates and product announcements directly to your inbox.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col gap-2 mt-1">
              <input
                type="email"
                placeholder="Enter your email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                disabled={newsletterLoading}
                className="px-3.5 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] w-full transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={newsletterLoading}
                className="px-3.5 py-2 text-xs bg-[#25D366] text-white font-semibold rounded-lg hover:bg-[#1eae53] transition-colors w-full shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {newsletterLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                {newsletterLoading ? 'Subscribing...' : 'Subscribe'}
              </button>
            </form>
            {newsletterMessage && (
              <p className={`text-xs mt-1 ${newsletterMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {newsletterMessage.text}
              </p>
            )}
          </div>
        )}
      </div>

      {/* BIG Branding Name */}
      <div className="max-w-7xl mx-auto w-full pt-4 pb-2 flex justify-center items-center overflow-hidden mt-2 px-6">
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
