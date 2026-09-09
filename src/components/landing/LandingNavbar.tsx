'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, MessageSquare } from 'lucide-react';

interface LandingNavbarProps {
  siteName?: string;
  logoUrl?: string | null;
  links?: { label: string; href: string; isExternal?: boolean }[];
}

export function LandingNavbar({
  siteName = 'Replai',
  logoUrl,
  links,
}: LandingNavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks =
    links && links.length > 0
      ? links
      : [
          { href: '#features', label: 'Features' },
          { href: '#how-it-works', label: 'How it Works' },
          { href: '#integrations', label: 'Integrations' },
          { href: '#pricing', label: 'Pricing' },
        ];

  return (
    <nav
      className={`fixed top-0 z-50 w-full border-b transition-all duration-300 ${
        scrolled
          ? 'border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl'
          : 'border-slate-200/50 bg-white/70 backdrop-blur-md'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Brand */}
        <Link href="/" className="group flex items-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={siteName}
              className="h-16 rounded-lg object-contain"
            />
          ) : (
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {siteName}
            </span>
          )}
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden items-center gap-8 text-sm font-medium md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href.startsWith('#') ? `/${link.href}` : link.href}
              target={link.isExternal ? '_blank' : undefined}
              rel={link.isExternal ? 'noopener noreferrer' : undefined}
              className="text-slate-600 transition-colors duration-300 hover:text-[#25D366]"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/login"
            className="px-4 py-2 font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-[#25D366] px-5 py-2.5 font-bold text-white shadow-[0_0_15px_rgba(37,211,102,0.2)] transition-all duration-300 hover:bg-[#20b958] hover:shadow-[0_0_25px_rgba(37,211,102,0.4)] active:scale-95"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="text-slate-600 transition-colors hover:text-[#25D366] md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="space-y-4 border-t border-slate-200 bg-white/95 px-6 py-6 backdrop-blur-xl md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href.startsWith('#') ? `/${link.href}` : link.href}
              className="block py-2 font-medium text-slate-700 transition-colors hover:text-[#25D366]"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <Link
              href="/login"
              className="block rounded-xl border border-slate-200 py-2.5 text-center font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="block rounded-full bg-[#25D366] py-2.5 text-center font-bold text-white transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
