'use client';

// "Page Copy" tab of the Google Sheets CMS editor: everything stored in
// integration_pages.content for slug 'google-sheets' (see
// lib/cms/google-sheets-content). Empty fields fall back to the defaults
// on the public page; "Reset to default" restores them here.

import {
  CheckCircle2,
  FileText,
  Layers,
  MessageSquare,
  Shield,
  Table2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  AddButton,
  EditorCard,
  RemoveButton,
  ResetButton,
  StringList,
  TextField,
  clone,
} from '@/components/super-admin/cms-editor-kit';
import {
  SHEETS_DEFAULT_CONTENT,
  type SheetsLegalDocCopy,
  type SheetsMockRow,
  type SheetsPageContent,
} from '@/lib/cms/google-sheets-content';

interface Props {
  content: SheetsPageContent;
  onChange: (next: SheetsPageContent) => void;
}

const COLUMN_LABELS = [
  'Customer column',
  'Phone column',
  'Order column',
  'Status column',
  'Delivery column',
];

export function SheetsContentEditor({ content, onChange }: Props) {
  const set = <K extends keyof SheetsPageContent>(
    key: K,
    value: SheetsPageContent[K]
  ) => onChange({ ...content, [key]: value });

  const reset = (...keys: (keyof SheetsPageContent)[]) => {
    const next = { ...content };
    for (const k of keys) {
      (next as Record<string, unknown>)[k] = clone(SHEETS_DEFAULT_CONTENT[k]);
    }
    onChange(next);
  };

  const setRow = (idx: number, patch: Partial<SheetsMockRow>) =>
    set(
      'mockup_rows',
      content.mockup_rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );

  const setDoc = (
    key: 'privacy_doc' | 'terms_doc',
    patch: Partial<SheetsLegalDocCopy>
  ) => set(key, { ...content[key], ...patch });

  const docFields = (key: 'privacy_doc' | 'terms_doc') => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField
        label="Breadcrumb"
        value={content[key].breadcrumb}
        onChange={(v) => setDoc(key, { breadcrumb: v })}
      />
      <TextField
        label="Eyebrow"
        value={content[key].eyebrow}
        onChange={(v) => setDoc(key, { eyebrow: v })}
      />
      <TextField
        label="Heading"
        value={content[key].heading}
        onChange={(v) => setDoc(key, { heading: v })}
        className="md:col-span-2"
      />
      <TextField
        label="Intro"
        value={content[key].intro}
        onChange={(v) => setDoc(key, { intro: v })}
        rows={2}
        className="md:col-span-2"
      />
      <TextField
        label="Meta Title"
        value={content[key].meta_title}
        onChange={(v) => setDoc(key, { meta_title: v })}
      />
      <TextField
        label="Meta Description"
        value={content[key].meta_description}
        onChange={(v) => setDoc(key, { meta_description: v })}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <EditorCard
        title="Hero Ticks & Requirements Box"
        icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        description="The ticks under the hero buttons, and the heading and text of the requirements card. The requirement list itself is on the Landing tab."
        actions={
          <>
            <ResetButton
              onClick={() =>
                reset(
                  'breadcrumb_label',
                  'hero_checks',
                  'requirements_eyebrow',
                  'requirements_heading',
                  'requirements_body'
                )
              }
            />
            <AddButton
              label="Add Tick"
              onClick={() =>
                set('hero_checks', [...content.hero_checks, 'New point'])
              }
            />
          </>
        }
      >
        <div className="mb-4">
          <StringList
            items={content.hero_checks}
            onChange={(items) => set('hero_checks', items)}
            itemLabel="Hero tick"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Breadcrumb Label"
            value={content.breadcrumb_label}
            onChange={(v) => set('breadcrumb_label', v)}
          />
          <TextField
            label="Requirements Eyebrow"
            value={content.requirements_eyebrow}
            onChange={(v) => set('requirements_eyebrow', v)}
          />
          <TextField
            label="Requirements Heading"
            value={content.requirements_heading}
            onChange={(v) => set('requirements_heading', v)}
            className="md:col-span-2"
          />
          <TextField
            label="Requirements Text"
            value={content.requirements_body}
            onChange={(v) => set('requirements_body', v)}
            rows={2}
            className="md:col-span-2"
          />
        </div>
      </EditorCard>

      <EditorCard
        title="Spreadsheet Mockup"
        icon={<Table2 className="h-5 w-5 text-emerald-500" />}
        description="The sample sheet shown under the hero. Rows marked Pending show amber and a grey delivery cell."
        actions={
          <>
            <ResetButton
              onClick={() =>
                reset(
                  'mockup_window_title',
                  'mockup_status_badge',
                  'mockup_columns',
                  'mockup_rows'
                )
              }
            />
            <AddButton
              label="Add Row"
              onClick={() =>
                set('mockup_rows', [
                  ...content.mockup_rows,
                  {
                    customer: 'New customer',
                    phone: '+91 90000 00000',
                    order_id: 'ORD-0000',
                    status: 'Pending',
                    tone: 'pending',
                    delivery: 'Waiting for trigger',
                  },
                ])
              }
            />
          </>
        }
      >
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Window Title"
            value={content.mockup_window_title}
            onChange={(v) => set('mockup_window_title', v)}
          />
          <TextField
            label="Status Badge"
            value={content.mockup_status_badge}
            onChange={(v) => set('mockup_status_badge', v)}
          />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {content.mockup_columns.map((col, i) => (
            <Input
              key={i}
              value={col}
              aria-label={COLUMN_LABELS[i]}
              placeholder={SHEETS_DEFAULT_CONTENT.mockup_columns[i]}
              onChange={(e) =>
                set(
                  'mockup_columns',
                  content.mockup_columns.map((c, j) =>
                    j === i ? e.target.value : c
                  )
                )
              }
            />
          ))}
        </div>
        <div className="space-y-3">
          {content.mockup_rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-2 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto_auto]"
            >
              <Input
                value={row.customer}
                aria-label={`Row ${idx + 1} customer`}
                onChange={(e) => setRow(idx, { customer: e.target.value })}
                className="bg-white"
              />
              <Input
                value={row.phone}
                aria-label={`Row ${idx + 1} phone`}
                onChange={(e) => setRow(idx, { phone: e.target.value })}
                className="bg-white"
              />
              <Input
                value={row.order_id}
                aria-label={`Row ${idx + 1} order`}
                onChange={(e) => setRow(idx, { order_id: e.target.value })}
                className="bg-white"
              />
              <Input
                value={row.status}
                aria-label={`Row ${idx + 1} status`}
                onChange={(e) => setRow(idx, { status: e.target.value })}
                className="bg-white"
              />
              <Input
                value={row.delivery}
                aria-label={`Row ${idx + 1} delivery`}
                onChange={(e) => setRow(idx, { delivery: e.target.value })}
                className="bg-white"
              />
              <select
                value={row.tone}
                aria-label={`Row ${idx + 1} style`}
                onChange={(e) =>
                  setRow(idx, {
                    tone: e.target.value === 'pending' ? 'pending' : 'success',
                  })
                }
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-xs"
              >
                <option value="success">Sent (green)</option>
                <option value="pending">Pending (amber)</option>
              </select>
              <RemoveButton
                label={`Remove row ${idx + 1}`}
                onClick={() =>
                  set(
                    'mockup_rows',
                    content.mockup_rows.filter((_, i) => i !== idx)
                  )
                }
              />
            </div>
          ))}
        </div>
      </EditorCard>

      <EditorCard
        title="Rule Card & WhatsApp Bubble"
        icon={<MessageSquare className="h-5 w-5 text-emerald-500" />}
        description="The sidebar next to the sheet. Wrap words in **double asterisks** to make them bold in the bubble."
        actions={
          <ResetButton
            onClick={() =>
              reset(
                'mockup_rule_title',
                'mockup_rule_badge',
                'mockup_template_name',
                'mockup_template_meta',
                'mockup_trigger',
                'bubble_sender',
                'bubble_time',
                'bubble_text',
                'bubble_status',
                'mockup_footer_left',
                'mockup_footer_right'
              )
            }
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Rule Title"
            value={content.mockup_rule_title}
            onChange={(v) => set('mockup_rule_title', v)}
          />
          <TextField
            label="Rule Badge"
            value={content.mockup_rule_badge}
            onChange={(v) => set('mockup_rule_badge', v)}
          />
          <TextField
            label="Template Name"
            value={content.mockup_template_name}
            onChange={(v) => set('mockup_template_name', v)}
          />
          <TextField
            label="Template Details"
            value={content.mockup_template_meta}
            onChange={(v) => set('mockup_template_meta', v)}
          />
          <TextField
            label="Trigger Line"
            value={content.mockup_trigger}
            onChange={(v) => set('mockup_trigger', v)}
            className="md:col-span-2"
          />
          <TextField
            label="Bubble Sender"
            value={content.bubble_sender}
            onChange={(v) => set('bubble_sender', v)}
          />
          <TextField
            label="Bubble Time"
            value={content.bubble_time}
            onChange={(v) => set('bubble_time', v)}
          />
          <TextField
            label="Bubble Message"
            value={content.bubble_text}
            onChange={(v) => set('bubble_text', v)}
            rows={2}
            className="md:col-span-2"
          />
          <TextField
            label="Bubble Status"
            value={content.bubble_status}
            onChange={(v) => set('bubble_status', v)}
          />
          <div className="hidden md:block" />
          <TextField
            label="Footer (Left)"
            value={content.mockup_footer_left}
            onChange={(v) => set('mockup_footer_left', v)}
          />
          <TextField
            label="Footer (Right)"
            value={content.mockup_footer_right}
            onChange={(v) => set('mockup_footer_right', v)}
          />
        </div>
      </EditorCard>

      <EditorCard
        title="Section Headings"
        icon={<Layers className="h-5 w-5 text-emerald-500" />}
        description="Eyebrow, heading and subtitle above the feature cards, the steps and the FAQs."
        actions={
          <ResetButton
            onClick={() =>
              reset(
                'features_eyebrow',
                'features_heading',
                'features_subtitle',
                'steps_eyebrow',
                'steps_heading',
                'steps_subtitle',
                'faq_eyebrow',
                'faq_heading',
                'faq_subtitle'
              )
            }
          />
        }
      >
        <div className="space-y-6">
          {(
            [
              ['Capabilities', 'features'],
              ['Workflow', 'steps'],
              ['FAQ', 'faq'],
            ] as const
          ).map(([label, prefix]) => (
            <div
              key={prefix}
              className="grid grid-cols-1 gap-4 rounded-lg border border-slate-100 p-4 md:grid-cols-3"
            >
              <TextField
                label={`${label} Eyebrow`}
                value={content[`${prefix}_eyebrow`]}
                onChange={(v) => set(`${prefix}_eyebrow`, v)}
              />
              <TextField
                label={`${label} Heading`}
                value={content[`${prefix}_heading`]}
                onChange={(v) => set(`${prefix}_heading`, v)}
                className="md:col-span-2"
              />
              <TextField
                label={`${label} Subtitle`}
                value={content[`${prefix}_subtitle`]}
                onChange={(v) => set(`${prefix}_subtitle`, v)}
                rows={2}
                className="md:col-span-3"
              />
            </div>
          ))}
        </div>
      </EditorCard>

      <EditorCard
        title="CTA Banner & Footer"
        icon={<FileText className="h-5 w-5 text-emerald-500" />}
        description="The dark banner at the bottom and the trademark line. The primary banner button always links to the hero's primary CTA link."
        actions={
          <ResetButton
            onClick={() =>
              reset(
                'cta_heading',
                'cta_body',
                'cta_primary_text',
                'cta_secondary_text',
                'cta_secondary_url',
                'trademark_note',
                'privacy_link_text',
                'terms_link_text'
              )
            }
          />
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Banner Headline"
            value={content.cta_heading}
            onChange={(v) => set('cta_heading', v)}
            className="md:col-span-2"
          />
          <TextField
            label="Banner Description"
            value={content.cta_body}
            onChange={(v) => set('cta_body', v)}
            rows={2}
            className="md:col-span-2"
          />
          <TextField
            label="Primary Button Text"
            value={content.cta_primary_text}
            onChange={(v) => set('cta_primary_text', v)}
            hint="Leave empty to reuse the hero's primary button text."
            className="md:col-span-2"
          />
          <TextField
            label="Secondary Button Text"
            value={content.cta_secondary_text}
            onChange={(v) => set('cta_secondary_text', v)}
          />
          <TextField
            label="Secondary Button Link"
            value={content.cta_secondary_url}
            onChange={(v) => set('cta_secondary_url', v)}
            placeholder="/contact"
          />
          <TextField
            label="Trademark Note"
            value={content.trademark_note}
            onChange={(v) => set('trademark_note', v)}
            rows={2}
            className="md:col-span-2"
          />
          <TextField
            label="Privacy Link Text"
            value={content.privacy_link_text}
            onChange={(v) => set('privacy_link_text', v)}
          />
          <TextField
            label="Terms Link Text"
            value={content.terms_link_text}
            onChange={(v) => set('terms_link_text', v)}
          />
        </div>
      </EditorCard>

      <EditorCard
        title="Add-on Privacy & Terms Page Headers"
        icon={<Shield className="h-5 w-5 text-emerald-500" />}
        description="Header text and SEO of /integrations/google-sheets/privacy and /terms. The documents themselves are on their own tabs."
        actions={
          <ResetButton
            onClick={() =>
              reset(
                'privacy_doc',
                'terms_doc',
                'legal_back_link_text',
                'legal_revised_label',
                'legal_applies_to'
              )
            }
          />
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TextField
              label="Back Link Text"
              value={content.legal_back_link_text}
              onChange={(v) => set('legal_back_link_text', v)}
            />
            <TextField
              label="Revised Label"
              value={content.legal_revised_label}
              onChange={(v) => set('legal_revised_label', v)}
            />
            <TextField
              label="Applies To"
              value={content.legal_applies_to}
              onChange={(v) => set('legal_applies_to', v)}
            />
          </div>
          <div className="rounded-lg border border-slate-100 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Privacy Policy page
            </h3>
            {docFields('privacy_doc')}
          </div>
          <div className="rounded-lg border border-slate-100 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Terms of Service page
            </h3>
            {docFields('terms_doc')}
          </div>
        </div>
      </EditorCard>
    </div>
  );
}
