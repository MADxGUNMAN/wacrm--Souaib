import Link from "next/link";
import { Check } from "lucide-react";
import type { LandingSection, LandingPricingTier } from "@/types/super-admin";

interface PricingSectionProps {
  section: LandingSection | null;
  tiers: LandingPricingTier[];
}

export function PricingSection({ section, tiers }: PricingSectionProps) {
  const title = section?.title || "Simple, transparent pricing";
  const subtitle =
    section?.subtitle || "Choose the plan that fits your team's growth stage.";
  const displayTiers = ((section?.extra_data as any)?.tiers as any[]) || tiers;

  return (
    <section className="py-24 px-6 relative overflow-hidden bg-slate-50" id="pricing">
      {/* Background Glow */}
      <div className="absolute bottom-0 left-1/4 -translate-x-1/2 translate-y-1/3 w-[600px] h-[600px] bg-[#25D366]/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            {title.split("pricing").length > 1 ? (
              <>
                {title.split("pricing")[0]}
                <span className="text-[#25D366]">pricing</span>
                {title.split("pricing")[1]}
              </>
            ) : (
              title
            )}
          </h2>
          <p className="text-lg text-slate-600">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center max-w-5xl mx-auto">
          {displayTiers.map((tier, index) => {
            let features: string[] = [];
            if (typeof tier.features === "string") {
              try {
                features = JSON.parse(tier.features);
              } catch (e) {
                // If it's not JSON, assume it's newline separated
                features = tier.features.split('\n').filter((f: string) => f.trim().length > 0);
              }
            } else {
              features = tier.features || [];
            }

            return (
              <div
                key={tier.id || index}
                className={`relative p-8 rounded-2xl transition-all duration-300 ${
                  tier.is_highlighted
                    ? "border-2 border-[#25D366] transform md:scale-105 shadow-[0_0_40px_rgba(37,211,102,0.15)] z-10 bg-white backdrop-blur-sm"
                    : "bg-slate-100 backdrop-blur-sm border border-slate-200"
                }`}
              >
                {tier.is_highlighted && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#25D366] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    {tier.highlight_label || "Most Popular"}
                  </div>
                )}

                <h3 className="text-xl font-bold text-slate-900 mb-2">{tier.name}</h3>
                <p className="text-slate-500 text-sm mb-6 h-10">
                  {tier.description || (tier.is_highlighted
                    ? "Advanced CRM and AI tools for scaling teams."
                    : tier.name === "Enterprise"
                    ? "Custom solutions for large organizations."
                    : "Essential features for small teams getting started.")}
                </p>

                <div className="mb-6">
                  <span className="text-4xl font-black text-slate-900">
                    {tier.price_monthly}
                  </span>
                  {tier.price_subtitle && (
                    <span className="text-slate-500 ml-1">
                      /{tier.price_subtitle}
                    </span>
                  )}
                </div>

                <Link
                  href={tier.cta_link || "/signup"}
                  className={`block w-full py-3 px-4 rounded-xl font-semibold text-center transition-colors mb-8 ${
                    tier.is_highlighted
                      ? "bg-[#25D366] text-white hover:bg-[#20b958] shadow-lg font-bold"
                      : "border border-slate-200 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {tier.cta_text || "Start Free Trial"}
                </Link>

                <ul className="space-y-4 text-sm">
                  {features.map((f, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-3 ${
                        tier.is_highlighted ? "text-slate-800" : "text-slate-600"
                      }`}
                    >
                      <Check className="h-4 w-4 text-[#25D366] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
