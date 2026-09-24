import {
  MessageCircle,
  Settings,
  TrendingUp,
  Zap,
  Users,
  Shield,
  Bot,
  Workflow,
  Send,
  Kanban,
  Sparkles,
  Smartphone,
  Inbox,
  Rocket,
} from 'lucide-react';
import type { LandingSection } from '@/types/super-admin';

interface HowItWorksSectionProps {
  section: LandingSection | null;
}

const iconMap: Record<string, React.ElementType> = {
  MessageCircle,
  Settings,
  TrendingUp,
  Zap,
  Users,
  Shield,
  Bot,
  Workflow,
  Send,
  Kanban,
  Sparkles,
  Smartphone,
  Inbox,
  Rocket,
};

const defaultSteps = [
  {
    title: 'Connect your number',
    description:
      'Link your official WhatsApp Business API number seamlessly. Our platform handles the technical setup.',
    icon_name: 'Smartphone',
  },
  {
    title: 'Add your team',
    description:
      'Invite agents, set up roles, and assign permissions. Everyone works from the same WhatsApp number simultaneously.',
    icon_name: 'Users',
  },
  {
    title: 'Build AI workflows',
    description:
      'Design custom auto-replies, keyword triggers, and chat routing rules using our visual flow builder to automate customer support.',
    icon_name: 'Workflow',
  },
  {
    title: 'Engage in the Team Inbox',
    description:
      'Collaborate in real-time. Assign chats, add internal private notes, and let our AI assistant draft perfect replies.',
    icon_name: 'Inbox',
  },
  {
    title: 'Broadcasts & Pipelines',
    description:
      'Send Meta-approved bulk promotional campaigns, and track resulting sales through visual drag-and-drop deal pipelines.',
    icon_name: 'Rocket',
  },
];

export function HowItWorksSection({ section }: HowItWorksSectionProps) {
  if (section && !section.is_visible) return null;

  const title = section?.title || 'How Replai Works';
  const subtitle =
    section?.subtitle ||
    'From setup to your first AI-powered reply in just a few simple steps.';
  const displaySteps =
    ((section?.extra_data as Record<string, unknown>)
      ?.steps as typeof defaultSteps) || defaultSteps;

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
      className="relative overflow-hidden bg-gradient-to-b from-[#edf7f2] via-[#e5f2ea]/70 to-[#edf7f2] px-6 py-24"
      id="how-it-works"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-1/2 left-0 h-[700px] w-[700px] -translate-x-1/4 -translate-y-1/2 rounded-full bg-[#25D366]/15 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mx-auto mb-20 max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            {renderTitle(title)}
          </h2>
          <p className="text-xl text-slate-600">{subtitle}</p>
        </div>

        <div className="relative mx-auto mt-12 max-w-5xl">
          {/* Vertical Line */}
          <div className="absolute top-8 bottom-8 left-8 z-0 w-1 transform rounded-full bg-emerald-600/20 md:left-1/2 md:-translate-x-1/2" />

          <div className="relative z-10 space-y-12">
            {displaySteps.map((step, i) => {
              const Icon =
                iconMap[step.icon_name] ||
                iconMap[defaultSteps[i]?.icon_name] ||
                MessageCircle;
              const isEven = i % 2 === 0;

              return (
                <div
                  key={i}
                  className={`group relative flex flex-col items-center gap-8 md:flex-row md:gap-16 ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                >
                  {/* Content */}
                  <div
                    className={`w-full pl-24 md:w-1/2 md:pl-0 ${isEven ? 'md:pr-16' : 'md:pl-16'}`}
                  >
                    <div className="rounded-3xl border border-emerald-900/10 bg-white/85 p-8 text-left shadow-[0_4px_20px_-4px_rgba(18,140,126,0.05)] backdrop-blur-sm transition-all duration-300 group-hover:border-[#25D366]/40 group-hover:shadow-xl">
                      <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#25D366]/10 px-4 py-1.5 text-sm font-bold text-[#25D366]">
                        Step {i + 1}
                      </div>
                      <h3 className="mb-4 text-2xl font-bold text-slate-900">
                        {step.title}
                      </h3>
                      <p className="text-lg leading-relaxed text-slate-600">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Center Node */}
                  <div className="absolute left-0 z-10 flex h-16 w-16 transform items-center justify-center rounded-full border-4 border-emerald-100/80 bg-white shadow-sm transition-all duration-500 group-hover:scale-125 group-hover:border-[#25D366] group-hover:bg-[#25D366]/5 md:left-1/2 md:-translate-x-1/2">
                    <Icon className="h-7 w-7 text-slate-500 transition-colors duration-300 group-hover:text-[#25D366]" />
                  </div>

                  {/* Empty space for alternating layout on desktop */}
                  <div className="hidden w-1/2 md:block" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
