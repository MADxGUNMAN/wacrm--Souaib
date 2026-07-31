"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, MessageSquare } from "lucide-react";

interface LandingNavbarProps {
  siteName?: string;
  logoUrl?: string | null;
  links?: { label: string; href: string; isExternal?: boolean }[];
}

export function LandingNavbar({ siteName = "Replai", logoUrl, links }: LandingNavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = links && links.length > 0 ? links : [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it Works" },
    { href: "#integrations", label: "Integrations" },
    { href: "#pricing", label: "Pricing" },
  ];

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 border-b ${scrolled
        ? "bg-white/95 backdrop-blur-xl border-slate-200 shadow-sm"
        : "bg-white/70 backdrop-blur-md border-slate-200/50"
        }`}
    >
      <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
        {/* Brand */}
        <Link href="/" className="flex items-center group">
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} className="h-16 object-contain rounded-lg" />
          ) : (
            <img src="/Replai-logo.png" alt={siteName} className="h-16 object-contain" />
          )}
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.isExternal ? "_blank" : undefined}
              rel={link.isExternal ? "noopener noreferrer" : undefined}
              className="text-slate-600 hover:text-[#25D366] transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-slate-600 hover:text-slate-900 font-medium transition-colors px-4 py-2"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="bg-[#25D366] hover:bg-[#20b958] text-white font-bold px-5 py-2.5 rounded-full transition-all duration-300 active:scale-95 shadow-[0_0_15px_rgba(37,211,102,0.2)] hover:shadow-[0_0_25px_rgba(37,211,102,0.4)]"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-slate-600 hover:text-[#25D366] transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200 px-6 py-6 space-y-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="block text-slate-700 hover:text-[#25D366] font-medium py-2 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <Link
              href="/login"
              className="block text-center text-slate-600 hover:text-slate-900 font-medium py-2.5 rounded-xl border border-slate-200 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="block text-center bg-[#25D366] text-white font-bold py-2.5 rounded-full transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
