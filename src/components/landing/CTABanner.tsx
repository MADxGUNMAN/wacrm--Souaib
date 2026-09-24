import Link from 'next/link';
import type { LandingSection } from '@/types/super-admin';

interface CTABannerProps {
  section: LandingSection | null;
}

export function CTABanner({ section }: CTABannerProps) {
  const title =
    section?.title || 'Ready to transform your customer communication?';
  const subtitle =
    section?.subtitle ||
    'Join thousands of teams closing more deals and resolving tickets faster on WhatsApp.';
  const ctaText = section?.cta_primary_text || 'Start 14-Day Free Trial';
  const ctaLink = section?.cta_primary_link || '/signup';
  const ctaSecText = section?.cta_secondary_text || 'Talk to Sales';
  const ctaSecLink = section?.cta_secondary_link || '/contact';
  const footerText =
    section?.body_text || 'No credit card required. Setup in 2 minutes.';

  const renderTitle = (text: string) => {
    const words = text.split(' ');
    if (words.length <= 1) return text;
    // Handle the question mark for the last word if it exists
    const lastWord = words.pop();
    return (
      <>
        {words.join(' ')} <span className="text-[#25D366]">{lastWord}</span>
      </>
    );
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#edf7f2] via-[#e4f1e8] to-[#edf7f2] px-6 py-24">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#25D366]/10 to-transparent opacity-100" />

      <div className="relative z-10 mx-auto max-w-4xl rounded-3xl border border-emerald-500/20 bg-white/90 p-12 text-center shadow-2xl backdrop-blur-md">
        <h2 className="mb-6 text-3xl font-bold text-slate-900 md:text-5xl">
          {renderTitle(title)}
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-600">
          {subtitle}
        </p>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href={ctaLink}
            className="rounded-full bg-[#25D366] px-8 py-4 font-bold text-white shadow-[0_0_20px_rgba(37,211,102,0.15)] transition-all duration-300 hover:bg-[#20b958] active:scale-95"
          >
            {ctaText}
          </Link>
          <Link
            href={ctaSecLink}
            className="rounded-full border border-emerald-900/15 bg-white/80 px-8 py-4 font-semibold text-slate-700 shadow-sm transition-all duration-300 hover:bg-white active:scale-95"
          >
            {ctaSecText}
          </Link>
        </div>

        {footerText && (
          <p className="mt-6 text-sm text-slate-500">{footerText}</p>
        )}
      </div>
    </section>
  );
}
