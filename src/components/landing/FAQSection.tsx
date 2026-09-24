import type { LandingSection, LandingFaq } from '@/types/super-admin';

interface FAQSectionProps {
  section: LandingSection | null;
  faqs: LandingFaq[];
}

const PushPin = ({
  color,
  className,
}: {
  color: string;
  className?: string;
}) => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill={color}
    className={`drop-shadow-md ${className}`}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M14.5 4.5V8.5L16.5 11.5V13.5H13V21.5L12 22.5L11 21.5V13.5H7.5V11.5L9.5 8.5V4.5H8.5V2.5H15.5V4.5H14.5Z"
      fill={color}
      stroke="rgba(0,0,0,0.1)"
      strokeWidth="0.5"
    />
    {/* Highlight for 3D effect */}
    <circle cx="10.5" cy="5.5" r="1.5" fill="white" fillOpacity="0.4" />
  </svg>
);

export function FAQSection({ section, faqs }: FAQSectionProps) {
  const displayFaqs =
    ((section?.extra_data as Record<string, unknown>)?.faqs as LandingFaq[]) ||
    faqs;

  if (!section?.is_visible || displayFaqs.length === 0) return null;

  const cardStyles = [
    {
      bg: 'bg-emerald-50/80 border border-emerald-200/60 backdrop-blur-sm',
      rotate: '-rotate-2',
      mt: 'mt-12',
      pinColor: '#25D366',
    },
    {
      bg: 'bg-white/85 border border-emerald-900/10 backdrop-blur-sm',
      rotate: 'rotate-1',
      mt: 'mt-24',
      pinColor: '#25D366',
    },
    {
      bg: 'bg-emerald-50/80 border border-emerald-200/60 backdrop-blur-sm',
      rotate: '-rotate-1',
      mt: 'mt-8',
      pinColor: '#25D366',
    },
    {
      bg: 'bg-white/85 border border-emerald-900/10 backdrop-blur-sm',
      rotate: 'rotate-2',
      mt: 'mt-16',
      pinColor: '#25D366',
    },
  ];

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
      id="faq"
      className="relative w-full overflow-hidden border-t border-emerald-900/10 bg-gradient-to-b from-[#edf7f2] via-[#e4f1e8] to-[#edf7f2] py-24"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] translate-x-1/3 -translate-y-1/3 rounded-full bg-[#25D366]/20 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
            {renderTitle(section.title || 'Frequently Asked Questions')}
          </h2>
          {section.subtitle && (
            <p className="text-base text-slate-500 md:text-lg">
              {section.subtitle}
            </p>
          )}
        </div>

        <div className="relative grid grid-cols-1 items-start gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-4">
          {displayFaqs.map((faq, idx) => {
            const style = cardStyles[idx % cardStyles.length];
            return (
              <div
                key={faq.id}
                className={`relative flex flex-col rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-transform duration-500 hover:z-20 hover:scale-105 md:p-8 ${style.bg} ${style.rotate} ${style.mt}`}
              >
                {/* Pushpin */}
                <div className="absolute -top-4 left-1/2 z-10 -translate-x-1/2">
                  <PushPin color={style.pinColor} className="-rotate-12" />
                </div>

                <div className="mb-4 font-serif text-xl font-medium text-slate-400 opacity-80">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <h3 className="mb-4 text-xl leading-snug font-bold text-slate-900">
                  {faq.question}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600 md:text-base">
                  {faq.answer}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
