import { Metadata } from 'next';
import Script from 'next/script';
import {
  getSiteSettings,
  getLandingSections,
  getLandingFeatures,
  getLandingPricing,
  getLandingTestimonials,
  getLandingIntegrations,
  getLegalPagesList,
  getLandingFaqs,
} from '@/lib/cms/queries';
import { getPlansBundle } from '@/lib/subscription/queries';

import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { AIHighlightSection } from '@/components/landing/AIHighlightSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import { IntegrationsSection } from '@/components/landing/IntegrationsSection';
import { CTABanner } from '@/components/landing/CTABanner';
import { FAQSection } from '@/components/landing/FAQSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { NewsletterToast } from '@/components/landing/NewsletterToast';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  const isNoIndex = settings?.no_index ?? false;

  const metadata: Metadata = {
    title:
      settings?.meta_title ||
      `${settings?.site_name || 'Replai'} | ${settings?.tagline || 'AI-Powered WhatsApp CRM'}`,
    description:
      settings?.meta_description ||
      settings?.site_description ||
      'Scale your customer communication with AI-powered WhatsApp CRM.',
    openGraph: {
      title:
        settings?.meta_title ||
        `${settings?.site_name || 'Replai'} | AI-Powered WhatsApp CRM`,
      description:
        settings?.meta_description ||
        'Scale your customer communication with AI-powered WhatsApp CRM.',
      images: settings?.og_image_url ? [{ url: settings.og_image_url }] : [],
    },
    robots: {
      index: !isNoIndex,
      follow: !isNoIndex,
    },
  };

  if (settings?.canonical_url) {
    metadata.alternates = {
      canonical: settings.canonical_url,
    };
  }

  return metadata;
}

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const [
    settings,
    sections,
    features,
    _pricing,
    testimonials,
    integrations,
    legalPages,
    faqs,
    bundle,
  ] = await Promise.all([
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
    <div className="relative min-h-screen overflow-x-clip bg-[#edf7f2] text-slate-900 antialiased selection:bg-[#25D366]/20 selection:text-emerald-950">
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
            @keyframes ambient-drift {
              0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.45; }
              50% { transform: translate(30px, -20px) scale(1.08); opacity: 0.65; }
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
            .animate-ambient {
              animation: ambient-drift 14s ease-in-out infinite;
            }
          `,
        }}
      />

      {/* Ambient flowing ribbon glow orbs carrying the hero video energy down the page */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="animate-ambient absolute top-1/4 -left-48 h-[650px] w-[650px] rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.12)_0%,rgba(18,140,126,0.06)_40%,transparent_70%)] blur-3xl" />
        <div
          className="animate-ambient absolute top-2/3 -right-48 h-[750px] w-[750px] rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.14)_0%,rgba(164,216,188,0.12)_45%,transparent_75%)] blur-3xl"
          style={{ animationDelay: '-7s' }}
        />
        <div
          className="animate-ambient absolute top-[85%] left-1/3 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.1)_0%,transparent_70%)] blur-2xl"
          style={{ animationDelay: '-3s' }}
        />
      </div>

      {/* The only page that gets a transparent bar: it is the only one whose
          content starts with a full-bleed hero behind the header. */}
      <LandingNavbar
        siteName={settings?.site_name}
        logoUrl={settings?.logo_url}
        links={settings?.header_links}
        transparentUntilScrolled
      />

      <main className="relative z-10">
        {/* Hero */}
        <HeroSection
          section={sectionMap.get('hero') || null}
          backgroundVideoUrl={settings?.hero_video_url ?? null}
        />

        {/* Social Proof Bar */}
        {sectionMap.get('social_proof')?.is_visible !== false && (
          <section className="relative overflow-hidden border-y border-emerald-900/10 bg-[#e4f1e8]/75 py-12 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-6">
              <p className="mb-8 text-center text-sm font-semibold tracking-widest text-emerald-900/60 uppercase">
                {sectionMap.get('social_proof')?.title ||
                  'Trusted by businesses worldwide'}
              </p>

              <div className="mx-auto w-full overflow-hidden rounded-2xl border border-emerald-900/10 bg-white/75 shadow-sm backdrop-blur-md">
                <div className="group relative flex overflow-hidden">
                  <div className="animate-marquee flex w-max items-center">
                    {/* Render the images twice for smooth infinite loop */}
                    {[
                      ...(sectionMap.get('social_proof')?.images || []),
                      ...(sectionMap.get('social_proof')?.images || []),
                    ].map((imgUrl, i) =>
                      imgUrl ? (
                        <div
                          key={i}
                          className="flex h-24 w-48 shrink-0 items-center justify-center border-r border-emerald-900/10 bg-white/60 px-8 lg:w-56"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imgUrl}
                            alt="Partner Logo"
                            className="h-full w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="flex h-24 w-48 shrink-0 items-center justify-center border-r border-emerald-900/10 bg-white/60 lg:w-56"
                        >
                          <div className="h-8 w-24 rounded bg-emerald-100/50" />
                        </div>
                      )
                    )}

                    {/* Fallback dummy placeholders if no images exist */}
                    {(!sectionMap.get('social_proof')?.images ||
                      sectionMap.get('social_proof')?.images.length === 0) &&
                      [1, 2, 3, 4, 5, 1, 2, 3, 4, 5].map((w, i) => (
                        <div
                          key={i}
                          className="flex h-24 w-48 shrink-0 items-center justify-center border-r border-emerald-900/10 bg-white/60 lg:w-56"
                        >
                          <div className="h-8 w-24 rounded bg-emerald-100/50" />
                        </div>
                      ))}
                  </div>
                </div>

                {sectionMap.get('social_proof')?.images_secondary &&
                  sectionMap.get('social_proof')!.images_secondary!.length >
                    0 && (
                    <div className="group relative flex overflow-hidden border-t border-emerald-900/10">
                      <div className="animate-marquee-reverse flex w-max items-center">
                        {/* Render the images twice for smooth infinite loop */}
                        {[
                          ...(sectionMap.get('social_proof')
                            ?.images_secondary || []),
                          ...(sectionMap.get('social_proof')
                            ?.images_secondary || []),
                        ].map((imgUrl, i) =>
                          imgUrl ? (
                            <div
                              key={i}
                              className="flex h-24 w-48 shrink-0 items-center justify-center border-r border-emerald-900/10 bg-white/60 px-8 lg:w-56"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imgUrl}
                                alt="Partner Logo"
                                className="h-full w-full object-contain"
                              />
                            </div>
                          ) : (
                            <div
                              key={i}
                              className="flex h-24 w-48 shrink-0 items-center justify-center border-r border-emerald-900/10 bg-white/60 lg:w-56"
                            >
                              <div className="h-8 w-24 rounded bg-emerald-100/50" />
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </section>
        )}

        {/* Features */}
        <FeaturesSection
          section={sectionMap.get('features') || null}
          features={features}
        />

        {/* How it Works */}
        {sectionMap.get('how_it_works')?.is_visible !== false && (
          <HowItWorksSection section={sectionMap.get('how_it_works') || null} />
        )}

        {/* AI Highlight */}
        {sectionMap.get('ai_highlight')?.is_visible !== false && (
          <AIHighlightSection
            section={sectionMap.get('ai_highlight') || null}
          />
        )}

        {/* Integrations */}
        <IntegrationsSection
          section={sectionMap.get('integrations') || null}
          integrations={integrations}
        />

        {/* Pricing */}
        <PricingSection
          section={sectionMap.get('pricing') || null}
          bundle={bundle}
        />

        {/* Testimonials */}
        <TestimonialsSection
          section={sectionMap.get('testimonials') || null}
          testimonials={testimonials}
        />

        {/* FAQ */}
        <FAQSection section={sectionMap.get('faq') || null} faqs={faqs} />

        {/* CTA Banner */}
        <CTABanner section={sectionMap.get('cta_banner') || null} />
      </main>

      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
