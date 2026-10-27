'use client';

// ============================================================
// The in-app User Guide for /super-admin/payments.
//
// PaymentsGuideBody is not portaled, so it renders under
// renderToStaticMarkup in tests. The Sheet and its trigger wrap it.
// Content lives in payments-guide-content.ts; where each module lives
// is derived from the navigation model, never typed by hand.
// ============================================================

import { useState } from 'react';
import { AlertTriangle, BookOpen } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PAYMENTS_GUIDE, type GuideTerm } from './payments-guide-content';
import { locationLabel } from './payments-nav';

const guideId = (id: string) => `guide-${id}`;

export function PaymentsGuideBody() {
  const g = PAYMENTS_GUIDE;
  const [open, setOpen] = useState<string[]>([]);

  const jump = (id: string, accordion: boolean) => {
    if (accordion) {
      setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    // After the panel has opened, so the target is laid out.
    requestAnimationFrame(() => {
      document
        .getElementById(guideId(id))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="space-y-5 text-sm text-slate-700">
      {g.intro.map((p) => (
        <p key={p} className="text-xs leading-relaxed text-slate-600">
          {p}
        </p>
      ))}

      <nav
        aria-label="Guide contents"
        className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
      >
        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          On this page
        </p>
        <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {g.topics.map((t) => (
            <li key={t.id}>
              <ContentsLink onClick={() => jump(t.id, false)}>
                {t.title}
              </ContentsLink>
            </li>
          ))}
          {g.modules.map((m) => (
            <li key={m.id}>
              <ContentsLink onClick={() => jump(m.id, true)}>
                {m.title}
              </ContentsLink>
            </li>
          ))}
          <li>
            <ContentsLink onClick={() => jump('tasks', false)}>
              Common tasks
            </ContentsLink>
          </li>
        </ul>
      </nav>

      <section aria-labelledby="guide-map-heading">
        <h3
          id="guide-map-heading"
          className="mb-1.5 text-sm font-semibold text-slate-900"
        >
          Where everything lives
        </h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] tracking-wider text-slate-500 uppercase">
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                Original tab
              </th>
              <th scope="col" className="py-1.5 font-semibold">
                Now in
              </th>
            </tr>
          </thead>
          <tbody>
            {g.modules.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 font-medium text-slate-800">
                  {m.title}
                </td>
                <td className="py-1.5 text-slate-600">
                  {locationLabel(m.location)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {g.topics.map((t) => (
        <section
          key={t.id}
          id={guideId(t.id)}
          aria-labelledby={`${guideId(t.id)}-heading`}
          className="scroll-mt-4 space-y-2"
        >
          <h3
            id={`${guideId(t.id)}-heading`}
            className="text-sm font-semibold text-slate-900"
          >
            {t.title}
          </h3>
          {t.paragraphs.map((p) => (
            <p key={p} className="text-xs leading-relaxed text-slate-600">
              {p}
            </p>
          ))}
          {t.terms ? <Terms terms={t.terms} /> : null}
        </section>
      ))}

      <section aria-labelledby="guide-modules-heading" className="space-y-1">
        <h3
          id="guide-modules-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Modules
        </h3>
        <Accordion
          multiple
          value={open}
          onValueChange={(value) => setOpen(value as string[])}
          className="rounded-lg border border-slate-200 px-3"
        >
          {g.modules.map((m) => (
            <AccordionItem
              key={m.id}
              value={m.id}
              id={guideId(m.id)}
              className="scroll-mt-4 border-slate-100"
            >
              <AccordionTrigger className="text-sm text-slate-900">
                <span>
                  {m.title}
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    Now in: {locationLabel(m.location)}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-xs leading-relaxed text-slate-600">
                <p>{m.summary}</p>
                {m.columns ? (
                  <Block title="Columns and fields">
                    <Terms terms={m.columns} />
                  </Block>
                ) : null}
                {m.statuses ? (
                  <Block title="Statuses">
                    <Terms terms={m.statuses} />
                  </Block>
                ) : null}
                {m.actions ? (
                  <Block title="Actions">
                    <ul className="space-y-2">
                      {m.actions.map((a) => (
                        <li key={a.name}>
                          <p className="font-semibold text-slate-800">
                            {a.name}
                          </p>
                          <p>{a.what}</p>
                          {a.when ? (
                            <p className="text-slate-500">{a.when}</p>
                          ) : null}
                          {a.caution ? (
                            <p className="mt-0.5 flex items-start gap-1.5 text-amber-800">
                              <AlertTriangle
                                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                aria-hidden
                              />
                              {a.caution}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Block>
                ) : null}
                {m.notes ? (
                  <Block title="Good to know">
                    <ul className="list-disc space-y-1 pl-4">
                      {m.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </Block>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section
        id={guideId('tasks')}
        aria-labelledby="guide-tasks-heading"
        className="scroll-mt-4 space-y-1"
      >
        <h3
          id="guide-tasks-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Common tasks
        </h3>
        <Accordion multiple className="rounded-lg border border-slate-200 px-3">
          {g.tasks.map((t) => (
            <AccordionItem
              key={t.id}
              value={t.id}
              id={guideId(t.id)}
              className="border-slate-100"
            >
              <AccordionTrigger className="text-sm text-slate-900">
                {t.title}
              </AccordionTrigger>
              <AccordionContent className="text-xs leading-relaxed text-slate-600">
                <ol className="list-decimal space-y-1 pl-4">
                  {t.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}

export function PaymentsGuideSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <GuideSheetContent />
    </Sheet>
  );
}

/** "User Guide" button; the Sheet root holds the open state. */
export function PaymentsGuideButton() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <BookOpen aria-hidden />
        User Guide
      </SheetTrigger>
      <GuideSheetContent />
    </Sheet>
  );
}

function GuideSheetContent() {
  return (
    <SheetContent
      side="right"
      className="w-full gap-0 border-slate-200 bg-white p-0 text-slate-900 sm:max-w-2xl data-[side=right]:sm:max-w-2xl"
    >
      <SheetHeader className="border-b border-slate-100 px-5 py-4 pr-12">
        <SheetTitle className="text-base font-bold text-slate-900">
          {PAYMENTS_GUIDE.title}
        </SheetTitle>
        <SheetDescription className="text-xs text-slate-500">
          How every section of the Payments page works, and what each action
          does.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PaymentsGuideBody />
      </div>
    </SheetContent>
  );
}

function ContentsLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function Terms({ terms }: { terms: GuideTerm[] }) {
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[minmax(0,12rem)_1fr]">
      {terms.map((t) => (
        <div key={t.term} className="contents">
          <dt className="font-medium text-slate-800">{t.term}</dt>
          <dd className="text-slate-600">{t.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
