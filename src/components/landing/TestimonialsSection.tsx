import { Star } from "lucide-react";
import type { LandingSection, LandingTestimonial } from "@/types/super-admin";

interface TestimonialsSectionProps {
  section: LandingSection | null;
  testimonials: LandingTestimonial[];
}

export function TestimonialsSection({ section, testimonials }: TestimonialsSectionProps) {
  const title = section?.title || "Trusted by businesses across the globe.";
  const subtitle = section?.subtitle || "";
  const displayTestimonials = ((section?.extra_data as any)?.testimonials as any[]) || testimonials;

  if (displayTestimonials.length === 0) return null;

  // Split into 4 columns for desktop scattered layout
  const col1: any[] = [];
  const col2: any[] = [];
  const col3: any[] = [];
  const col4: any[] = [];

  displayTestimonials.forEach((t, i) => {
    if (i % 4 === 0) col1.push(t);
    else if (i % 4 === 1) col2.push(t);
    else if (i % 4 === 2) col3.push(t);
    else col4.push(t);
  });

  const renderCard = (t: any) => (
    <div
      key={t.id}
      className="bg-white p-6 rounded-2xl transition-all duration-300 hover:-translate-y-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] relative group overflow-hidden break-inside-avoid"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#25D366]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="text-slate-600 leading-relaxed mb-6 text-sm font-medium">
        "{t.quote}"
      </p>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366] font-bold text-sm">
          {t.author_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">
            {t.author_name}
          </p>
          <p className="text-xs text-slate-400">
            {t.author_role}
            {t.author_company ? `, ${t.author_company}` : ""}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="py-24 px-4 md:px-6 relative bg-slate-50 overflow-hidden" id="testimonials">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#25D366]/15 blur-[100px] rounded-full pointer-events-none" />

      {/* Mobile Layout (Standard grid) */}
      <div className="lg:hidden max-w-xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">{title}</h2>
          {subtitle && <p className="text-lg text-slate-600">{subtitle}</p>}
        </div>
        <div className="flex flex-col gap-6">
          {displayTestimonials.map(renderCard)}
        </div>
      </div>

      {/* Desktop Layout (Floating Cloud) */}
      <div className="hidden lg:grid grid-cols-4 gap-6 relative max-w-[90rem] mx-auto min-h-[800px]">
        
        {/* The Exact Center Text Overlay - No background blur to match design exactly */}
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] max-w-[55rem] z-20 flex flex-col items-center justify-center text-center pointer-events-none">
          <h2 className="text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-[#0F172A] leading-[1.1]">
            Trusted by businesses<br/>
            <span className="text-[#25D366]">across </span>the globe.
          </h2>
          {subtitle && <p className="text-lg xl:text-xl text-slate-600 mt-6 font-medium">{subtitle}</p>}
        </div>

        {/* Scattered Columns */}
        <div className="flex flex-col gap-6 pt-12 z-10">
          {col1.map(renderCard)}
        </div>
        
        <div className="flex flex-col gap-6 z-10">
          {col2.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-6">
              {i === 1 && <div className="h-[20rem] xl:h-[24rem] flex-shrink-0" aria-hidden="true" />}
              {renderCard(t)}
            </div>
          ))}
        </div>
        
        <div className="flex flex-col gap-6 pt-16 z-10">
          {col3.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-6">
              {i === 1 && <div className="h-[20rem] xl:h-[24rem] flex-shrink-0" aria-hidden="true" />}
              {renderCard(t)}
            </div>
          ))}
        </div>
        
        <div className="flex flex-col gap-6 pt-24 z-10">
          {col4.map(renderCard)}
        </div>
      </div>
      
    </section>
  );
}
