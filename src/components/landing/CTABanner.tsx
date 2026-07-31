import Link from "next/link";
import type { LandingSection } from "@/types/super-admin";

interface CTABannerProps {
  section: LandingSection | null;
}

export function CTABanner({ section }: CTABannerProps) {
  const title = section?.title || "Ready to transform your customer communication?";
  const subtitle = section?.subtitle || "Join thousands of teams closing more deals and resolving tickets faster on WhatsApp.";
  const ctaText = section?.cta_primary_text || "Start 14-Day Free Trial";
  const ctaLink = section?.cta_primary_link || "/signup";
  const ctaSecText = section?.cta_secondary_text || "Talk to Sales";
  const ctaSecLink = section?.cta_secondary_link || "/contact";
  const footerText = section?.body_text || "No credit card required. Setup in 2 minutes.";

  const renderTitle = (text: string) => {
    const words = text.split(" ");
    if (words.length <= 1) return text;
    // Handle the question mark for the last word if it exists
    const lastWord = words.pop();
    return (
      <>
        {words.join(" ")} <span className="text-[#25D366]">{lastWord}</span>
      </>
    );
  };

  return (
    <section className="py-24 px-6 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-white via-[#25D366]/5 to-white opacity-100" />

      <div className="max-w-4xl mx-auto bg-white backdrop-blur-sm rounded-3xl p-12 text-center relative z-10 border border-slate-200 shadow-xl">
        <h2 className="text-3xl md:text-5xl font-bold mb-6 text-slate-900">{renderTitle(title)}</h2>
        <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">{subtitle}</p>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href={ctaLink}
            className="bg-[#25D366] hover:bg-[#20b958] text-white font-bold px-8 py-4 rounded-full transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(37,211,102,0.15)]"
          >
            {ctaText}
          </Link>
          <Link
            href={ctaSecLink}
            className="bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold px-8 py-4 rounded-full transition-all duration-300 active:scale-95"
          >
            {ctaSecText}
          </Link>
        </div>

        {footerText && (
          <p className="mt-6 text-sm text-slate-500">
            {footerText}
          </p>
        )}
      </div>
    </section>
  );
}
