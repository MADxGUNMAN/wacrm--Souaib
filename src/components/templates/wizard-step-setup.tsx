'use client';

// ============================================================
// Wizard step 1 — "Set up your template".
//
// Mirrors Meta's WhatsApp Manager screen: category tabs across the top,
// a radio list of template types beneath, and a preview rail on the
// right showing what that type looks like in a real chat.
//
// The type list is per-category on purpose — Marketing offers Catalogue,
// Utility offers Order status, and Authentication has a single fixed
// shape with no chooser at all. See template-types-catalogue.ts.
// ============================================================

import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_ORDER,
  TEMPLATE_TYPES,
  findTypeOption,
  type TemplateCategory,
} from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import { cn } from '@/lib/utils';
import { Lock, Megaphone, Receipt, ShieldCheck } from 'lucide-react';

const CATEGORY_ICON: Record<TemplateCategory, typeof Megaphone> = {
  Marketing: Megaphone,
  Utility: Receipt,
  Authentication: ShieldCheck,
};

export function WizardStepSetup({
  category,
  templateType,
  onCategoryChange,
  onTypeChange,
}: {
  category: TemplateCategory;
  templateType: TemplateType;
  onCategoryChange: (next: TemplateCategory) => void;
  onTypeChange: (next: TemplateType) => void;
}) {
  const options = TEMPLATE_TYPES[category];
  const selected = findTypeOption(category, templateType) ?? options[0];
  // Authentication has exactly one shape, so Meta shows no chooser.
  const showTypeList = options.length > 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ---- Left: category + type ---- */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">
          Set up your template
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the category that best describes your message template. Then
          select the type of message you want to send.
        </p>

        {/* Category tabs. Category decides the price Meta charges, so it
            is stated on each tab rather than buried in a help link. */}
        <div
          role="tablist"
          aria-label="Template category"
          className="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-border"
        >
          {CATEGORY_ORDER.map((cat, i) => {
            const Icon = CATEGORY_ICON[cat];
            const active = cat === category;
            return (
              <button
                key={cat}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onCategoryChange(cat)}
                className={cn(
                  'flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  i > 0 && 'border-l border-border',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {cat}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {CATEGORY_DESCRIPTIONS[category]}
        </p>

        {showTypeList ? (
          <div
            role="radiogroup"
            aria-label="Template type"
            className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border"
          >
            {options.map((option) => {
              const active = option.type === templateType;
              const disabled = !option.available;
              return (
                <button
                  key={option.type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => onTypeChange(option.type)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                    active && !disabled && 'bg-primary/[0.07]',
                    disabled
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:bg-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                      active && !disabled
                        ? 'border-primary'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {active && !disabled ? (
                      <span className="size-2 rounded-full bg-primary" />
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {option.title}
                      </span>
                      {disabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                          <Lock className="size-2.5" />
                          Coming soon
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                    {/* Say WHY it is unavailable. A disabled row with no
                        explanation reads as a bug. */}
                    {disabled && option.unavailableReason ? (
                      <span className="mt-1 block text-xs text-amber-600 dark:text-amber-500">
                        {option.unavailableReason}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-semibold text-foreground">
              {options[0].title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {options[0].description}
            </p>
            {options[0].unavailableReason ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
                {options[0].unavailableReason}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* ---- Right: preview rail ---- */}
      <aside className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-sm font-semibold text-foreground">
          Template preview
        </h3>

        {/* Only the SELECTED type's artwork is rendered. Four of these
            assets are multi-megabyte animations, so mounting all of them
            would push ~9 MB down the wire for one visible image. */}
        <div className="mt-3 overflow-hidden rounded-lg bg-[#ECE5DD]">
          {/* eslint-disable-next-line @next/next/no-img-element --
              next/image cannot optimise animated GIFs (it would need
              `unoptimized` anyway) and these are fixed local assets, so
              the plain tag with lazy loading is the honest choice. */}
          <img
            key={selected.image}
            src={selected.image}
            alt={`Example of a ${selected.title.toLowerCase()} template in a WhatsApp chat`}
            loading="lazy"
            decoding="async"
            className="h-auto w-full object-contain"
          />
        </div>

        <dl className="mt-4 space-y-3">
          <div>
            <dt className="text-xs font-semibold text-foreground">
              This template is good for
            </dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {selected.goodFor}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-foreground">
              Template areas that you can customise
            </dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {selected.customisable}
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
