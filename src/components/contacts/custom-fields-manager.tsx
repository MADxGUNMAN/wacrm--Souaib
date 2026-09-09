'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import type { CustomField } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Plus,
  Trash2,
  Lock,
  AlertTriangle,
  Mail,
  Building2,
  User,
  Phone,
  Eye,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FieldContactsPreviewDialog } from './field-contacts-preview-dialog';

interface CustomFieldsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog wrapper around {@link CustomFieldsPanel}, used on the Contacts page
 * and in settings to configure standard & custom contact fields.
 */
export function CustomFieldsManager({
  open,
  onOpenChange,
}: CustomFieldsManagerProps) {
  const t = useTranslations('Contacts.customFields');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{t('title')}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('desc')}
          </DialogDescription>
        </DialogHeader>
        <CustomFieldsPanel />
      </DialogContent>
    </Dialog>
  );
}

interface DeleteTarget {
  field: CustomField;
  count: number;
}

/**
 * Manage standard (Email, Company) and dynamic custom contact fields.
 * Name and Phone are strictly locked (system required, non-deletable, non-disableable).
 */
export function CustomFieldsPanel() {
  const t = useTranslations('Contacts.customFields');
  const supabase = createClient();
  const { user, accountId } = useAuth();

  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Data-aware delete state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Preview contacts with this field state
  const [previewField, setPreviewField] = useState<CustomField | null>(null);

  const fetchFields = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .order('field_name');
    setAllFields((data as CustomField[] | null) ?? []);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    if (accountId) {
      void fetchFields();
    }
  }, [accountId, fetchFields]);

  // Separate system fields vs pure custom fields
  const emailRow = allFields.find((f) => f.field_key === 'email');
  const companyRow = allFields.find((f) => f.field_key === 'company');
  const customFields = allFields.filter((f) => !f.is_system && !f.field_key);

  const emailName = emailRow?.field_name || 'Email';
  const emailVisible = emailRow?.visible !== false;

  const companyName = companyRow?.field_name || 'Company';
  const companyVisible = companyRow?.visible !== false;

  /** Case-insensitive name clash within custom fields list */
  function isDuplicate(name: string, exceptId?: string): boolean {
    const lower = name.toLowerCase();
    if (
      lower === 'name' ||
      lower === 'phone' ||
      lower === emailName.toLowerCase() ||
      lower === companyName.toLowerCase()
    ) {
      return true;
    }
    return customFields.some(
      (f) => f.id !== exceptId && f.field_name.toLowerCase() === lower
    );
  }

  async function handleToggleSystemField(
    key: 'email' | 'company',
    currentVisible: boolean,
    currentName: string
  ) {
    if (!accountId || !user) return;
    const nextVisible = !currentVisible;
    const existing = key === 'email' ? emailRow : companyRow;

    setBusyId(key);
    try {
      if (existing) {
        const { error } = await supabase
          .from('custom_fields')
          .update({ visible: nextVisible })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('custom_fields').insert({
          account_id: accountId,
          user_id: user.id,
          field_key: key,
          field_name: currentName,
          field_type: 'text',
          is_system: true,
          visible: nextVisible,
        });
        if (error) throw error;
      }
      await fetchFields();
    } catch {
      toast.error(t('toastRenameFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRenameSystemField(
    key: 'email' | 'company',
    nextName: string,
    currentVisible: boolean
  ): Promise<boolean> {
    const name = nextName.trim();
    if (!name) return true;
    if (!accountId || !user) return false;
    const existing = key === 'email' ? emailRow : companyRow;
    if (existing && existing.field_name === name) return true;

    setBusyId(key);
    try {
      if (existing) {
        const { error } = await supabase
          .from('custom_fields')
          .update({ field_name: name })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('custom_fields').insert({
          account_id: accountId,
          user_id: user.id,
          field_key: key,
          field_name: name,
          field_type: 'text',
          is_system: true,
          visible: currentVisible,
        });
        if (error) throw error;
      }
      await fetchFields();
      return true;
    } catch {
      toast.error(t('toastRenameFailed'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateCustomField() {
    const name = newName.trim();
    if (!name) return;
    if (!accountId || !user) {
      toast.error(t('toastNoAccount'));
      return;
    }
    if (isDuplicate(name)) {
      toast.error(t('toastDuplicate', { name }));
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('custom_fields').insert({
      field_name: name,
      field_type: 'text',
      user_id: user.id,
      account_id: accountId,
      is_system: false,
      visible: true,
    });
    setCreating(false);

    if (error) {
      toast.error(t('toastCreateFailed'));
      return;
    }
    toast.success(t('toastCreated', { name }));
    setNewName('');
    await fetchFields();
  }

  async function handleRenameCustomField(
    field: CustomField,
    nextName: string
  ): Promise<boolean> {
    const name = nextName.trim();
    if (!name || name === field.field_name) return true;
    if (isDuplicate(name, field.id)) {
      toast.error(t('toastDuplicate', { name }));
      return false;
    }
    setBusyId(field.id);
    const { error } = await supabase
      .from('custom_fields')
      .update({ field_name: name })
      .eq('id', field.id);
    setBusyId(null);
    if (error) {
      toast.error(t('toastRenameFailed'));
      return false;
    }
    await fetchFields();
    return true;
  }

  async function initiateDeleteCustomField(field: CustomField) {
    setCheckingDelete(true);
    setBusyId(field.id);
    try {
      const { count } = await supabase
        .from('contact_custom_values')
        .select('*', { count: 'exact', head: true })
        .eq('custom_field_id', field.id)
        .not('value', 'is', null)
        .neq('value', '');

      setDeleteTarget({ field, count: count ?? 0 });
    } catch {
      setDeleteTarget({ field, count: 0 });
    } finally {
      setCheckingDelete(false);
      setBusyId(null);
    }
  }

  async function confirmDeleteField() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', deleteTarget.field.id);
    setDeleting(false);

    if (error) {
      toast.error(t('toastDeleteFailed'));
      return;
    }
    toast.success(t('toastDeleted', { name: deleteTarget.field.field_name }));
    setDeleteTarget(null);
    await fetchFields();
  }

  return (
    <div className="space-y-6">
      {/* 1. Standard Fields Section */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('standardFieldsTitle')}
        </h4>
        <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
          {/* Phone (Permanent Core Locked) */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2.5">
              <Phone className="size-4 text-muted-foreground shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Phone</span>
                  <Badge variant="outline" className="text-[10px] gap-1 py-0 border-primary/30 text-primary bg-primary/5">
                    <Lock className="size-2.5" />
                    {t('systemRequired')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t('phoneLockedHint')}</p>
              </div>
            </div>
            <Switch checked={true} disabled aria-label="Phone is required" />
          </div>

          {/* Name (Permanent Core Locked) */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2.5">
              <User className="size-4 text-muted-foreground shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Name</span>
                  <Badge variant="outline" className="text-[10px] gap-1 py-0 border-primary/30 text-primary bg-primary/5">
                    <Lock className="size-2.5" />
                    {t('systemRequired')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t('nameLockedHint')}</p>
              </div>
            </div>
            <Switch checked={true} disabled aria-label="Name is required" />
          </div>

          {/* Email (Manageable) */}
          <StandardFieldRow
            icon={<Mail className="size-4 text-muted-foreground shrink-0" />}
            defaultName="Email"
            currentName={emailName}
            visible={emailVisible}
            busy={busyId === 'email'}
            onToggle={() => handleToggleSystemField('email', emailVisible, emailName)}
            onRename={(name) => handleRenameSystemField('email', name, emailVisible)}
          />

          {/* Company (Manageable) */}
          <StandardFieldRow
            icon={<Building2 className="size-4 text-muted-foreground shrink-0" />}
            defaultName="Company"
            currentName={companyName}
            visible={companyVisible}
            busy={busyId === 'company'}
            onToggle={() => handleToggleSystemField('company', companyVisible, companyName)}
            onRename={(name) => handleRenameSystemField('company', name, companyVisible)}
          />
        </div>
      </div>

      {/* 2. Custom Fields Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('customFieldsTitle')}
          </h4>
        </div>

        {/* Create Input */}
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreateCustomField();
              }
            }}
            placeholder={t('fieldName')}
            className="bg-muted text-foreground"
          />
          <Button
            onClick={handleCreateCustomField}
            disabled={creating || !newName.trim()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t('addField')}
          </Button>
        </div>

        {/* Custom Fields List */}
        <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('loading')}
            </div>
          ) : customFields.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {customFields.map((field) => (
                <CustomFieldRow
                  key={field.id}
                  field={field}
                  busy={busyId === field.id}
                  checkingDelete={checkingDelete && busyId === field.id}
                  onRename={handleRenameCustomField}
                  onDelete={initiateDeleteCustomField}
                  onPreview={(f) => setPreviewField(f)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 3. Data-Aware Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-destructive mb-1">
              <AlertTriangle className="size-5" />
              <DialogTitle className="text-foreground">
                {t('deleteDialogTitle', { name: deleteTarget?.field.field_name || '' })}
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground text-sm pt-1">
              {deleteTarget && deleteTarget.count > 0
                ? t('deleteWarningDesc', { count: deleteTarget.count })
                : t('deleteSafeDesc', { name: deleteTarget?.field.field_name || '' })}
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && deleteTarget.count > 0 && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  <strong>Permanent:</strong> {deleteTarget.count} contact(s) will lose their saved value.
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreviewField(deleteTarget.field);
                }}
                className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/20 gap-1 px-2 shrink-0 font-medium"
              >
                <Eye className="size-3" />
                View
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4 flex-row items-center justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="border-border mr-2"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDeleteField}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {deleteTarget && deleteTarget.count > 0
                ? t('deleteWithDataBtn', { count: deleteTarget.count })
                : t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Contacts Preview Dialog with Infinite Scroll */}
      <FieldContactsPreviewDialog
        open={!!previewField}
        onOpenChange={(open) => !open && setPreviewField(null)}
        field={previewField}
        emailVisible={emailVisible}
        companyVisible={companyVisible}
        emailLabel={emailName}
        companyLabel={companyName}
      />
    </div>
  );
}

/** Manageable Standard Field (Email, Company) Row */
function StandardFieldRow({
  icon,
  defaultName,
  currentName,
  visible,
  busy,
  onToggle,
  onRename,
}: {
  icon: React.ReactNode;
  defaultName: string;
  currentName: string;
  visible: boolean;
  busy: boolean;
  onToggle: () => void;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  async function commit() {
    if (name.trim() === currentName) {
      setName(currentName);
      return;
    }
    const ok = await onRename(name.trim() || defaultName);
    if (!ok) setName(currentName);
  }

  return (
    <div className="flex items-center justify-between p-3 gap-3">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {icon}
        <div className="flex-1 min-w-0">
          <Input
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder={defaultName}
            className="h-7 text-sm font-medium border-transparent bg-transparent hover:border-border focus:border-primary px-1.5"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={visible}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${defaultName} visibility`}
        />
      </div>
    </div>
  );
}

/** Pure Custom Field Row */
function CustomFieldRow({
  field,
  busy,
  checkingDelete,
  onRename,
  onDelete,
  onPreview,
}: {
  field: CustomField;
  busy: boolean;
  checkingDelete: boolean;
  onRename: (field: CustomField, name: string) => Promise<boolean>;
  onDelete: (field: CustomField) => void;
  onPreview: (field: CustomField) => void;
}) {
  const t = useTranslations('Contacts.customFields');
  const [name, setName] = useState(field.field_name);

  useEffect(() => {
    setName(field.field_name);
  }, [field.field_name]);

  async function commit() {
    if (name.trim() === field.field_name) {
      setName(field.field_name);
      return;
    }
    const ok = await onRename(field, name);
    if (!ok) setName(field.field_name);
  }

  return (
    <li className="flex items-center gap-1.5 px-3 py-2">
      <Input
        value={name}
        disabled={busy || checkingDelete}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label={t('renameAria', { name: field.field_name })}
        className="focus:border-primary h-8 border-transparent bg-transparent text-foreground hover:border-border flex-1"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy || checkingDelete}
        onClick={() => onPreview(field)}
        title="View contacts with this field"
        className="shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
      >
        <Eye className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy || checkingDelete}
        onClick={() => onDelete(field)}
        title={t('deleteTitle')}
        className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      >
        {checkingDelete ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </Button>
    </li>
  );
}
