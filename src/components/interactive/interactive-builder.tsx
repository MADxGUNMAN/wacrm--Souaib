'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CornerDownLeft,
  ExternalLink,
  Info,
  ListFilter,
  MessageSquareReply,
  Plus,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { slugify } from '@/components/flows/shared';
import { INTERACTIVE_LIMITS } from '@/lib/whatsapp/meta-api';
import {
  validateInteractivePayload,
  type InteractiveButtonsPayload,
  type InteractiveCtaUrlPayload,
  type InteractiveListPayload,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';
import { InteractivePreview } from './interactive-preview';

// ------------------------------------------------------------
// Blank payload factories — used to seed a fresh builder and to
// switch kind without losing the shared body/header/footer.
// ------------------------------------------------------------

/**
 * Generate an id that doesn't collide with any already in use. A plain
 * count-based id (`btn_${length+1}`) regenerates an existing id after a
 * middle item is removed, which then trips the duplicate-id validator and
 * silently blocks sending. Increment past any taken id instead.
 */
function nextId(existing: string[], prefix: string): string {
  const taken = new Set(existing);
  let n = existing.length + 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function blankButtonsPayload(): InteractiveButtonsPayload {
  return {
    kind: 'buttons',
    body: '',
    buttons: [{ id: 'btn_1', title: '' }],
  };
}

export function blankListPayload(): InteractiveListPayload {
  return {
    kind: 'list',
    body: '',
    button_label: 'Menu',
    sections: [{ title: '', rows: [{ id: 'row_1', title: '' }] }],
  };
}

export function blankCtaUrlPayload(): InteractiveCtaUrlPayload {
  return { kind: 'cta_url', body: '', button_label: '', url: '' };
}

export interface InteractiveBuilderProps {
  value: InteractiveMessagePayload;
  onChange: (payload: InteractiveMessagePayload) => void;
  /** Show the live WhatsApp-style preview beside the form. Default true. */
  showPreview?: boolean;
}

/**
 * Controlled builder for a WhatsApp interactive message (reply buttons,
 * list menu, or link CTA). Enforces Meta's char limits inline with real-time
 * validation and a live authentic WhatsApp preview.
 */
export function InteractiveBuilder({
  value,
  onChange,
  showPreview = true,
}: InteractiveBuilderProps) {
  const [advanced, setAdvanced] = useState(false);
  const [touched, setTouched] = useState(false);
  const validation = validateInteractivePayload(value);

  const setField = (patch: Partial<InteractiveMessagePayload>) => {
    setTouched(true);
    onChange({ ...value, ...patch } as InteractiveMessagePayload);
  };

  const switchKind = (kind: InteractiveMessagePayload['kind']) => {
    if (kind === value.kind) return;
    const shared = {
      body: value.body,
      header: value.header,
      footer: value.footer,
    };
    onChange(
      kind === 'buttons'
        ? { ...blankButtonsPayload(), ...shared }
        : kind === 'cta_url'
          ? { ...blankCtaUrlPayload(), ...shared }
          : { ...blankListPayload(), ...shared }
    );
  };

  // Show validation warning only once the user has started editing or entered body
  const showValidationWarning = touched || value.body.trim().length > 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Left Column: Interactive Message Builder Form */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* Kind selector tabs */}
        <div className="space-y-2">
          <div className="border-border/70 bg-muted/50 grid grid-cols-3 gap-1.5 rounded-xl border p-1.5">
            <KindTab
              active={value.kind === 'buttons'}
              onClick={() => switchKind('buttons')}
              icon={MessageSquareReply}
              title="Reply buttons"
              badge="Max 3"
            />
            <KindTab
              active={value.kind === 'list'}
              onClick={() => switchKind('list')}
              icon={ListFilter}
              title="List menu"
              badge="Max 10"
            />
            <KindTab
              active={value.kind === 'cta_url'}
              onClick={() => switchKind('cta_url')}
              icon={ExternalLink}
              title="Link button"
              badge="Web CTA"
            />
          </div>

          {/* Contextual guidance tip for the chosen kind */}
          <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
            <Info className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="leading-relaxed">
              {value.kind === 'buttons' && (
                <>
                  <strong className="text-foreground">Reply Buttons:</strong>{' '}
                  Send up to 3 quick-tap response buttons. When tapped, the
                  chosen option is sent back as a message.
                </>
              )}
              {value.kind === 'list' && (
                <>
                  <strong className="text-foreground">List Menu:</strong> Opens
                  a structured menu with sections and descriptions (up to 10
                  rows). Ideal for catalogs or navigation.
                </>
              )}
              {value.kind === 'cta_url' && (
                <>
                  <strong className="text-foreground">Link Button:</strong> A
                  Call-To-Action button that opens an external website or
                  booking link in the customer&apos;s browser.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Message Content Group (Header -> Body -> Footer) */}
        <div className="border-border/80 bg-card/50 space-y-3.5 rounded-xl border p-4 shadow-xs">
          <div className="border-border/60 border-b pb-2">
            <h3 className="text-foreground/80 text-xs font-semibold tracking-wider uppercase">
              Message Content
            </h3>
            <p className="text-muted-foreground text-[11px]">
              Configure what customers see on WhatsApp in natural reading order.
            </p>
          </div>

          {/* 1. Header (Optional) — placed at top where it visually belongs */}
          <Field
            label="Header"
            badge="Optional"
            counter={`${(value.header ?? '').length}/${INTERACTIVE_LIMITS.headerTextMaxLength}`}
            helperText="Bold title displayed at the top of the message."
          >
            <Input
              value={value.header ?? ''}
              maxLength={INTERACTIVE_LIMITS.headerTextMaxLength}
              onChange={(e) => setField({ header: e.target.value })}
              placeholder="e.g. Special Offer or Order Update"
              className="bg-background text-foreground"
            />
          </Field>

          {/* 2. Message Body (Required) */}
          <Field
            label="Message body"
            badge="Required"
            counter={`${value.body.length}/${INTERACTIVE_LIMITS.bodyMaxLength}`}
            helperText="The primary text of your message."
          >
            <Textarea
              value={value.body}
              maxLength={INTERACTIVE_LIMITS.bodyMaxLength}
              onChange={(e) => setField({ body: e.target.value })}
              placeholder="What the customer reads above the interactive options…"
              className="bg-background text-foreground min-h-[100px] resize-y text-sm leading-relaxed"
            />
          </Field>

          {/* 3. Footer (Optional) — placed directly below body */}
          <Field
            label="Footer text"
            badge="Optional"
            counter={`${(value.footer ?? '').length}/${INTERACTIVE_LIMITS.footerMaxLength}`}
            helperText="Small subtext shown underneath the message body."
          >
            <Input
              value={value.footer ?? ''}
              maxLength={INTERACTIVE_LIMITS.footerMaxLength}
              onChange={(e) => setField({ footer: e.target.value })}
              placeholder="e.g. Reply STOP to opt out or Terms apply"
              className="bg-background text-foreground text-xs"
            />
          </Field>
        </div>

        {/* Action Items Section (Buttons, List, or CTA URL) */}
        <div className="border-border/80 bg-card/50 space-y-3.5 rounded-xl border p-4 shadow-xs">
          {value.kind === 'buttons' ? (
            <ButtonsEditor
              value={value}
              onChange={(p) => {
                setTouched(true);
                onChange(p);
              }}
              advanced={advanced}
            />
          ) : value.kind === 'cta_url' ? (
            <CtaUrlEditor
              value={value}
              onChange={(p) => {
                setTouched(true);
                onChange(p);
              }}
            />
          ) : (
            <ListEditor
              value={value}
              onChange={(p) => {
                setTouched(true);
                onChange(p);
              }}
              advanced={advanced}
            />
          )}
        </div>

        {/* Advanced Reply IDs toggle */}
        {value.kind !== 'cta_url' && (
          <div className="border-border/60 bg-muted/30 flex items-center justify-between rounded-lg border px-3.5 py-2.5">
            <label className="text-foreground flex cursor-pointer items-center gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={advanced}
                onChange={(e) => setAdvanced(e.target.checked)}
                className="accent-primary h-4 w-4 rounded"
              />
              <span className="font-medium">
                Show custom reply IDs (advanced)
              </span>
            </label>
            <span className="text-muted-foreground text-[11px]">
              For webhook & automation flow routing
            </span>
          </div>
        )}

        {/* Validation error display */}
        {showValidationWarning && !validation.ok && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium">{validation.error}</span>
          </div>
        )}
      </div>

      {/* Right Column: Live Smartphone WhatsApp Preview */}
      {showPreview && (
        <div className="flex w-full shrink-0 flex-col gap-2 lg:sticky lg:top-0 lg:w-[320px]">
          <div className="flex items-center justify-between px-1">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Live Preview
            </span>
            <span className="text-muted-foreground text-[10px]">
              Customer Handset View
            </span>
          </div>
          <InteractivePreview payload={value} showCanvas={true} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Kind selector tab button
// ------------------------------------------------------------

function KindTab({
  active,
  onClick,
  icon: Icon,
  title,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-center transition-all sm:flex-row sm:gap-2 sm:py-2',
        active
          ? 'border-border/80 bg-background text-primary border font-semibold shadow-xs'
          : 'text-muted-foreground hover:bg-background/40 hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          active ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      <span className="text-xs">{title}</span>
      <span
        className={cn(
          'hidden rounded-full px-1.5 py-0.5 text-[9px] font-medium sm:inline-block',
          active
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {badge}
      </span>
    </button>
  );
}

// ------------------------------------------------------------
// Buttons editor
// ------------------------------------------------------------

function ButtonsEditor({
  value,
  onChange,
  advanced,
}: {
  value: InteractiveButtonsPayload;
  onChange: (p: InteractiveMessagePayload) => void;
  advanced: boolean;
}) {
  const buttons = value.buttons;
  const update = (
    idx: number,
    patch: Partial<InteractiveButtonsPayload['buttons'][number]>
  ) =>
    onChange({
      ...value,
      buttons: buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    });
  const add = () =>
    onChange({
      ...value,
      buttons: [
        ...buttons,
        {
          id: nextId(
            buttons.map((b) => b.id),
            'btn_'
          ),
          title: '',
        },
      ],
    });
  const remove = (idx: number) =>
    onChange({ ...value, buttons: buttons.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div className="border-border/60 flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="text-foreground/80 text-xs font-semibold tracking-wider uppercase">
            Reply Buttons
          </h3>
          <p className="text-muted-foreground text-[11px]">
            Configure up to 3 quick reply buttons (max 20 chars each).
          </p>
        </div>
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {buttons.length} / {INTERACTIVE_LIMITS.maxButtons}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {buttons.map((b, i) => (
          <div
            key={i}
            className="border-border/80 bg-background/70 hover:border-border flex flex-col gap-2 rounded-xl border p-2.5 shadow-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              {/* Number pill */}
              <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {i + 1}
              </span>

              {/* Advanced reply ID input */}
              {advanced && (
                <div className="w-28 shrink-0">
                  <Input
                    value={b.id}
                    onChange={(e) =>
                      update(i, { id: slugify(e.target.value, `btn_${i + 1}`) })
                    }
                    placeholder="id"
                    className="bg-muted h-8 font-mono text-xs"
                    title="Unique identifier sent in webhook"
                  />
                </div>
              )}

              {/* Button title input */}
              <div className="relative flex-1">
                <Input
                  value={b.title}
                  maxLength={INTERACTIVE_LIMITS.buttonTitleMaxLength}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder={`Button ${i + 1} label (e.g. Yes, confirm)`}
                  className="bg-muted/40 text-foreground h-8 pr-12 text-sm"
                />
                <span className="text-muted-foreground pointer-events-none absolute top-2 right-2.5 text-[10px]">
                  {b.title.length}/{INTERACTIVE_LIMITS.buttonTitleMaxLength}
                </span>
              </div>

              {/* Remove button */}
              {buttons.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(i)}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                  title="Remove button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {advanced && (
              <p className="text-muted-foreground pl-8 text-[10px]">
                Payload ID:{' '}
                <code className="text-foreground">
                  {b.id || `btn_${i + 1}`}
                </code>
              </p>
            )}
          </div>
        ))}
      </div>

      {buttons.length < INTERACTIVE_LIMITS.maxButtons && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="border-border hover:border-primary/50 hover:bg-primary/5 hover:text-primary w-full border-dashed"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add button ({INTERACTIVE_LIMITS.maxButtons - buttons.length}{' '}
          remaining)
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Link button editor
// ------------------------------------------------------------

function CtaUrlEditor({
  value,
  onChange,
}: {
  value: InteractiveCtaUrlPayload;
  onChange: (p: InteractiveMessagePayload) => void;
}) {
  return (
    <div className="space-y-3.5">
      <div className="border-border/60 border-b pb-2">
        <h3 className="text-foreground/80 text-xs font-semibold tracking-wider uppercase">
          Link Button (Call to Action)
        </h3>
        <p className="text-muted-foreground text-[11px]">
          Configures a button that launches an external URL in the
          customer&apos;s browser.
        </p>
      </div>

      <Field
        label="Button label"
        counter={`${value.button_label.length}/${INTERACTIVE_LIMITS.buttonTitleMaxLength}`}
        helperText="Visible text on the button (e.g. Book a slot or Visit Website)."
      >
        <Input
          value={value.button_label}
          maxLength={INTERACTIVE_LIMITS.buttonTitleMaxLength}
          onChange={(e) => onChange({ ...value, button_label: e.target.value })}
          placeholder="e.g. Book Consultation"
          className="bg-background text-foreground"
        />
      </Field>

      <Field
        label="Website URL"
        helperText="The web destination to open when tapped (must start with http:// or https://)."
      >
        <Input
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder="https://example.com/schedule"
          inputMode="url"
          className="bg-background text-foreground"
        />
      </Field>

      <div className="border-border/60 bg-muted/20 text-muted-foreground flex items-start gap-2 rounded-lg border p-2.5 text-xs">
        <CornerDownLeft className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p className="leading-relaxed">
          WhatsApp permits <strong>one link button</strong> per message. Taps
          open in the customer&apos;s default browser and do not return an
          inbound WhatsApp webhook response.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// List editor
// ------------------------------------------------------------

function ListEditor({
  value,
  onChange,
  advanced,
}: {
  value: InteractiveListPayload;
  onChange: (p: InteractiveMessagePayload) => void;
  advanced: boolean;
}) {
  const sections = value.sections;
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
  const allRowIds = () => sections.flatMap((s) => s.rows.map((r) => r.id));

  const updateSection = (
    sIdx: number,
    patch: Partial<InteractiveListPayload['sections'][number]>
  ) =>
    onChange({
      ...value,
      sections: sections.map((s, i) => (i === sIdx ? { ...s, ...patch } : s)),
    });

  const updateRow = (
    sIdx: number,
    rIdx: number,
    patch: Partial<InteractiveListPayload['sections'][number]['rows'][number]>
  ) =>
    onChange({
      ...value,
      sections: sections.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              rows: s.rows.map((r, j) => (j === rIdx ? { ...r, ...patch } : r)),
            }
          : s
      ),
    });

  const addRow = (sIdx: number) =>
    onChange({
      ...value,
      sections: sections.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              rows: [...s.rows, { id: nextId(allRowIds(), 'row_'), title: '' }],
            }
          : s
      ),
    });

  const removeRow = (sIdx: number, rIdx: number) =>
    onChange({
      ...value,
      sections: sections.map((s, i) =>
        i === sIdx ? { ...s, rows: s.rows.filter((_, j) => j !== rIdx) } : s
      ),
    });

  const addSection = () =>
    onChange({
      ...value,
      sections: [
        ...sections,
        { title: '', rows: [{ id: nextId(allRowIds(), 'row_'), title: '' }] },
      ],
    });

  const removeSection = (sIdx: number) =>
    onChange({ ...value, sections: sections.filter((_, i) => i !== sIdx) });

  return (
    <div className="space-y-3.5">
      <div className="border-border/60 flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="text-foreground/80 text-xs font-semibold tracking-wider uppercase">
            List Menu & Rows
          </h3>
          <p className="text-muted-foreground text-[11px]">
            Group rows into sections (max {INTERACTIVE_LIMITS.maxListRowsTotal}{' '}
            rows total).
          </p>
        </div>
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {totalRows} / {INTERACTIVE_LIMITS.maxListRowsTotal} rows
        </span>
      </div>

      <Field
        label="Menu button label"
        counter={`${value.button_label.length}/${INTERACTIVE_LIMITS.buttonTitleMaxLength}`}
        helperText="The label displayed on the list trigger button."
      >
        <Input
          value={value.button_label}
          maxLength={INTERACTIVE_LIMITS.buttonTitleMaxLength}
          onChange={(e) => onChange({ ...value, button_label: e.target.value })}
          placeholder="e.g. View Services or Select Option"
          className="bg-background text-foreground"
        />
      </Field>

      <div className="space-y-3">
        {sections.map((section, sIdx) => (
          <div
            key={sIdx}
            className="border-border/80 bg-background/50 rounded-xl border p-3 shadow-xs"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <Input
                value={section.title ?? ''}
                onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                placeholder={`Section ${sIdx + 1} title (optional)`}
                className="bg-muted/50 text-foreground h-8 flex-1 text-xs font-medium"
              />
              {sections.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSection(sIdx)}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                  title="Remove section"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {section.rows.map((row, rIdx) => (
                <div
                  key={rIdx}
                  className="border-border/70 bg-card rounded-lg border p-2.5 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    {advanced && (
                      <Input
                        value={row.id}
                        onChange={(e) =>
                          updateRow(sIdx, rIdx, {
                            id: slugify(e.target.value, `row_${rIdx + 1}`),
                          })
                        }
                        placeholder="id"
                        className="bg-muted h-8 w-24 font-mono text-xs"
                        title="Unique row ID"
                      />
                    )}
                    <div className="relative flex-1">
                      <Input
                        value={row.title}
                        maxLength={INTERACTIVE_LIMITS.listRowTitleMaxLength}
                        onChange={(e) =>
                          updateRow(sIdx, rIdx, { title: e.target.value })
                        }
                        placeholder={`Row ${rIdx + 1} title`}
                        className="bg-muted/30 text-foreground h-8 pr-12 text-sm"
                      />
                      <span className="text-muted-foreground pointer-events-none absolute top-2 right-2.5 text-[10px]">
                        {row.title.length}/
                        {INTERACTIVE_LIMITS.listRowTitleMaxLength}
                      </span>
                    </div>
                    {totalRows > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(sIdx, rIdx)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                        title="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={row.description ?? ''}
                    maxLength={INTERACTIVE_LIMITS.listRowDescriptionMaxLength}
                    onChange={(e) =>
                      updateRow(sIdx, rIdx, { description: e.target.value })
                    }
                    placeholder="Description (optional, max 72 chars)"
                    className="bg-muted/20 text-foreground mt-2 h-7 text-xs"
                  />
                </div>
              ))}
            </div>

            {totalRows < INTERACTIVE_LIMITS.maxListRowsTotal && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addRow(sIdx)}
                className="text-primary hover:bg-primary/5 mt-2 text-xs"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add row to section
              </Button>
            )}
          </div>
        ))}
      </div>

      {sections.length < INTERACTIVE_LIMITS.maxListSections &&
        totalRows < INTERACTIVE_LIMITS.maxListRowsTotal && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSection}
            className="w-full border-dashed text-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add new section
          </Button>
        )}
    </div>
  );
}

// ------------------------------------------------------------
// Small presentational helpers
// ------------------------------------------------------------

function Field({
  label,
  badge,
  counter,
  helperText,
  children,
}: {
  label: string;
  badge?: 'Required' | 'Optional';
  counter?: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-foreground/90 text-xs font-semibold">
            {label}
          </label>
          {badge && (
            <span
              className={cn(
                'py-0.2 rounded px-1.5 text-[9px] font-medium tracking-wide',
                badge === 'Required'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {badge}
            </span>
          )}
        </div>
        {counter && (
          <span className="text-muted-foreground text-[10px]">{counter}</span>
        )}
      </div>
      {children}
      {helperText && (
        <p className="text-muted-foreground text-[10.5px]">{helperText}</p>
      )}
    </div>
  );
}
