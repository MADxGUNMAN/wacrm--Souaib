import Link from "next/link";
import type { LandingSection } from "@/types/super-admin";

interface HeroSectionProps {
  section: LandingSection | null;
}

export function HeroSection({ section }: HeroSectionProps) {
  const title = section?.title || "Your AI-Powered WhatsApp CRM";
  const subtitle =
    section?.subtitle ||
    "Scale your customer communication, automate responses with intelligent AI, and manage sales pipelines entirely within WhatsApp.";
  const ctaPrimaryText = section?.cta_primary_text || "Start Free Trial";
  const ctaPrimaryLink = section?.cta_primary_link || "/signup";
  const ctaSecondaryText = section?.cta_secondary_text || "Watch Demo";
  const ctaSecondaryLink = section?.cta_secondary_link || "#demo";
  const badgeText = section?.extra_data?.badge_text !== undefined 
    ? section.extra_data.badge_text 
    : "Official WhatsApp Business API";

  return (
    <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden px-6">
      {/* Ambient Glows */}
      <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(37,211,102,0.15)_0%,rgba(255,255,255,0)_70%)] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 right-0 translate-x-1/3 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(37,211,102,0.1)_0%,rgba(255,255,255,0)_70%)] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        {/* Text Content */}
        <div className="z-10 flex flex-col items-start text-left">
          {badgeText && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-slate-200 mb-6 text-sm font-medium text-slate-700 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              {String(badgeText)}
            </div>
          )}

          <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-6">
            <span className="bg-gradient-to-r from-slate-900 to-[#25D366] bg-clip-text text-transparent">
              {title}
            </span>
          </h1>

          <p className="text-lg text-slate-600 mb-10 max-w-xl leading-relaxed">
            {subtitle}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link
              href={ctaPrimaryLink}
              className="bg-[#25D366] hover:bg-[#20b958] text-white font-bold px-8 py-4 rounded-full transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(37,211,102,0.15)] hover:shadow-[0_0_30px_rgba(37,211,102,0.3)] flex items-center justify-center gap-2"
            >
              {ctaPrimaryText}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </Link>
            {ctaSecondaryText && (
              <a
                href={ctaSecondaryLink || "#"}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold px-8 py-4 rounded-full transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><polygon fill="currentColor" points="10,8 16,12 10,16" /></svg>
                {ctaSecondaryText}
              </a>
            )}
          </div>

          <div className="mt-10 flex items-center gap-4 text-sm text-slate-500">
            <div className="flex -space-x-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&h=64" alt="Avatar 1" className="w-8 h-8 rounded-full border-2 border-white object-cover bg-slate-200" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=64&h=64" alt="Avatar 2" className="w-8 h-8 rounded-full border-2 border-white object-cover bg-slate-200" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=64&h=64" alt="Avatar 3" className="w-8 h-8 rounded-full border-2 border-white object-cover bg-slate-200" />
            </div>
            <p>{section?.body_text || "Trusted by 10,000+ teams globally"}</p>
          </div>
        </div>

        {/* Dashboard Mockup or Custom Image */}
        <div className="relative z-10 w-full" style={{ animation: "float 6s ease-in-out infinite" }}>
          {section?.image_url ? (
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={section.image_url} alt="Hero image" className="w-full object-cover" />
            </div>
          ) : (
            <div className="bg-white/60 backdrop-blur-xl rounded-2xl overflow-hidden shadow-xl border border-slate-200 relative">
              {/* Window Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="mx-auto text-xs font-medium text-slate-400 font-mono">
                  replai.app/inbox
                </div>
              </div>

              {/* Mock Dashboard */}
              <div className="relative w-full aspect-[4/3] bg-slate-50">
                <div className="absolute inset-0 flex">
                  {/* Sidebar mock */}
                  <div className="w-16 bg-slate-950/80 border-r border-white/5 flex flex-col items-center py-4 gap-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={`w-9 h-9 rounded-lg ${i === 1 ? 'bg-[#25D366]/20' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                  {/* Chat list mock */}
                  <div className="w-1/3 border-r border-slate-200 p-3 space-y-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className={`flex gap-2 items-center p-2 rounded-lg ${i === 1 ? 'bg-[#25D366]/10 border border-[#25D366]/20' : 'bg-slate-100'}`}>
                        <div className="w-8 h-8 rounded-full bg-slate-300 shrink-0" />
                        <div className="flex-1 space-y-1.5 overflow-hidden">
                          <div className="h-2.5 bg-slate-300 rounded w-3/4" />
                          <div className="h-2 bg-slate-200 rounded w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Main area mock */}
                  <div className="flex-1 flex flex-col">
                    <div className="border-b border-slate-200 p-3 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-300" />
                      <div className="h-3 bg-slate-200 rounded w-24" />
                      <div className="ml-auto flex gap-1.5">
                        <div className="px-2 py-1 rounded bg-[#25D366]/15 text-[8px] text-[#25D366] font-bold">AI Active</div>
                      </div>
                    </div>
                    <div className="flex-1 p-3 space-y-3">
                      {/* Chat bubbles */}
                      <div className="flex justify-start">
                        <div className="bg-slate-200 rounded-xl rounded-tl-sm p-2.5 max-w-[70%]">
                          <div className="h-2 bg-slate-300 rounded w-full mb-1.5" />
                          <div className="h-2 bg-slate-300 rounded w-3/4" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="bg-[#25D366]/15 border border-[#25D366]/20 rounded-xl rounded-tr-sm p-2.5 max-w-[70%]">
                          <div className="h-2 bg-[#25D366]/20 rounded w-full mb-1.5" />
                          <div className="h-2 bg-[#25D366]/20 rounded w-4/5" />
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="bg-slate-200 rounded-xl rounded-tl-sm p-2.5 max-w-[70%]">
                          <div className="h-2 bg-slate-300 rounded w-5/6" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating UI Elements */}
                <div className="absolute -left-6 top-1/4 bg-white/90 backdrop-blur-xl p-3 rounded-xl shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[#25D366]">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 7a1 1 0 112 0v4a1 1 0 11-2 0V7zm1 8a1 1 0 100-2 1 1 0 000 2z" /></svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">AI Agent</p>
                    <p className="text-sm text-slate-900 font-semibold">Reply drafted</p>
                  </div>
                </div>
                <div className="absolute -right-8 bottom-1/3 bg-white/90 backdrop-blur-xl p-3 rounded-xl shadow-lg border border-slate-200 flex items-center gap-3" style={{ animation: "float 5s ease-in-out infinite reverse" }}>
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" /></svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">New Deal</p>
                    <p className="text-sm text-slate-900 font-semibold">+$4,500 closed</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
