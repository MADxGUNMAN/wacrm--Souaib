import Link from 'next/link';
import type { LandingSection } from '@/types/super-admin';
import { HeroBackgroundVideo } from '@/components/landing/HeroBackgroundVideo';

interface HeroSectionProps {
  section: LandingSection | null;
  /**
   * Optional background video (site_settings.hero_video_url).
   *
   * Rendered UNDER everything here, and only on desktop - see
   * HeroBackgroundVideo. When absent the hero keeps its existing
   * background, which is also the fallback while the video loads.
   */
  backgroundVideoUrl?: string | null;
}

export function HeroSection({ section, backgroundVideoUrl }: HeroSectionProps) {
  const title = section?.title || 'Your AI-Powered WhatsApp CRM';
  const subtitle =
    section?.subtitle ||
    'Scale your customer communication, automate responses with intelligent AI, and manage sales pipelines entirely within WhatsApp.';
  const ctaPrimaryText = section?.cta_primary_text || 'Start Free Trial';
  const ctaPrimaryLink = section?.cta_primary_link || '/signup';
  const ctaSecondaryText = section?.cta_secondary_text || 'Watch Demo';
  const ctaSecondaryLink = section?.cta_secondary_link || '#demo';
  const badgeText =
    section?.extra_data?.badge_text !== undefined
      ? section.extra_data.badge_text
      : 'Official WhatsApp Business API';

  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-24 lg:pt-40 lg:pb-32">
      {backgroundVideoUrl ? (
        <HeroBackgroundVideo src={backgroundVideoUrl} />
      ) : null}

      {/* Ambient Glows */}
      <div className="pointer-events-none absolute top-0 left-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.15)_0%,rgba(255,255,255,0)_70%)]" />
      <div className="pointer-events-none absolute top-1/3 right-0 h-[600px] w-[600px] translate-x-1/3 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.1)_0%,rgba(255,255,255,0)_70%)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        {/* Text Content */}
        <div className="z-10 flex flex-col items-start text-left">
          {badgeText && (
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/80 px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="#25D366"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              {String(badgeText)}
            </div>
          )}

          <h1 className="mb-6 text-5xl leading-[1.1] font-black tracking-tight lg:text-7xl">
            <span className="bg-gradient-to-r from-slate-900 to-[#25D366] bg-clip-text text-transparent">
              {title}
            </span>
          </h1>

          <p className="mb-10 max-w-xl text-lg leading-relaxed text-slate-600">
            {subtitle}
          </p>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
            <Link
              href={ctaPrimaryLink}
              className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-8 py-4 font-bold text-white shadow-[0_0_20px_rgba(37,211,102,0.15)] transition-all duration-300 hover:bg-[#20b958] hover:shadow-[0_0_30px_rgba(37,211,102,0.3)] active:scale-95"
            >
              {ctaPrimaryText}
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
            {ctaSecondaryText && (
              <a
                href={ctaSecondaryLink || '#'}
                className="flex items-center justify-center gap-2 rounded-full border border-emerald-900/15 bg-white/80 px-8 py-4 font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-300 hover:bg-white active:scale-95"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth={2} />
                  <polygon fill="currentColor" points="10,8 16,12 10,16" />
                </svg>
                {ctaSecondaryText}
              </a>
            )}
          </div>

          <div className="mt-10 flex items-center gap-4 text-sm text-slate-500">
            <div className="flex -space-x-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&h=64"
                alt="Avatar 1"
                className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 object-cover"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=64&h=64"
                alt="Avatar 2"
                className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 object-cover"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=64&h=64"
                alt="Avatar 3"
                className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 object-cover"
              />
            </div>
            <p>{section?.body_text || 'Trusted by 10,000+ teams globally'}</p>
          </div>
        </div>

        {/* Dashboard Mockup or Custom Image */}
        <div
          className="relative z-10 w-full"
          style={{ animation: 'float 6s ease-in-out infinite' }}
        >
          {section?.image_url ? (
            <div className="relative overflow-hidden rounded-2xl border border-emerald-900/10 bg-white/80 shadow-2xl backdrop-blur-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={section.image_url}
                alt="Hero image"
                className="w-full object-cover"
              />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-emerald-900/10 bg-white/80 shadow-2xl backdrop-blur-xl">
              {/* Window Header */}
              <div className="flex items-center gap-2 border-b border-emerald-900/10 bg-[#eef7f2]/80 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <div className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <div className="mx-auto font-mono text-xs font-medium text-slate-400">
                  replai.app/inbox
                </div>
              </div>

              {/* Mock Dashboard */}
              <div className="relative aspect-[4/3] w-full bg-slate-50">
                <div className="absolute inset-0 flex">
                  {/* Sidebar mock */}
                  <div className="flex w-16 flex-col items-center gap-3 border-r border-white/5 bg-slate-950/80 py-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-9 w-9 rounded-lg ${i === 1 ? 'bg-[#25D366]/20' : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  {/* Chat list mock */}
                  <div className="w-1/3 space-y-2 border-r border-slate-200 p-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 rounded-lg p-2 ${i === 1 ? 'border border-[#25D366]/20 bg-[#25D366]/10' : 'bg-slate-100'}`}
                      >
                        <div className="h-8 w-8 shrink-0 rounded-full bg-slate-300" />
                        <div className="flex-1 space-y-1.5 overflow-hidden">
                          <div className="h-2.5 w-3/4 rounded bg-slate-300" />
                          <div className="h-2 w-full rounded bg-slate-200" />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Main area mock */}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-center gap-2 border-b border-slate-200 p-3">
                      <div className="h-7 w-7 rounded-full bg-slate-300" />
                      <div className="h-3 w-24 rounded bg-slate-200" />
                      <div className="ml-auto flex gap-1.5">
                        <div className="rounded bg-[#25D366]/15 px-2 py-1 text-[8px] font-bold text-[#25D366]">
                          AI Active
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 p-3">
                      {/* Chat bubbles */}
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-xl rounded-tl-sm bg-slate-200 p-2.5">
                          <div className="mb-1.5 h-2 w-full rounded bg-slate-300" />
                          <div className="h-2 w-3/4 rounded bg-slate-300" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="max-w-[70%] rounded-xl rounded-tr-sm border border-[#25D366]/20 bg-[#25D366]/15 p-2.5">
                          <div className="mb-1.5 h-2 w-full rounded bg-[#25D366]/20" />
                          <div className="h-2 w-4/5 rounded bg-[#25D366]/20" />
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-xl rounded-tl-sm bg-slate-200 p-2.5">
                          <div className="h-2 w-5/6 rounded bg-slate-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating UI Elements */}
                <div className="absolute top-1/4 -left-6 flex animate-pulse items-center gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-xl">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/20 text-[#25D366]">
                    <svg
                      className="h-5 w-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 7a1 1 0 112 0v4a1 1 0 11-2 0V7zm1 8a1 1 0 100-2 1 1 0 000 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      AI Agent
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      Reply drafted
                    </p>
                  </div>
                </div>
                <div
                  className="absolute -right-8 bottom-1/3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-xl"
                  style={{ animation: 'float 5s ease-in-out infinite reverse' }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                    <svg
                      className="h-5 w-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                      <path
                        fillRule="evenodd"
                        d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      New Deal
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      +$4,500 closed
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Seamless bottom fade transition into the page's sage background */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-gradient-to-t from-[#edf7f2] via-[#edf7f2]/60 to-transparent" />
    </section>
  );
}
