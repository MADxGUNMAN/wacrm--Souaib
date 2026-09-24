'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { IntegrationFAQ } from '@/types/super-admin';

interface FAQAccordionProps {
  items: IntegrationFAQ[];
}

export function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        No FAQs configured yet.
      </div>
    );
  }

  const toggle = (idx: number) => {
    setOpenIndex((current) => (current === idx ? null : idx));
  };

  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {items.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={idx} className="transition-colors">
            <button
              type="button"
              onClick={() => toggle(idx)}
              className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-slate-50/80 focus:outline-none"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold text-slate-900">
                {faq.question}
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-emerald-600' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100/60 bg-slate-50/40 px-5 pt-1 pb-5 text-sm leading-relaxed text-slate-600">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
