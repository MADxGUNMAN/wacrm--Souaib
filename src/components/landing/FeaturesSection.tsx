import {
  MessageSquare,
  Bot,
  Workflow,
  Send,
  Kanban,
  Users,
  Sparkles,
  Shield,
  Globe,
  Zap,
  BarChart3,
  FileText,
  Megaphone,
  Layers,
  Inbox,
  Tags,
  Coins,
  GitBranch,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import type { LandingSection, LandingFeature } from '@/types/super-admin';

const iconMap: Record<string, React.ElementType> = {
  MessageSquare,
  Bot,
  Workflow,
  Send,
  Kanban,
  Users,
  Sparkles,
  Shield,
  Globe,
  Zap,
  BarChart3,
  FileText,
  Megaphone,
  Layers,
  Inbox,
  Tags,
  Coins,
  GitBranch,
  KeyRound,
  CheckCircle2,
  // Fallback names from seed
  inbox: MessageSquare,
  auto_awesome: Sparkles,
  account_tree: Workflow,
  campaign: Send,
  view_kanban: Kanban,
  contact_page: Users,
};

const cardAccents = [
  {
    iconBox: 'bg-emerald-500/10 border-emerald-500/20 text-[#128C7E]',
    hoverGlow: 'from-[#25D366]/15',
    hoverBorder: 'group-hover:border-emerald-500/40',
  },
  {
    iconBox: 'bg-purple-500/10 border-purple-500/20 text-purple-600',
    hoverGlow: 'from-purple-500/15',
    hoverBorder: 'group-hover:border-purple-500/40',
  },
  {
    iconBox: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
    hoverGlow: 'from-blue-500/15',
    hoverBorder: 'group-hover:border-blue-500/40',
  },
  {
    iconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
    hoverGlow: 'from-amber-500/15',
    hoverBorder: 'group-hover:border-amber-500/40',
  },
  {
    iconBox: 'bg-teal-500/10 border-teal-500/20 text-teal-600',
    hoverGlow: 'from-teal-500/15',
    hoverBorder: 'group-hover:border-teal-500/40',
  },
  {
    iconBox: 'bg-rose-500/10 border-rose-500/20 text-rose-600',
    hoverGlow: 'from-rose-500/15',
    hoverBorder: 'group-hover:border-rose-500/40',
  },
];

interface FeaturesSectionProps {
  section: LandingSection | null;
  features: LandingFeature[];
}

export function FeaturesSection({ section, features }: FeaturesSectionProps) {
  const title = section?.title || 'Everything you need to scale WhatsApp';
  const subtitle =
    section?.subtitle ||
    'Replace chaos with clarity. Replai brings enterprise-grade CRM capabilities directly to your most vital communication channel.';

  const displayFeatures =
    ((section?.extra_data as Record<string, unknown>)
      ?.features as LandingFeature[]) || features;

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#edf7f2] via-[#e8f4ec]/80 to-[#edf7f2] px-6 py-24 lg:py-32"
      id="features"
    >
      {/* Subtle Ambient Background Gradients */}
      <div className="pointer-events-none absolute top-1/3 right-0 h-[600px] w-[600px] translate-x-1/3 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.1)_0%,rgba(255,255,255,0)_70%)]" />
      <div className="pointer-events-none absolute bottom-10 left-0 h-[500px] w-[500px] -translate-x-1/3 rounded-full bg-[radial-gradient(circle,rgba(18,140,126,0.08)_0%,rgba(255,255,255,0)_70%)]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
          <h2 className="text-3xl leading-[1.15] font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            {title.includes('WhatsApp') ? (
              <>
                {title.split('WhatsApp')[0]}
                <span className="bg-gradient-to-r from-[#25D366] to-[#128C7E] bg-clip-text text-transparent">
                  WhatsApp
                </span>
                {title.split('WhatsApp')[1]}
              </>
            ) : (
              title
            )}
          </h2>
          {subtitle && (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {subtitle}
            </p>
          )}
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {displayFeatures.map((feature, i) => {
            const accent = cardAccents[i % cardAccents.length];
            const IconComp = iconMap[feature.icon_name] || Sparkles;

            return (
              <div
                key={feature.id || i}
                className={`group relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/80 p-8 shadow-[0_4px_20px_-4px_rgba(18,140,126,0.06)] backdrop-blur-sm hover:shadow-[0_20px_40px_-15px_rgba(18,140,126,0.12)] ${accent.hoverBorder} flex flex-col justify-start transition-all duration-300 hover:-translate-y-1.5`}
              >
                {/* Hover Ambient Glow */}
                <div
                  className={`pointer-events-none absolute -top-16 -right-16 h-36 w-36 rounded-full bg-gradient-to-br ${accent.hoverGlow} to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
                />

                {/* Icon Container */}
                <div
                  className={`relative mb-6 flex h-13 w-13 items-center justify-center rounded-2xl border ${accent.iconBox} shadow-2xs transition-transform duration-300 group-hover:scale-105`}
                >
                  <IconComp className="h-6 w-6" strokeWidth={2} />
                </div>

                {/* Feature Title */}
                <h3 className="mb-2.5 text-xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-slate-950">
                  {feature.title}
                </h3>

                {/* Feature Description */}
                <p className="text-sm leading-relaxed font-normal text-slate-600 sm:text-[15px]">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
