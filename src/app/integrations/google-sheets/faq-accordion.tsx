'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import type { IntegrationFAQ } from '@/types/super-admin';

interface FAQAccordionProps {
  items: IntegrationFAQ[];
}

export function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!items || items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-emerald-900/15 bg-white/60 p-10 text-center text-sm text-slate-500 shadow-xs backdrop-blur-xs">
        <HelpCircle className="mx-auto mb-2 h-6 w-6 text-emerald-500/60" />
        No FAQs configured yet.
      </div>
    );
  }

  const toggle = (idx: number) => {
    setOpenIndex((current) => (current === idx ? null : idx));
  };

  return (
    <div className="space-y-4">
      {items.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div
            key={idx}
            className={`group rounded-3xl border transition-all duration-300 ${
              isOpen
                ? 'border-emerald-500/40 bg-white/95 shadow-[0_10px_30px_-10px_rgba(18,140,126,0.12)] ring-1 ring-emerald-500/20'
                : 'border-emerald-900/10 bg-white/80 shadow-[0_4px_20px_-4px_rgba(18,140,126,0.04)] hover:border-emerald-500/30 hover:bg-white hover:shadow-md'
            } overflow-hidden backdrop-blur-sm`}
          >
            <button
              type="button"
              onClick={() => toggle(idx)}
              className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors focus:outline-hidden"
              aria-expanded={isOpen}
            >
              <span
                className={`text-base font-bold transition-colors sm:text-lg ${
                  isOpen
                    ? 'text-emerald-900'
                    : 'text-slate-900 group-hover:text-emerald-800'
                }`}
              >
                {faq.question}
              </span>
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                  isOpen
                    ? 'rotate-180 border-emerald-500/30 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200/80 bg-slate-50/80 text-slate-400 group-hover:border-emerald-200 group-hover:bg-emerald-50/60 group-hover:text-emerald-600'
                }`}
              >
                <ChevronDown className="h-4 w-4" />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-emerald-500/10 bg-gradient-to-b from-emerald-50/20 to-transparent px-6 pt-2 pb-6 text-sm leading-relaxed text-slate-600 sm:text-base">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
