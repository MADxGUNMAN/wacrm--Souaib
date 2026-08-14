/**
 * The in-app starter template library.
 *
 * ─── Two things are called "library". They are not the same ───────
 *
 *   META'S Template Library  (src/lib/whatsapp/meta-api.ts)
 *     Meta's own pre-written, pre-categorised templates, fetched live from
 *     the WABA. Wording is FIXED and cannot be edited. Not offered to
 *     every account, and useless before a WABA is connected.
 *
 *   THIS starter library  (tables from migration 065)
 *     Templates WE write, grouped by industry. The operator copies one
 *     into the wizard and edits it freely before submitting. Always
 *     available, works before any WhatsApp connection exists, and is
 *     maintained from the super admin panel.
 *
 * The row shape deliberately mirrors `TemplatePayload` field for field, so
 * "Use template" is a copy rather than a translation — a translation layer
 * is somewhere the library and the submitted template could drift apart.
 *
 * PURE MODULE: imported by client browsers and by server routes, so no
 * server-only imports belong here.
 */

import {
  defaultTypeFor,
  findTypeOption,
  type TemplateCategory,
} from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateType } from '@/lib/whatsapp/template-definition';
import type { TemplateButton, TemplateSampleValues } from '@/types';

export interface StarterCategory {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string | null;
  position: number;
  is_active: boolean;
  /** Filled by the list endpoint so the chips can show counts. */
  template_count?: number;
}

export interface StarterTemplate {
  id: string;
  category_id: string;
  slug: string;
  title: string;
  description: string | null;
  emoji: string | null;
  /** Meta's own category enum, uppercase — not our internal casing. */
  meta_category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  template_type: string;
  language: string;
  header_type: 'text' | 'image' | 'video' | 'document' | 'location' | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: TemplateButton[] | null;
  sample_values: TemplateSampleValues | null;
  tags: string[];
  position: number;
  is_active: boolean;
}

/** Meta's uppercase category → the casing the wizard and payload use. */
export function toAppCategory(
  metaCategory: StarterTemplate['meta_category'],
): TemplateCategory {
  switch (metaCategory) {
    case 'MARKETING':
      return 'Marketing';
    case 'AUTHENTICATION':
      return 'Authentication';
    default:
      return 'Utility';
  }
}

/**
 * Resolve a library row's `template_type` into a type the wizard can open.
 *
 * `template_type` is a plain text column an operator fills in from the
 * super admin panel, so it can hold a value that does not exist for the
 * row's category (only Marketing offers Catalogue), or one whose editor is
 * gated behind a Meta feature the account has not enabled. Either would
 * put step 2 into the wrong form — or into no form at all.
 *
 * Falling back to the category's default keeps the prefill useful: the
 * body, header and buttons still come through, and the operator can change
 * the type on step 1 if they meant something else.
 */
export function resolveStarterTemplateType(
  category: TemplateCategory,
  rawType: string | null | undefined,
): TemplateType {
  if (!rawType) return defaultTypeFor(category);
  const option = findTypeOption(category, rawType as TemplateType);
  return option?.available ? option.type : defaultTypeFor(category);
}

/**
 * Substitute a starter template's sample values into its body, for preview.
 *
 * Used only for the browsing cards. The wizard's real preview renders from
 * the components model, so this never becomes the thing an operator relies
 * on before submitting.
 */
export function previewBody(template: StarterTemplate): string {
  const samples = template.sample_values?.body ?? [];
  return template.body_text.replace(/\{\{(\d+)\}\}/g, (match, n) => {
    const value = samples[Number(n) - 1];
    return value && value.trim() !== '' ? value : match;
  });
}

/** Does this template match a free-text search? Title, description, body, tags. */
export function matchesSearch(
  template: StarterTemplate,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    template.title.toLowerCase().includes(q) ||
    (template.description ?? '').toLowerCase().includes(q) ||
    template.body_text.toLowerCase().includes(q) ||
    template.tags.some((t) => t.toLowerCase().includes(q))
  );
}

/**
 * The variable count a starter template carries, so the browser can warn
 * when samples are missing before the operator hits the wizard.
 */
export function variableCount(template: StarterTemplate): number {
  const found = new Set<string>();
  for (const m of template.body_text.matchAll(/\{\{(\d+)\}\}/g)) {
    found.add(m[1]);
  }
  return found.size;
}
