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
} from "lucide-react";
import type { LandingSection, LandingFeature } from "@/types/super-admin";

const iconMap: Record<string, React.ElementType> = {
  MessageSquare, Bot, Workflow, Send, Kanban, Users,
  Sparkles, Shield, Globe, Zap, BarChart3, FileText,
  // Fallback names from seed
  inbox: MessageSquare,
  auto_awesome: Sparkles,
  account_tree: Workflow,
  campaign: Send,
  view_kanban: Kanban,
  contact_page: Users,
};

const colorClasses = [
  { bg: "bg-[#25D366]/10", text: "text-[#25D366]" },
  { bg: "bg-purple-500/10", text: "text-purple-600" },
  { bg: "bg-blue-500/10", text: "text-blue-600" },
  { bg: "bg-orange-500/10", text: "text-orange-600" },
  { bg: "bg-green-500/10", text: "text-green-600" },
  { bg: "bg-pink-500/10", text: "text-pink-600" },
];

interface FeaturesSectionProps {
  section: LandingSection | null;
  features: LandingFeature[];
}

export function FeaturesSection({ section, features }: FeaturesSectionProps) {
  const title = section?.title || "Everything you need to scale WhatsApp";
  const subtitle =
    section?.subtitle ||
    "Replace chaos with clarity. Replai brings enterprise-grade CRM capabilities directly to your most vital communication channel.";

  const displayFeatures = ((section?.extra_data as any)?.features as LandingFeature[]) || features;

  return (
    <section className="py-24 px-6 relative overflow-hidden" id="features">
      {/* Background Glow */}
      <div className="absolute top-1/4 right-0 translate-x-1/4 w-[600px] h-[600px] bg-[#25D366]/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            {title.split("WhatsApp").length > 1 ? (
              <>
                {title.split("WhatsApp")[0]}
                <span className="text-[#25D366]">WhatsApp</span>
                {title.split("WhatsApp")[1]}
              </>
            ) : (
              title
            )}
          </h2>
          <p className="text-lg text-slate-600">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayFeatures.map((feature, i) => {
            const color = colorClasses[i % colorClasses.length];
            const IconComp = iconMap[feature.icon_name] || Sparkles;

            return (
              <div
                key={feature.id}
                className="group relative overflow-hidden bg-white border border-slate-200 p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1.5 hover:border-[#25D366]/30 hover:shadow-[0_10px_30px_-10px_rgba(37,211,102,0.15)] shadow-sm"
              >
                {i === 1 && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#25D366]/20 blur-[50px] rounded-full group-hover:bg-[#25D366]/30 transition-colors" />
                )}
                <div
                  className={`w-12 h-12 rounded-xl ${color.bg} flex items-center justify-center ${color.text} mb-6 group-hover:scale-110 transition-transform`}
                >
                  <IconComp className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
