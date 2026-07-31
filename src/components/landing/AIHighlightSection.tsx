import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { LandingSection } from "@/types/super-admin";
import { Button } from "@/components/ui/button";

interface AIHighlightSectionProps {
  section: LandingSection | null;
}

export function AIHighlightSection({ section }: AIHighlightSectionProps) {
  if (section && !section.is_visible) return null;

  const title = section?.title || "AI That Actually Understands Your Business";
  const subtitle = section?.subtitle || "Upload your docs, FAQs, and product info. Replai builds a knowledge base and uses hybrid retrieval to give accurate, context-aware replies — not generic chatbot fluff.";
  const buttonText = section?.cta_primary_text || "Learn More";
  const buttonLink = section?.cta_primary_link || "#features";
  const image = section?.image_url || "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1600";

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
    <section className="py-24 relative overflow-hidden bg-slate-50" id="ai-highlight">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-[#25D366]/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Text Content */}
          <div className="order-2 lg:order-1 text-center lg:text-left">

            
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight leading-tight text-slate-900">
              {renderTitle(title)}
            </h2>
            
            <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              {subtitle}
            </p>
            
            <Link href={buttonLink}>
              <Button size="lg" className="bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-full px-8 py-6 h-auto text-lg transition-all hover:shadow-lg hover:-translate-y-1">
                {buttonText} <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>

          {/* Image/Mockup */}
          <div className="order-1 lg:order-2 relative group">
            <div className="absolute inset-0 bg-[#25D366]/20 blur-3xl opacity-50 group-hover:opacity-70 transition-opacity duration-500 rounded-3xl" />
            <div className="relative rounded-3xl overflow-hidden border border-slate-200 shadow-2xl bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={image} 
                alt="AI Highlight" 
                className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
