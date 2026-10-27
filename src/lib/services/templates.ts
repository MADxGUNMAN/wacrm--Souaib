// ============================================================
// WhatsApp template read services (Phase 5).
//
// `templateRequirements` says what a send of this template needs — body
// variables, a header value or media, URL-button suffixes, extra inputs
// for special types — computed from the canonical `components`
// (definitionFromRow), the same model the send builder uses.
// ============================================================

import {
  definitionFromRow,
  getBody,
  getButtons,
  getCarouselCards,
  getHeader,
  type TemplateRowLike,
} from '@/lib/whatsapp/template-definition';
import {
  extractNamedParams,
  extractVariableIndices,
} from '@/lib/whatsapp/template-variables';
import { ServiceError, UUID_RE, type ServiceContext } from './context';
import { likeLiteral } from './shared';

export const TEMPLATE_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'IN_APPEAL',
  'PENDING_DELETION',
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface TemplateRequirements {
  parameter_format: 'POSITIONAL' | 'NAMED';
  /** Positional: count of {{1}}…{{n}}. Named: the parameter names. */
  body_variables: { count: number; names: string[] };
  header: {
    type: 'none' | 'text' | 'image' | 'video' | 'document' | 'location';
    needs_value: boolean;
  };
  url_buttons_needing_suffix: number[];
  /** Special template types need inputs these tools can't provide yet. */
  special_type: string | null;
}

const TEMPLATE_SELECT =
  'id, name, language, category, status, template_type, parameter_format, components, header_type, header_content, header_media_url, header_handle, body_text, footer_text, buttons, sample_values, rejection_reason, quality_score, updated_at';

type TemplateRow = TemplateRowLike & {
  id: string;
  status: string;
  rejection_reason: string | null;
  quality_score: string | null;
  updated_at: string;
};

export function templateRequirements(
  row: TemplateRowLike
): TemplateRequirements {
  const def = definitionFromRow(row);
  const body = getBody(def.components)?.text ?? '';
  const named = def.parameter_format === 'NAMED';
  const header = getHeader(def.components);
  const headerType = (header?.format?.toLowerCase() ??
    'none') as TemplateRequirements['header']['type'];
  const headerNeedsValue =
    header?.format === 'TEXT'
      ? extractVariableIndices(header.text).length > 0 ||
        extractNamedParams(header.text).length > 0
      : header?.format === 'LOCATION';
  const urlButtons = getButtons(def.components)
    .map((b, i) =>
      b.type === 'URL' && /\{\{\s*\w+\s*\}\}/.test(b.url) ? i : -1
    )
    .filter((i) => i >= 0);
  const special =
    def.template_type === 'default'
      ? getCarouselCards(def.components).length
        ? 'carousel'
        : null
      : def.template_type;
  return {
    parameter_format: named ? 'NAMED' : 'POSITIONAL',
    body_variables: named
      ? {
          count: extractNamedParams(body).length,
          names: extractNamedParams(body),
        }
      : { count: extractVariableIndices(body).length, names: [] },
    header: { type: headerType, needs_value: headerNeedsValue },
    url_buttons_needing_suffix: urlButtons,
    special_type: special,
  };
}

export interface TemplateSummary {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  requirements: TemplateRequirements;
}

export async function listTemplates(
  ctx: ServiceContext,
  input: {
    status?: TemplateStatus | 'all';
    query?: string;
    limit?: number;
  } = {}
): Promise<TemplateSummary[]> {
  let q = ctx.db
    .from('message_templates')
    .select(TEMPLATE_SELECT)
    .eq('account_id', ctx.accountId);
  const status = input.status ?? 'APPROVED';
  if (status !== 'all') q = q.eq('status', status);
  const term = input.query?.trim().slice(0, 100);
  if (term) q = q.ilike('name', `%${likeLiteral(term)}%`);
  const { data, error } = await q
    .order('name', { ascending: true })
    .limit(Math.min(input.limit ?? 50, 100));
  if (error) throw new ServiceError('internal', 'Could not list templates');
  return ((data ?? []) as unknown as TemplateRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    language: r.language ?? '',
    category: r.category,
    status: r.status,
    requirements: templateRequirements(r),
  }));
}

export interface TemplateDetail extends TemplateSummary {
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: { type: string; text: string }[];
  rejection_reason: string | null;
  quality_score: string | null;
  updated_at: string;
}

/** By id, or by name (+ language when the name exists in several). */
export async function getTemplate(
  ctx: ServiceContext,
  ref: { id?: string; name?: string; language?: string }
): Promise<TemplateDetail> {
  let q = ctx.db
    .from('message_templates')
    .select(TEMPLATE_SELECT)
    .eq('account_id', ctx.accountId);
  if (ref.id) {
    if (!UUID_RE.test(ref.id))
      throw new ServiceError('not_found', 'Template not found');
    q = q.eq('id', ref.id);
  } else if (ref.name) {
    q = q.eq('name', ref.name);
    if (ref.language) q = q.eq('language', ref.language);
  } else {
    throw new ServiceError(
      'invalid_input',
      'Give a template_id or a template name'
    );
  }
  const { data, error } = await q.limit(2);
  if (error) throw new ServiceError('internal', 'Could not load the template');
  const rows = (data ?? []) as unknown as TemplateRow[];
  if (!rows.length) throw new ServiceError('not_found', 'Template not found');
  if (rows.length > 1) {
    throw new ServiceError(
      'invalid_input',
      'That template exists in several languages. Pass the language too (see list_templates)'
    );
  }
  const r = rows[0];
  const def = definitionFromRow(r);
  const header = getHeader(def.components);
  return {
    id: r.id,
    name: r.name,
    language: r.language ?? '',
    category: r.category,
    status: r.status,
    requirements: templateRequirements(r),
    header_text: header?.format === 'TEXT' ? header.text : null,
    body_text: getBody(def.components)?.text ?? '',
    footer_text: def.components.find((c) => c.type === 'FOOTER' && 'text' in c)
      ? ((def.components.find((c) => c.type === 'FOOTER') as { text?: string })
          .text ?? null)
      : null,
    buttons: getButtons(def.components).map((b) => ({
      type: b.type,
      text: 'text' in b ? String(b.text ?? '') : '',
    })),
    rejection_reason: r.rejection_reason,
    quality_score: r.quality_score,
    updated_at: r.updated_at,
  };
}
