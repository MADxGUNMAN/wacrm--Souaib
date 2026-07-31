import type { LandingSection, LandingIntegration } from "@/types/super-admin";
import { Webhook, Braces, Network, MessageCircle, Bot, Zap, Sparkles, Link2 } from "lucide-react";

const simpleIcons: Record<string, string> = {
  "WhatsApp Business API": "https://cdn.simpleicons.org/whatsapp/25D366",
  "Supabase": "https://cdn.simpleicons.org/supabase/3ECF8E",
  "OpenAI": "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg",
  "Anthropic": "https://cdn.simpleicons.org/anthropic/D97757",
  "Google Gemini": "https://cdn.simpleicons.org/googlegemini/8E75B2",
};

const lucideIcons: Record<string, React.ElementType> = {
  Webhook, Braces, Network, MessageCircle, Bot, Zap, Sparkles, Link2
};
interface IntegrationsSectionProps {
  section: LandingSection | null;
  integrations: LandingIntegration[];
}

export function IntegrationsSection({ section, integrations }: IntegrationsSectionProps) {
  if (section && !section.is_visible) return null;

  const title = section?.title || "Plays well with your stack";
  const subtitle = section?.subtitle || "Built on open standards. Connect to the tools you already use.";
  const displayIntegrations = ((section?.extra_data as any)?.integrations as any[]) || integrations;

  if (displayIntegrations.length === 0) return null;

  const renderTitle = (text: string) => {
    const words = text.split(" ");
    if (words.length <= 1) return text;
    const lastWord = words.pop();
    return (
      <>
        {words.join(" ")} <span className="text-[#25D366]">{lastWord}</span>
      </>
    );
  };

  return (
    <section className="py-24 px-6 relative overflow-hidden" id="integrations">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-[#25D366]/15 blur-[100px] rounded-[100%] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{renderTitle(title)}</h2>
          <p className="text-lg text-slate-600">{subtitle}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {displayIntegrations.map((intg, i) => {
            const intgName = intg.title || intg.name;
            const iconRef = intg.icon_name || intg.icon_url || intgName;
            
            // Check if icon is a URL (starts with http) or exists in simpleIcons
            const isUrl = iconRef?.startsWith("http") || simpleIcons[iconRef];
            const imageUrl = iconRef?.startsWith("http") ? iconRef : simpleIcons[iconRef];
            
            const LucideIcon = lucideIcons[iconRef] || lucideIcons[intgName] || Link2;

            return (
              <div
                key={intg.id || i}
                className="group flex flex-col items-center text-center p-6 rounded-2xl bg-white border border-slate-200 transition-all duration-300 hover:-translate-y-1 hover:border-[#25D366]/20 hover:shadow-[0_8px_24px_-8px_rgba(37,211,102,0.15)] shadow-sm"
              >
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-[#25D366]/10 flex items-center justify-center mb-4 transition-colors">
                  {isUrl ? (
                    <img
                      src={imageUrl}
                      alt={intgName}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <LucideIcon className="w-7 h-7 text-slate-700 group-hover:text-[#25D366] transition-colors" />
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">{intgName}</h4>
              {intg.description && (
                <p className="text-xs text-slate-500">{intg.description}</p>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
