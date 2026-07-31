import { MessageCircle, Settings, TrendingUp, Zap, Users, Shield, Bot, Workflow, Send, Kanban, Sparkles, Smartphone, Inbox, Rocket } from "lucide-react";
import type { LandingSection } from "@/types/super-admin";

interface HowItWorksSectionProps {
  section: LandingSection | null;
}

const iconMap: Record<string, React.ElementType> = {
  MessageCircle, Settings, TrendingUp, Zap, Users, Shield, Bot, Workflow, Send, Kanban, Sparkles, Smartphone, Inbox, Rocket
};

const defaultSteps = [
  {
    title: "Connect your number",
    description: "Link your official WhatsApp Business API number seamlessly. Our platform handles the technical setup.",
    icon_name: "Smartphone",
  },
  {
    title: "Add your team",
    description: "Invite agents, set up roles, and assign permissions. Everyone works from the same WhatsApp number simultaneously.",
    icon_name: "Users",
  },
  {
    title: "Build AI workflows",
    description: "Design custom auto-replies, keyword triggers, and chat routing rules using our visual flow builder to automate customer support.",
    icon_name: "Workflow",
  },
  {
    title: "Engage in the Team Inbox",
    description: "Collaborate in real-time. Assign chats, add internal private notes, and let our AI assistant draft perfect replies.",
    icon_name: "Inbox",
  },
  {
    title: "Broadcasts & Pipelines",
    description: "Send Meta-approved bulk promotional campaigns, and track resulting sales through visual drag-and-drop deal pipelines.",
    icon_name: "Rocket",
  }
];

export function HowItWorksSection({ section }: HowItWorksSectionProps) {
  if (section && !section.is_visible) return null;

  const title = section?.title || "How Replai Works";
  const subtitle = section?.subtitle || "From setup to your first AI-powered reply in just a few simple steps.";
  const displaySteps = ((section?.extra_data as any)?.steps as any[]) || defaultSteps;

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
    <section className="py-24 px-6 bg-white relative overflow-hidden" id="how-it-works">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-0 -translate-x-1/4 -translate-y-1/2 w-[700px] h-[700px] bg-[#25D366]/15 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 tracking-tight">{renderTitle(title)}</h2>
          <p className="text-xl text-slate-600">{subtitle}</p>
        </div>

        <div className="max-w-5xl mx-auto relative mt-12">
          {/* Vertical Line */}
          <div className="absolute left-8 md:left-1/2 top-8 bottom-8 w-1 bg-slate-100 rounded-full transform md:-translate-x-1/2 z-0" />

          <div className="space-y-12 relative z-10">
            {displaySteps.map((step, i) => {
              const Icon = iconMap[step.icon_name] || iconMap[defaultSteps[i]?.icon_name] || MessageCircle;
              const isEven = i % 2 === 0;

              return (
                <div key={i} className={`relative flex flex-col md:flex-row items-center gap-8 md:gap-16 group ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                  
                  {/* Content */}
                  <div className={`w-full md:w-1/2 pl-24 md:pl-0 ${isEven ? 'md:pr-16' : 'md:pl-16'}`}>
                     <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 group-hover:shadow-xl group-hover:border-[#25D366]/30 transition-all duration-300 text-left">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#25D366]/10 text-[#25D366] text-sm font-bold mb-5">
                          Step {i + 1}
                        </div>
                        <h3 className="text-2xl font-bold mb-4 text-slate-900">{step.title}</h3>
                        <p className="text-slate-600 leading-relaxed text-lg">{step.description}</p>
                     </div>
                  </div>

                  {/* Center Node */}
                  <div className="absolute left-0 md:left-1/2 transform md:-translate-x-1/2 w-16 h-16 rounded-full bg-white border-4 border-slate-100 flex items-center justify-center z-10 shadow-sm group-hover:scale-125 group-hover:border-[#25D366] group-hover:bg-[#25D366]/5 transition-all duration-500">
                    <Icon className="w-7 h-7 text-slate-500 group-hover:text-[#25D366] transition-colors duration-300" />
                  </div>
                  
                  {/* Empty space for alternating layout on desktop */}
                  <div className="hidden md:block w-1/2" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
