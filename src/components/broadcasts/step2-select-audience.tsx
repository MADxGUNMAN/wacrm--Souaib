'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomField, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Tags,
  Filter,
  Upload,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  Eye,
  BellOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AudiencePreviewDialog } from './audience-preview-dialog';
import { useAudienceSuppression } from '@/hooks/use-audience-suppression';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
  excludedContactIds?: string[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
  /**
   * The chosen template's category, used only to decide whether
   * unsubscribed contacts are skipped. Marketing templates are suppressed;
   * utility and authentication ones reach everybody.
   *
   * Optional so the step still renders if a template is somehow absent,
   * and treated as marketing when blank — the same fail-closed rule every
   * send path uses.
   */
  templateCategory?: string | null;
}

export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
  templateCategory,
}: Step2Props) {
  const t = useTranslations('Broadcasts.wizard');

  const OPERATOR_OPTIONS = useMemo<
    { value: CustomFieldOperator; label: string }[]
  >(
    () => [
      { value: 'is', label: t('selectAudience.operatorIs') },
      { value: 'is_not', label: t('selectAudience.operatorIsNot') },
      { value: 'contains', label: t('selectAudience.operatorContains') },
    ],
    [t]
  );

  const audienceOptions = useMemo<
    {
      type: AudienceType;
      label: string;
      description: string;
      icon: typeof Users;
    }[]
  >(
    () => [
      {
        type: 'all',
        label: t('selectAudience.method.all'),
        description: t('selectAudience.allDescLoading'),
        icon: Users,
      },
      {
        type: 'tags',
        label: t('selectAudience.method.tags'),
        description: t('selectAudience.tagDesc'),
        icon: Tags,
      },
      {
        type: 'custom_field',
        label: t('selectAudience.method.customField'),
        description: t('selectAudience.customFieldDesc'),
        icon: Filter,
      },
      {
        type: 'csv',
        label: t('selectAudience.method.csv'),
        description: t('selectAudience.csvDesc'),
        icon: Upload,
      },
    ],
    [t]
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // How many of this audience unsubscribed. Computed here rather than at
  // send time so the number shown IS the number who will receive it.
  const suppression = useAudienceSuppression(audience, templateCategory);

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      setTagsError(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('tags')
          .select('*')
          .order('name');
        if (error) {
          setTagsError(error.message);
        } else {
          setTags(data ?? []);
        }
      } catch (err) {
        setTagsError(
          err instanceof Error ? err.message : 'Failed to fetch tags'
        );
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active.
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      setFieldsError(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        if (error) {
          console.error('[step2] Failed to load custom fields:', error.message);
          setFieldsError(error.message);
        } else {
          setCustomFields(data ?? []);
        }
      } catch (err) {
        console.error('[step2] Custom fields fetch threw:', err);
        setFieldsError(
          err instanceof Error ? err.message : 'Failed to fetch custom fields'
        );
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter((id) => !excludeSet?.has(id));
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(
          excludeSet ? Math.max(0, total - excludeSet.size) : total
        );
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.customField,
    audience.csvContacts,
    audience.excludeTagIds,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  const manuallyExcluded = audience.excludedContactIds?.length ?? 0;
  /**
   * What will actually be sent: the estimate minus manual unselects minus
   * the unsubscribed. This is the number displayed, because the previous
   * one overstated reach for any account with an opt-out list.
   */
  const netCount =
    estimatedCount === null
      ? null
      : Math.max(
          0,
          estimatedCount - manuallyExcluded - suppression.suppressedCount
        );

  // Block the step only when we KNOW nothing will send. If the suppression
  // check failed we let them through — the server re-checks, and refusing
  // to proceed on a failed read would be worse than an optimistic estimate.
  const blockedByEmptyAudience =
    netCount === 0 && !suppression.unavailable && !suppression.loading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">
          {t('selectAudience.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('selectAudience.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map(
          (option: {
            type: AudienceType;
            label: string;
            description: string;
            icon: typeof Users;
          }) => {
            const isSelected = audience.type === option.type;
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                onClick={() =>
                  onUpdate({
                    ...audience,
                    type: option.type,
                    // Wipe shape fields from other types to avoid stale
                    // config leaking across selections.
                    tagIds:
                      option.type === 'tags' ? audience.tagIds : undefined,
                    customField:
                      option.type === 'custom_field'
                        ? audience.customField
                        : undefined,
                    csvContacts:
                      option.type === 'csv' ? audience.csvContacts : undefined,
                  })
                }
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                    : 'border-border bg-card/50 hover:border-border'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {option.label}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          }
        )}
      </div>

      {audience.type === 'tags' && (
        <div className="border-border bg-card/50 rounded-xl border p-4">
          <p className="text-foreground mb-3 text-sm font-medium">
            {t('selectAudience.selectTags')}
          </p>
          {loadingTags ? (
            <Loader2 className="text-primary h-5 w-5 animate-spin" />
          ) : tagsError ? (
            <p className="text-destructive text-xs">
              {t('selectAudience.errorLoadTags')}
            </p>
          ) : tags.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('selectAudience.noTagsFound')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="border-border bg-card/50 space-y-3 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            {t('selectAudience.method.customField')}
          </p>
          {loadingFields ? (
            <Loader2 className="text-primary h-5 w-5 animate-spin" />
          ) : fieldsError ? (
            <p className="text-destructive text-xs">
              {t('selectAudience.errorLoadFields')}
            </p>
          ) : customFields.length === 0 ? (
            <div className="border-border rounded-lg border border-dashed p-4 text-center">
              <p className="text-muted-foreground text-xs">
                {t('selectAudience.noCustomFieldsFound')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="border-border bg-muted text-foreground focus:border-primary focus:ring-primary h-9 rounded-lg border px-2.5 text-sm outline-none focus:ring-1"
              >
                <option value="">{t('selectAudience.selectField')}</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="border-border bg-muted text-foreground focus:border-primary focus:ring-primary h-9 rounded-lg border px-2.5 text-sm outline-none focus:ring-1"
              >
                {OPERATOR_OPTIONS.map(
                  (op: { value: CustomFieldOperator; label: string }) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  )
                )}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder={t('selectAudience.valuePlaceholder')}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary h-9 rounded-lg border px-2.5 text-sm outline-none focus:ring-1"
              />
            </div>
          )}
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="border-border bg-card/50 rounded-xl border p-4">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-400" />
          <p className="text-foreground text-sm font-medium">
            {t('selectAudience.excludeTags')}
          </p>
        </div>
        {tags.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t('selectAudience.noTagsFound')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-border bg-muted text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="border-border bg-card/50 rounded-xl border p-4">
        <p className="text-foreground mb-2 text-sm font-medium">
          Audience Summary
        </p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="text-primary h-4 w-4 animate-spin" />
            <span className="text-muted-foreground text-xs">Calculating…</span>
          </div>
        ) : estimatedCount !== null && netCount !== null ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Users className="text-primary h-4 w-4" />
                <span className="text-foreground text-sm font-semibold">
                  {netCount.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-xs">
                  {netCount === 1 ? 'recipient' : 'recipients'}
                </span>
                {manuallyExcluded > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-400"
                  >
                    {manuallyExcluded} unselected
                  </Badge>
                )}
                {suppression.suppressedCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-400"
                  >
                    {suppression.suppressedCount} unsubscribed
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                disabled={netCount === 0}
                className="border-border bg-background/50 hover:bg-primary/10 hover:text-primary hover:border-primary/40 h-8 gap-1.5 text-xs shadow-2xs transition-colors"
              >
                <Eye className="size-3.5" />
                <span>Review & Select Recipients</span>
              </Button>
            </div>

            {/* The suppression explainer. Only rendered when it changes the
                number, so it never becomes background noise. */}
            {suppression.suppressedCount > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <BellOff className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  {netCount === 0 ? (
                    <>
                      <strong>
                        Everyone in this audience has unsubscribed
                      </strong>{' '}
                      from marketing messages, so this broadcast would reach
                      nobody. Choose a different audience, or send a utility
                      template instead — those are never suppressed.
                    </>
                  ) : (
                    <>
                      <strong>
                        {suppression.suppressedCount.toLocaleString()}{' '}
                        {suppression.suppressedCount === 1
                          ? 'contact'
                          : 'contacts'}{' '}
                        will be skipped
                      </strong>{' '}
                      because they unsubscribed from marketing messages. They
                      are not counted as sent or failed. Order updates and
                      one-time passcodes still reach them.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* A zero audience for a non-suppression reason still needs
                saying — otherwise Next is disabled with no explanation. */}
            {netCount === 0 && suppression.suppressedCount === 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                No contacts match this audience yet.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            Select an audience type to see the estimate.
          </p>
        )}
      </div>

      {/* Audience Contacts Review & Select Dialog (25 per scroll) */}
      <AudiencePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        audience={audience}
        onUpdateAudience={onUpdate}
        totalEstimatedCount={estimatedCount}
        // Passed down rather than recomputed: the dialog only loads 25
        // contacts at a time, so a count derived from its own rows would
        // disagree with the summary above it.
        suppressedCount={suppression.suppressedCount}
      />

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid || blockedByEmptyAudience}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
