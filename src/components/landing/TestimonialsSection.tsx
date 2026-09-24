import type { LandingSection, LandingTestimonial } from '@/types/super-admin';

interface TestimonialsSectionProps {
  section: LandingSection | null;
  testimonials: LandingTestimonial[];
}

export function TestimonialsSection({
  section,
  testimonials,
}: TestimonialsSectionProps) {
  const title = section?.title || 'Trusted by businesses across the globe.';
  const subtitle = section?.subtitle || '';
  const displayTestimonials =
    ((section?.extra_data as Record<string, unknown>)
      ?.testimonials as LandingTestimonial[]) || testimonials;

  if (displayTestimonials.length === 0) return null;

  // Split into 4 columns for desktop scattered layout
  const col1: LandingTestimonial[] = [];
  const col2: LandingTestimonial[] = [];
  const col3: LandingTestimonial[] = [];
  const col4: LandingTestimonial[] = [];

  displayTestimonials.forEach((t, i) => {
    if (i % 4 === 0) col1.push(t);
    else if (i % 4 === 1) col2.push(t);
    else if (i % 4 === 2) col3.push(t);
    else col4.push(t);
  });

  const renderCard = (t: LandingTestimonial) => (
    <div
      key={t.id}
      className="group relative break-inside-avoid overflow-hidden rounded-2xl border border-emerald-900/10 bg-white/85 p-6 shadow-[0_8px_30px_rgba(18,140,126,0.05)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(18,140,126,0.1)]"
    >
      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-[#25D366]/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <p className="mb-6 text-sm leading-relaxed font-medium text-slate-600">
        &ldquo;{t.quote}&rdquo;
      </p>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/10 text-sm font-bold text-[#25D366]">
          {t.author_name
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .slice(0, 2)}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{t.author_name}</p>
          <p className="text-xs text-slate-400">
            {t.author_role}
            {t.author_company ? `, ${t.author_company}` : ''}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#edf7f2] via-[#e7f3ec] to-[#edf7f2] px-4 py-24 md:px-6"
      id="testimonials"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#25D366]/15 blur-[100px]" />

      {/* Mobile Layout (Standard grid) */}
      <div className="mx-auto max-w-xl lg:hidden">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-5xl">
            {title}
          </h2>
          {subtitle && <p className="text-lg text-slate-600">{subtitle}</p>}
        </div>
        <div className="flex flex-col gap-6">
          {displayTestimonials.map(renderCard)}
        </div>
      </div>

      {/* Desktop Layout (Floating Cloud) */}
      <div className="relative mx-auto hidden min-h-[800px] max-w-[90rem] grid-cols-4 gap-6 lg:grid">
        {/* The Exact Center Text Overlay - No background blur to match design exactly */}
        <div className="pointer-events-none absolute top-[38%] left-1/2 z-20 flex w-[120%] max-w-[55rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
          <h2 className="text-4xl leading-[1.1] font-bold tracking-tight text-[#0F172A] lg:text-5xl xl:text-6xl">
            Trusted by businesses
            <br />
            <span className="text-[#25D366]">across </span>the globe.
          </h2>
          {subtitle && (
            <p className="mt-6 text-lg font-medium text-slate-600 xl:text-xl">
              {subtitle}
            </p>
          )}
        </div>

        {/* Scattered Columns */}
        <div className="z-10 flex flex-col gap-6 pt-12">
          {col1.map(renderCard)}
        </div>

        <div className="z-10 flex flex-col gap-6">
          {col2.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-6">
              {i === 1 && (
                <div
                  className="h-[20rem] flex-shrink-0 xl:h-[24rem]"
                  aria-hidden="true"
                />
              )}
              {renderCard(t)}
            </div>
          ))}
        </div>

        <div className="z-10 flex flex-col gap-6 pt-16">
          {col3.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-6">
              {i === 1 && (
                <div
                  className="h-[20rem] flex-shrink-0 xl:h-[24rem]"
                  aria-hidden="true"
                />
              )}
              {renderCard(t)}
            </div>
          ))}
        </div>

        <div className="z-10 flex flex-col gap-6 pt-24">
          {col4.map(renderCard)}
        </div>
      </div>
    </section>
  );
}
