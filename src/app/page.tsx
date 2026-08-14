import { Metadata } from "next";
import Script from "next/script";
import {
  getSiteSettings,
  getLandingSections,
  getLandingFeatures,
  getLandingPricing,
  getLandingTestimonials,
  getLandingIntegrations,
  getLegalPagesList,
  getLandingFaqs,
} from "@/lib/cms/queries";
import { getPlansBundle } from "@/lib/subscription/queries";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { AIHighlightSection } from "@/components/landing/AIHighlightSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { IntegrationsSection } from "@/components/landing/IntegrationsSection";
import { CTABanner } from "@/components/landing/CTABanner";
import { FAQSection } from "@/components/landing/FAQSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { NewsletterToast } from "@/components/landing/NewsletterToast";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  
  const metadata: Metadata = {
    title: settings?.meta_title || `${settings?.site_name || "Replai"} | ${settings?.tagline || "AI-Powered WhatsApp CRM"}`,
    description: settings?.meta_description || settings?.site_description || "Scale your customer communication with AI-powered WhatsApp CRM.",
    openGraph: {
      title: settings?.meta_title || `${settings?.site_name || "Replai"} | AI-Powered WhatsApp CRM`,
      description: settings?.meta_description || "Scale your customer communication with AI-powered WhatsApp CRM.",
      images: settings?.og_image_url ? [{ url: settings.og_image_url }] : [],
    },
  };

  if (settings?.no_index) {
    metadata.robots = {
      index: false,
      follow: false,
    };
  }

  if (settings?.canonical_url) {
    metadata.alternates = {
      canonical: settings.canonical_url,
    };
  }

  return metadata;
}

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [settings, sections, features, pricing, testimonials, integrations, legalPages, faqs, bundle] =
    await Promise.all([
      getSiteSettings(),
      getLandingSections(),
      getLandingFeatures(),
      getLandingPricing(),
      getLandingTestimonials(),
      getLandingIntegrations(),
      getLegalPagesList(),
      getLandingFaqs(),
      getPlansBundle(),
    ]);

  // Map sections by key for easy lookup
  const sectionMap = new Map(sections.map((s) => [s.section_key, s]));

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased overflow-x-clip">
      <Suspense fallback={null}>
        <NewsletterToast />
      </Suspense>
      {settings?.json_ld_schema && (
        <Script
          id="json-ld-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: settings.json_ld_schema }}
        />
      )}
      {/* Global CSS for animations */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-20px); }
            }
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            @keyframes marquee-reverse {
              0% { transform: translateX(-50%); }
              100% { transform: translateX(0); }
            }
            .animate-marquee {
              animation: marquee 30s linear infinite;
            }
            .animate-marquee:hover {
              animation-play-state: paused;
            }
            .animate-marquee-reverse {
              animation: marquee-reverse 30s linear infinite;
            }
            .animate-marquee-reverse:hover {
              animation-play-state: paused;
            }
          `,
        }}
      />

      <LandingNavbar
        siteName={settings?.site_name}
        logoUrl={settings?.logo_url}
        links={settings?.header_links}
      />

      <main>
        {/* Hero */}
        <HeroSection section={sectionMap.get("hero") || null} />

        {/* Social Proof Bar */}
        {sectionMap.get("social_proof")?.is_visible !== false && (
          <section className="py-12 border-y border-slate-100 bg-slate-50 overflow-hidden">
            <div className="max-w-7xl mx-auto px-6">
              <p className="text-center text-sm font-medium text-slate-500 mb-8 uppercase tracking-widest">
                {sectionMap.get("social_proof")?.title || "Trusted by businesses worldwide"}
              </p>
              
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mx-auto w-full">
                <div className="relative flex overflow-hidden group">
                  <div className="flex w-max animate-marquee items-center">
                    {/* Render the images twice for smooth infinite loop */}
                    {[...(sectionMap.get("social_proof")?.images || []), ...(sectionMap.get("social_proof")?.images || [])].map((imgUrl, i) => (
                      imgUrl ? (
                        <div key={i} className="flex items-center justify-center w-48 lg:w-56 h-24 border-r border-slate-200 shrink-0 px-8 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imgUrl} alt="Partner Logo" className="w-full h-full object-contain" />
                        </div>
                      ) : (
                         <div key={i} className="flex items-center justify-center w-48 lg:w-56 h-24 border-r border-slate-200 shrink-0 bg-white">
                           <div className="h-8 bg-slate-100 rounded w-24" />
                         </div>
                      )
                    ))}
                    
                    {/* Fallback dummy placeholders if no images exist */}
                    {(!sectionMap.get("social_proof")?.images || sectionMap.get("social_proof")?.images.length === 0) && (
                       [1,2,3,4,5,1,2,3,4,5].map((w, i) => (
                         <div key={i} className="flex items-center justify-center w-48 lg:w-56 h-24 border-r border-slate-200 shrink-0 bg-white">
                           <div className="h-8 bg-slate-100 rounded w-24" />
                         </div>
                       ))
                    )}
                  </div>
                </div>

                {sectionMap.get("social_proof")?.images_secondary && sectionMap.get("social_proof")!.images_secondary!.length > 0 && (
                  <div className="relative flex overflow-hidden group border-t border-slate-200">
                    <div className="flex w-max animate-marquee-reverse items-center">
                      {/* Render the images twice for smooth infinite loop */}
                      {[...(sectionMap.get("social_proof")?.images_secondary || []), ...(sectionMap.get("social_proof")?.images_secondary || [])].map((imgUrl, i) => (
                        imgUrl ? (
                          <div key={i} className="flex items-center justify-center w-48 lg:w-56 h-24 border-r border-slate-200 shrink-0 px-8 bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imgUrl} alt="Partner Logo" className="w-full h-full object-contain" />
                          </div>
                        ) : (
                          <div key={i} className="flex items-center justify-center w-48 lg:w-56 h-24 border-r border-slate-200 shrink-0 bg-white">
                            <div className="h-8 bg-slate-100 rounded w-24" />
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Features */}
        <FeaturesSection
          section={sectionMap.get("features") || null}
          features={features}
        />

        {/* How it Works */}
        {sectionMap.get("how_it_works")?.is_visible !== false && (
          <HowItWorksSection section={sectionMap.get("how_it_works") || null} />
        )}

        {/* AI Highlight */}
        {sectionMap.get("ai_highlight")?.is_visible !== false && (
          <AIHighlightSection section={sectionMap.get("ai_highlight") || null} />
        )}

        {/* Integrations */}
        <IntegrationsSection
          section={sectionMap.get("integrations") || null}
          integrations={integrations}
        />

        {/* Pricing */}
        <PricingSection
          section={sectionMap.get("pricing") || null}
          bundle={bundle}
        />

        {/* Testimonials */}
        <TestimonialsSection
          section={sectionMap.get("testimonials") || null}
          testimonials={testimonials}
        />

        {/* FAQ */}
        <FAQSection 
          section={sectionMap.get("faq") || null}
          faqs={faqs}
        />

        {/* CTA Banner */}
        <CTABanner section={sectionMap.get("cta_banner") || null} />
      </main>

      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
