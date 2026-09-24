import type { LandingSection, LandingIntegration } from '@/types/super-admin';
import {
  Webhook,
  Braces,
  Network,
  MessageCircle,
  Bot,
  Zap,
  Sparkles,
  Link2,
} from 'lucide-react';

const simpleIcons: Record<string, string> = {
  'WhatsApp Business API': 'https://cdn.simpleicons.org/whatsapp/25D366',
  Supabase: 'https://cdn.simpleicons.org/supabase/3ECF8E',
  OpenAI:
    'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg',
  Anthropic: 'https://cdn.simpleicons.org/anthropic/D97757',
  'Google Gemini': 'https://cdn.simpleicons.org/googlegemini/8E75B2',
};

const lucideIcons: Record<string, React.ElementType> = {
  Webhook,
  Braces,
  Network,
  MessageCircle,
  Bot,
  Zap,
  Sparkles,
  Link2,
};
interface IntegrationsSectionProps {
  section: LandingSection | null;
  integrations: LandingIntegration[];
}

export function IntegrationsSection({
  section,
  integrations,
}: IntegrationsSectionProps) {
  if (section && !section.is_visible) return null;

  const title = section?.title || 'Plays well with your stack';
  const subtitle =
    section?.subtitle ||
    'Built on open standards. Connect to the tools you already use.';
  const displayIntegrations =
    ((section?.extra_data as Record<string, unknown>)
      ?.integrations as LandingIntegration[]) || integrations;

  if (displayIntegrations.length === 0) return null;

  const renderTitle = (text: string) => {
    const words = text.split(' ');
    if (words.length <= 1) return text;
    const lastWord = words.pop();
    return (
      <>
        {words.join(' ')} <span className="text-[#25D366]">{lastWord}</span>
      </>
    );
  };

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#edf7f2] via-[#e8f4ec]/70 to-[#edf7f2] px-6 py-24"
      id="integrations"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[#25D366]/15 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-5xl">
            {renderTitle(title)}
          </h2>
          <p className="text-lg text-slate-600">{subtitle}</p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
          {displayIntegrations.map((intg, i) => {
            const item = intg as unknown as Record<
              string,
              string | null | undefined
            >;
            const intgName = item.title || item.name || '';
            const iconRef = item.icon_name || item.icon_url || intgName;

            // Check if icon is a URL (starts with http) or exists in simpleIcons
            const isUrl = iconRef?.startsWith('http') || simpleIcons[iconRef];
            const imageUrl = iconRef?.startsWith('http')
              ? iconRef
              : simpleIcons[iconRef];

            const LucideIcon =
              lucideIcons[iconRef] || lucideIcons[intgName] || Link2;

            return (
              <div
                key={intg.id || i}
                className="group flex flex-col items-center rounded-2xl border border-emerald-900/10 bg-white/80 p-6 text-center shadow-[0_4px_20px_-4px_rgba(18,140,126,0.05)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#25D366]/40 hover:shadow-[0_8px_24px_-8px_rgba(37,211,102,0.2)]"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/80 transition-colors group-hover:bg-[#25D366]/10">
                  {isUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={imageUrl}
                      alt={intgName}
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <LucideIcon className="h-7 w-7 text-slate-700 transition-colors group-hover:text-[#25D366]" />
                  )}
                </div>
                <h4 className="mb-1 text-sm font-semibold text-slate-900">
                  {intgName}
                </h4>
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
