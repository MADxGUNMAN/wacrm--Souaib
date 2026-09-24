import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { LandingSection } from '@/types/super-admin';
import { Button } from '@/components/ui/button';

interface AIHighlightSectionProps {
  section: LandingSection | null;
}

export function AIHighlightSection({ section }: AIHighlightSectionProps) {
  if (section && !section.is_visible) return null;

  const title = section?.title || 'AI That Actually Understands Your Business';
  const subtitle =
    section?.subtitle ||
    'Upload your docs, FAQs, and product info. Replai builds a knowledge base and uses hybrid retrieval to give accurate, context-aware replies — not generic chatbot fluff.';
  const buttonText = section?.cta_primary_text || 'Learn More';
  const buttonLink = section?.cta_primary_link || '#features';
  const image =
    section?.image_url ||
    'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1600';

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
      className="relative overflow-hidden bg-gradient-to-b from-[#edf7f2] via-[#e2f0e6] to-[#edf7f2] py-24"
      id="ai-highlight"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-full max-w-3xl -translate-x-1/2 rounded-full bg-[#25D366]/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Text Content */}
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <h2 className="mb-6 text-4xl leading-tight font-extrabold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
              {renderTitle(title)}
            </h2>

            <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-slate-600 lg:mx-0">
              {subtitle}
            </p>

            <Link href={buttonLink}>
              <Button
                size="lg"
                className="h-auto rounded-full bg-[#25D366] px-8 py-6 text-lg font-bold text-white transition-all hover:-translate-y-1 hover:bg-[#20bd5a] hover:shadow-lg"
              >
                {buttonText} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>

          {/* Image/Mockup */}
          <div className="group relative order-1 lg:order-2">
            <div className="absolute inset-0 rounded-3xl bg-[#25D366]/20 opacity-50 blur-3xl transition-opacity duration-500 group-hover:opacity-70" />
            <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/80 shadow-2xl backdrop-blur-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="AI Highlight"
                className="h-auto w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
