import type { LandingSection, LandingFaq } from "@/types/super-admin";

interface FAQSectionProps {
  section: LandingSection | null;
  faqs: LandingFaq[];
}

const PushPin = ({ color, className }: { color: string, className?: string }) => (
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
  const displayFaqs = ((section?.extra_data as any)?.faqs as LandingFaq[]) || faqs;

  if (!section?.is_visible || displayFaqs.length === 0) return null;

  const cardStyles = [
    { bg: "bg-emerald-50/50", rotate: "-rotate-2", mt: "mt-12", pinColor: "#25D366" }, 
    { bg: "bg-white border border-slate-100", rotate: "rotate-1", mt: "mt-24", pinColor: "#25D366" },  
    { bg: "bg-emerald-50/50", rotate: "-rotate-1", mt: "mt-8", pinColor: "#25D366" },  
    { bg: "bg-white border border-slate-100", rotate: "rotate-2", mt: "mt-16", pinColor: "#25D366" },  
  ];

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
    <section id="faq" className="w-full bg-white relative overflow-hidden py-24 border-t border-slate-100">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 w-[800px] h-[800px] bg-[#25D366]/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-4">
            {renderTitle(section.title || "Frequently Asked Questions")}
          </h2>
          {section.subtitle && (
            <p className="text-slate-500 text-base md:text-lg">
              {section.subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 items-start relative">
          {displayFaqs.map((faq, idx) => {
            const style = cardStyles[idx % cardStyles.length];
            return (
              <div 
                key={faq.id} 
                className={`relative flex flex-col p-6 md:p-8 rounded-3xl transition-transform duration-500 hover:scale-105 hover:z-20 shadow-[0_8px_30px_rgb(0,0,0,0.06)] ${style.bg} ${style.rotate} ${style.mt}`}
              >
                {/* Pushpin */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <PushPin color={style.pinColor} className="-rotate-12" />
                </div>

                <div className="text-slate-400 font-serif text-xl mb-4 font-medium opacity-80">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-4 leading-snug">
                  {faq.question}
                </h3>
                <p className="text-slate-600 leading-relaxed text-sm md:text-base">
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
