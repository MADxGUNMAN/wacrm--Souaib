'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import {
  decodeCsvBytes,
  parseContactCsv,
  type ParsedContactRow,
} from '@/lib/contacts/parse-contact-csv';
import {
  assignImportedContactTags,
  resolveImportTagIds,
  type ContactTagAssignment,
} from '@/lib/contacts/resolve-import-tags';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Tag,
  Download,
  Sparkles,
} from 'lucide-react';
import { downloadSampleCsv } from '@/lib/contacts/sample-csv';
import { useTranslations } from 'next-intl';

const DEFAULT_TAG_COLOR = '#3b82f6';
const PREVIEW_LIMIT = 5;

type ImportPhase = 'checking' | 'contacts' | 'tags' | 'customFields';

interface ImportProgress {
  phase: ImportPhase;
  /** Units finished in this phase (rows, tag pairs or field values). */
  done: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
}

function ImportProgressPanel({ progress }: { progress: ImportProgress }) {
  const t = useTranslations('Contacts.importModal');
  const { phase, done, total, imported, skipped, failed } = progress;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const label = {
    checking: t('progressChecking'),
    contacts: t('progressContacts'),
    tags: t('progressTags'),
    customFields: t('progressCustomFields'),
  }[phase];

  return (
    <div
      className="border-border bg-background/50 space-y-3 rounded-xl border p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-popover-foreground flex items-center gap-1.5 font-medium">
          <Loader2 className="text-primary size-3.5 animate-spin" />
          {label}
        </span>
        {total > 0 && (
          <span className="text-muted-foreground tabular-nums">
            {t('progressCount', {
              done: done.toLocaleString(),
              total: total.toLocaleString(),
            })}{' '}
            · {pct}%
          </span>
        )}
      </div>
      <div
        className="bg-border h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
        <span className="text-primary">
          {t('resultImported', { count: imported.toLocaleString() })}
        </span>
        {phase === 'contacts' && total - done > 0 && (
          <span className="text-muted-foreground">
            {t('progressRemaining', {
              count: (total - done).toLocaleString(),
            })}
          </span>
        )}
        {skipped > 0 && (
          <span className="text-amber-400">
            {t('progressSkipped', { count: skipped.toLocaleString() })}
          </span>
        )}
        {failed > 0 && (
          <span className="text-red-400">
            {t('resultFailed', { count: failed.toLocaleString() })}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-[11px]">
        {t('progressKeepOpen')}
      </p>
    </div>
  );
}

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  return `${base.slice(0, Math.max(keep, 12))}…${ext}`;
}

function PreviewCell({
  value,
  mono,
  maxWidth = 'max-w-[9rem]',
}: {
  value: string;
  mono?: boolean;
  maxWidth?: string;
}) {
  return (
    <span
      className={cn(
        'block truncate',
        maxWidth,
        mono && 'font-mono text-[11px]'
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function ImportPreviewTags({
  tagNames,
  tagColorByKey,
}: {
  tagNames: string[];
  tagColorByKey: Map<string, string>;
}) {
  const t = useTranslations('Contacts.importModal');

  if (tagNames.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-[4.5rem] flex-wrap gap-1">
      {tagNames.map((name) => {
        const color =
          tagColorByKey.get(name.trim().toLowerCase()) ?? DEFAULT_TAG_COLOR;
        const isKnown = tagColorByKey.has(name.trim().toLowerCase());
        return (
          <span
            key={name}
            className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-none font-medium"
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}${isKnown ? '55' : '30'}`,
            }}
            title={isKnown ? name : t('willBeCreated', { name })}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportModal({
  open,
  onOpenChange,
  onImported,
}: ImportModalProps) {
  const t = useTranslations('Contacts.importModal');
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);
  const [hasTagsColumn, setHasTagsColumn] = useState(false);
  const [hasCompanyColumn, setHasCompanyColumn] = useState(false);
  const [customFieldColumns, setCustomFieldColumns] = useState<string[]>([]);
  const [tagColorByKey, setTagColorByKey] = useState<Map<string, string>>(
    new Map()
  );
  const [parseStats, setParseStats] = useState<{
    emptyPhoneRows: number;
    invalidPhones: string[];
  }>({ emptyPhoneRows: 0, invalidPhones: [] });
  const [importing, setImporting] = useState(false);
  /** Live status while an import runs (null when idle). */
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    /** Imported numbers the sheet gave without a "+" country code. */
    noCountryCode: number;
    failed: number;
    tagsAssigned: number;
    customFieldsCreated: number;
    customValuesAssigned: number;
  } | null>(null);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setHasTagsColumn(false);
    setHasCompanyColumn(false);
    setCustomFieldColumns([]);
    setTagColorByKey(new Map());
    setParseStats({ emptyPhoneRows: 0, invalidPhones: [] });
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Warn before a tab close/refresh would abandon a running import.
  useEffect(() => {
    if (!importing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [importing]);

  function handleOpenChange(next: boolean) {
    // Closing mid-import would reset the file state while inserts are
    // still running, leaving the user with no result to look at.
    if (!next && importing) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);

    const text = decodeCsvBytes(await selected.arrayBuffer());
    const {
      rows,
      hasTagsColumn: csvHasTags,
      hasCompanyColumn: csvHasCompany,
      customFieldColumns: detectedCustomCols,
      emptyPhoneRows,
      invalidPhones,
    } = parseContactCsv(text);
    setParseStats({ emptyPhoneRows, invalidPhones });

    if (rows.length === 0) {
      toast.error(t('toastNoValidRows'));
      setParsedRows([]);
      setHasTagsColumn(false);
      setHasCompanyColumn(false);
      setCustomFieldColumns([]);
      setTagColorByKey(new Map());
      return;
    }

    setParsedRows(rows);
    setHasTagsColumn(csvHasTags);
    setHasCompanyColumn(csvHasCompany);
    setCustomFieldColumns(detectedCustomCols);

    if (csvHasTags && accountId) {
      const { data: tags } = await supabase
        .from('tags')
        .select('name, color')
        .eq('account_id', accountId);

      const colors = new Map<string, string>();
      for (const tag of tags ?? []) {
        const key = tag.name.trim().toLowerCase();
        if (!colors.has(key)) colors.set(key, tag.color);
      }
      setTagColorByKey(colors);
    } else {
      setTagColorByKey(new Map());
    }
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');
      if (!accountId)
        throw new Error('Your profile is not linked to an account.');

      let imported = 0;
      let skipped = 0;
      let noCountryCode = 0;
      let failed = 0;
      const total = parsedRows.length;
      const report = (
        phase: ImportPhase,
        done: number,
        phaseTotal: number = total
      ) =>
        setProgress({
          phase,
          done,
          total: phaseTotal,
          imported,
          skipped,
          failed,
        });

      // 1) De-dupe within the file by normalized phone (keep first).
      const { unique, duplicates: inFileDupes } = dedupeByPhone(parsedRows);
      skipped += inFileDupes;
      report('checking', skipped);

      // 2) Skip numbers already in this account. One read of the
      //    generated `phone_normalized` column (migration 022) → Set.
      //    Paged: PostgREST caps a response at 1,000 rows, so a single
      //    read would miss existing numbers in larger accounts.
      const existing = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data: page, error: pageErr } = await supabase
          .from('contacts')
          .select('phone_normalized')
          .eq('account_id', accountId)
          .order('id')
          .range(from, from + 999);
        if (pageErr) throw pageErr;
        for (const r of page ?? []) {
          const p = (r as { phone_normalized: string | null }).phone_normalized;
          if (p) existing.add(p);
        }
        if (!page || page.length < 1000) break;
      }

      const toInsert = unique.filter((row) => {
        if (existing.has(normalizeKey(row.phone))) {
          skipped++;
          return false;
        }
        return true;
      });
      report('checking', skipped);

      // 3) Resolve tag names → ids (admin+ may auto-create missing tags).
      //    Skip the round-trip when the import carries no tag names.
      const allTagNames = toInsert.flatMap((row) => row.tagNames);
      let tagIdByKey = new Map<string, string>();
      let skippedNames: string[] = [];
      if (allTagNames.length > 0) {
        ({ tagIdByKey, skippedNames } = await resolveImportTagIds(supabase, {
          accountId,
          userId: user.id,
          tagNames: allTagNames,
          canCreateTags: canEditSettings,
        }));
      }

      // 3.5) Resolve custom field names → ids (auto-create missing custom_fields).
      const allCustomFieldNames = Array.from(
        new Set(
          toInsert.flatMap((row) =>
            row.customFields ? Object.keys(row.customFields) : []
          )
        )
      );

      const customFieldIdByName = new Map<string, string>();
      let customFieldsCreated = 0;

      if (allCustomFieldNames.length > 0) {
        const { data: existingFields } = await supabase
          .from('custom_fields')
          .select('id, field_name')
          .eq('account_id', accountId);

        const existingMap = new Map<string, string>();
        for (const f of existingFields ?? []) {
          existingMap.set(f.field_name.trim().toLowerCase(), f.id);
        }

        const missing = allCustomFieldNames.filter(
          (name) => !existingMap.has(name.trim().toLowerCase())
        );

        if (missing.length > 0) {
          const toCreate = missing.map((name) => ({
            account_id: accountId,
            user_id: user.id,
            field_name: name.trim(),
            field_type: 'text',
          }));

          const { data: createdFields } = await supabase
            .from('custom_fields')
            .insert(toCreate)
            .select('id, field_name');

          for (const f of createdFields ?? []) {
            existingMap.set(f.field_name.trim().toLowerCase(), f.id);
            customFieldsCreated++;
          }
        }

        for (const name of allCustomFieldNames) {
          const id = existingMap.get(name.trim().toLowerCase());
          if (id) {
            customFieldIdByName.set(name.trim().toLowerCase(), id);
          }
        }
      }

      const tagAssignments: ContactTagAssignment[] = [];
      const customValueAssignments: {
        contact_id: string;
        custom_field_id: string;
        value: string;
      }[] = [];

      // 4) Batch insert the genuinely-new rows in chunks of 50. The DB
      //    unique index is the backstop: a 23505 (race, or a format
      //    that normalizes equal) counts as skipped, not failed.
      const chunkSize = 50;
      // Rows already settled before any insert (in-file + existing dupes).
      const preSkipped = skipped;
      report('contacts', preSkipped);

      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const rows = chunk.map((row) => ({
          user_id: user.id,
          account_id: accountId,
          phone: row.phone,
          name: row.name || null,
          email: row.email || null,
          company: row.company || null,
          source: 'import' as const,
        }));

        const { data, error } = await supabase
          .from('contacts')
          .insert(rows)
          .select('id');

        if (error) {
          // Retry individually so one bad/duplicate row doesn't sink
          // the whole chunk.
          for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const source = chunk[j];
            const { data: singleData, error: singleErr } = await supabase
              .from('contacts')
              .insert(row)
              .select('id')
              .single();

            if (!singleErr && singleData) {
              imported++;
              if (!source.hasCountryCode) noCountryCode++;
              if (source.tagNames.length > 0) {
                tagAssignments.push({
                  contactId: singleData.id,
                  tagNames: source.tagNames,
                });
              }
              if (source.customFields) {
                for (const [name, val] of Object.entries(source.customFields)) {
                  const fieldId = customFieldIdByName.get(
                    name.trim().toLowerCase()
                  );
                  if (fieldId && val) {
                    customValueAssignments.push({
                      contact_id: singleData.id,
                      custom_field_id: fieldId,
                      value: val,
                    });
                  }
                }
              }
            } else if (isUniqueViolation(singleErr)) {
              skipped++;
            } else {
              failed++;
            }
          }
        } else {
          const inserted = data ?? [];
          imported += inserted.length;
          // inserted[j] ↔ chunk[j] only holds because a single INSERT
          // preserves RETURNING order.
          for (let j = 0; j < inserted.length; j++) {
            const source = chunk[j];
            if (!source) continue;
            if (!source.hasCountryCode) noCountryCode++;
            if (source.tagNames.length > 0) {
              tagAssignments.push({
                contactId: inserted[j].id,
                tagNames: source.tagNames,
              });
            }
            if (source.customFields) {
              for (const [name, val] of Object.entries(source.customFields)) {
                const fieldId = customFieldIdByName.get(
                  name.trim().toLowerCase()
                );
                if (fieldId && val) {
                  customValueAssignments.push({
                    contact_id: inserted[j].id,
                    custom_field_id: fieldId,
                    value: val,
                  });
                }
              }
            }
          }
        }

        report('contacts', preSkipped + i + chunk.length);
      }

      // 5) Wire tags onto the contacts we just created.
      let tagsAssigned = 0;
      if (tagAssignments.length > 0) {
        report('tags', 0, 0);
        try {
          tagsAssigned = await assignImportedContactTags(
            supabase,
            tagAssignments,
            tagIdByKey,
            (done, pairs) => report('tags', done, pairs)
          );
        } catch {
          toast.warning(t('toastTagsWarning'));
        }
      }

      // 5.5) Insert custom field values in chunks of 100.
      let customValuesAssigned = 0;
      if (customValueAssignments.length > 0) {
        const cvTotal = customValueAssignments.length;
        report('customFields', 0, cvTotal);
        for (let i = 0; i < cvTotal; i += 100) {
          const chunk = customValueAssignments.slice(i, i + 100);
          const { error: cvErr } = await supabase
            .from('contact_custom_values')
            .insert(chunk);
          if (!cvErr) {
            customValuesAssigned += chunk.length;
          }
          report('customFields', Math.min(i + 100, cvTotal), cvTotal);
        }
      }

      setResult({
        imported,
        skipped,
        noCountryCode,
        failed,
        tagsAssigned,
        customFieldsCreated,
        customValuesAssigned,
      });

      if (imported > 0) {
        toast.success(t('toastImported', { count: imported }));
        onImported();
      }
      if (tagsAssigned > 0) {
        toast.success(t('toastTagsAssigned', { count: tagsAssigned }));
      }
      if (customValuesAssigned > 0) {
        toast.success(t('resultCustomValues', { count: customValuesAssigned }));
      }
      if (skippedNames.length > 0) {
        const sample = skippedNames.slice(0, 3).join(', ');
        const more =
          skippedNames.length > 3 ? ` (+${skippedNames.length - 3} more)` : '';
        toast.info(t('toastTagsSkipped', { sample, more }));
      }
      if (skipped > 0) {
        toast.info(t('toastSkipped', { count: skipped }));
      }
      if (failed > 0) {
        toast.error(t('toastFailed', { count: failed }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(message);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  const preview = parsedRows.slice(0, PREVIEW_LIMIT);
  // Tags: OR — show when the CSV declares a column or preview rows carry values.
  const previewHasTags =
    hasTagsColumn || preview.some((row) => row.tagNames.length > 0);
  // Company: AND — hide unless the CSV declares it and preview has data.
  const previewHasCompany =
    hasCompanyColumn && preview.some((row) => row.company?.trim());

  const tagStats = useMemo(() => {
    const names = new Set<string>();
    let rowsWithTags = 0;
    for (const row of parsedRows) {
      if (row.tagNames.length === 0) continue;
      rowsWithTags++;
      for (const name of row.tagNames) names.add(name.trim().toLowerCase());
    }
    return { unique: names.size, rowsWithTags };
  }, [parsedRows]);

  const noCountryCodeRows = useMemo(
    () => parsedRows.filter((row) => !row.hasCountryCode).length,
    [parsedRows]
  );

  // Rows the file had that won't be imported, plus numbers to double-check.
  const phoneNotices = (
    <>
      {parseStats.emptyPhoneRows > 0 && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
          {t('noticeEmptyPhone', { count: parseStats.emptyPhoneRows })}
        </p>
      )}
      {parseStats.invalidPhones.length > 0 && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
          {t('noticeInvalidPhone', {
            count: parseStats.invalidPhones.length,
            sample: parseStats.invalidPhones.slice(0, 3).join(', '),
          })}
        </p>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="border-border bg-popover text-popover-foreground flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl"
        aria-describedby="import-modal-desc"
      >
        <div className="border-border/80 shrink-0 space-y-4 border-b p-6 pb-4">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-popover-foreground text-lg">
              {t('title')}
            </DialogTitle>
            <DialogDescription
              id="import-modal-desc"
              className="text-muted-foreground leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: t.markup('desc', {
                  phoneCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  nameCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  emailCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  companyCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  tagsCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                }),
              }}
            />
          </DialogHeader>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                fileInputRef.current?.click();
            }}
            className={cn(
              'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 transition-all',
              file
                ? 'border-primary/35 bg-primary/[0.04]'
                : 'hover:border-primary/40 border-border/80 bg-background/40 hover:bg-background/70'
            )}
          >
            {file ? (
              <>
                <div className="bg-primary/15 ring-primary/25 flex size-10 items-center justify-center rounded-lg ring-1">
                  <FileText className="text-primary size-5" />
                </div>
                <p
                  className="text-popover-foreground max-w-full truncate px-2 text-sm font-medium"
                  title={file.name}
                >
                  {truncateFilename(file.name)}
                </p>
                <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                  {t('rowsReady', { count: parsedRows.length })}
                </span>
              </>
            ) : (
              <>
                <div className="bg-muted/80 ring-border/80 group-hover:bg-muted flex size-10 items-center justify-center rounded-lg ring-1 transition-colors">
                  <Upload className="text-muted-foreground group-hover:text-foreground size-5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  {t('uploadDropzone')}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {t('uploadHint')}
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              downloadSampleCsv();
            }}
            className="text-primary hover:bg-primary/10 hover:text-primary flex items-center gap-1.5 self-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <Download className="size-3.5" />
            {t('downloadSample')}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {importing && progress && <ImportProgressPanel progress={progress} />}

          {preview.length > 0 && !result && !importing && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                  {t('preview', { count: preview.length })}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tagStats.rowsWithTags > 0 && (
                    <span className="bg-muted/90 text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]">
                      <Tag className="text-primary/80 size-3" />
                      {t('previewTags', {
                        tags: tagStats.unique,
                        contacts: tagStats.rowsWithTags,
                      })}
                    </span>
                  )}
                  {customFieldColumns.length > 0 && (
                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium">
                      <Sparkles className="size-3" />
                      {customFieldColumns.length} custom field
                      {customFieldColumns.length > 1 ? 's' : ''} detected
                    </span>
                  )}
                </div>
              </div>

              <div className="border-border ring-border/50 overflow-hidden rounded-xl border ring-1">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-xs">
                    <thead>
                      <tr className="border-border bg-background/60 border-b">
                        <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                          {t('columns.phone')}
                        </th>
                        <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                          {t('columns.name')}
                        </th>
                        <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                          {t('columns.email')}
                        </th>
                        {previewHasCompany && (
                          <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                            {t('columns.company')}
                          </th>
                        )}
                        {previewHasTags && (
                          <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                            {t('columns.tags')}
                          </th>
                        )}
                        {customFieldColumns.map((col) => (
                          <th
                            key={col}
                            className="text-primary px-3 py-2 text-left font-medium whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-border/70 divide-y">
                      {preview.map((row, i) => (
                        <tr
                          key={i}
                          className="bg-popover/40 hover:bg-muted/30 transition-colors"
                        >
                          <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                            <PreviewCell
                              value={row.phone}
                              mono
                              maxWidth="max-w-[7.5rem]"
                            />
                          </td>
                          <td className="text-popover-foreground px-3 py-2">
                            <PreviewCell
                              value={row.name || '—'}
                              maxWidth="max-w-[8.5rem]"
                            />
                          </td>
                          <td className="text-muted-foreground px-3 py-2">
                            <PreviewCell
                              value={row.email || '—'}
                              maxWidth="max-w-[10rem]"
                            />
                          </td>
                          {previewHasCompany && (
                            <td className="text-muted-foreground px-3 py-2">
                              <PreviewCell
                                value={row.company || '—'}
                                maxWidth="max-w-[7rem]"
                              />
                            </td>
                          )}
                          {previewHasTags && (
                            <td className="px-3 py-2 align-top">
                              <ImportPreviewTags
                                tagNames={row.tagNames}
                                tagColorByKey={tagColorByKey}
                              />
                            </td>
                          )}
                          {customFieldColumns.map((col) => (
                            <td
                              key={col}
                              className="text-popover-foreground px-3 py-2"
                            >
                              <PreviewCell
                                value={row.customFields?.[col] || '—'}
                                maxWidth="max-w-[8rem]"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedRows.length > PREVIEW_LIMIT && (
                <p className="text-muted-foreground text-center text-[11px]">
                  {t('moreRows', { count: parsedRows.length - PREVIEW_LIMIT })}
                </p>
              )}

              <div className="space-y-1.5">
                {noCountryCodeRows > 0 && (
                  <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    {t('noticeNoCountryCode', { count: noCountryCodeRows })}
                  </p>
                )}
                {phoneNotices}
              </div>
            </div>
          )}

          {result && (
            <div className="border-border bg-background/50 rounded-xl border p-4">
              <p className="text-popover-foreground text-sm font-medium">
                {t('importComplete')}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {result.imported > 0 && (
                  <div className="text-primary flex items-center gap-1.5 text-sm">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultImported', { count: result.imported })}
                  </div>
                )}
                {result.tagsAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-cyan-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultTags', { count: result.tagsAssigned })}
                  </div>
                )}
                {result.customValuesAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultCustomValues', {
                      count: result.customValuesAssigned,
                    })}
                  </div>
                )}
                {result.customFieldsCreated > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-purple-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultCustomFields', {
                      count: result.customFieldsCreated,
                    })}
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-400">
                    <AlertTriangle className="size-4 shrink-0" />
                    {t('resultSkipped', { count: result.skipped })}
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-400">
                    <XCircle className="size-4 shrink-0" />
                    {t('resultFailed', { count: result.failed })}
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                {result.noCountryCode > 0 && (
                  <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    {t('resultNoCountryCode', { count: result.noCountryCode })}
                  </p>
                )}
                {phoneNotices}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-border/80 bg-background/50 mt-0 shrink-0 gap-2 border-t px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {result ? t('close') : t('cancel')}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing}
              onClick={handleImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              {importing
                ? t('importingBtn')
                : t('importBtn', { count: parsedRows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
