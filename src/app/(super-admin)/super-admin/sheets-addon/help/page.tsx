'use client';

// ============================================================
// Super Admin → Sheet Add-on → Help Content
//
// Edits every string the Google Sheets add-on's Help & Support dialog
// renders. The add-on ships NO fallback copy, so this page is the only
// source of that text — which is the whole point. A hardcoded default
// in Apps Script would silently win over whatever is typed here, and
// nothing in the rendered dialog would tell you which one you were
// looking at.
//
// Sections are ordered to match the dialog top to bottom, so editing
// feels like editing the thing on the right rather than a flat form.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, RotateCcw, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { HelpLinkEditor } from '@/components/super-admin/sheets-addon/help-link-editor';
import { HelpDialogPreview } from '@/components/super-admin/sheets-addon/help-dialog-preview';
import type {
  SheetsAddonHelpLink,
  SheetsAddonHelpSettings,
} from '@/types/super-admin';

type Draft = Partial<SheetsAddonHelpSettings>;

export default function SheetsAddonHelpPage() {
  const [settings, setSettings] = useState<Draft>({});
  const [links, setLinks] = useState<SheetsAddonHelpLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/super-admin/sheets-addon/help', {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load help content');
      setSettings(data.settings ?? {});
      setLinks((data.links ?? []) as SheetsAddonHelpLink[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = (field: keyof SheetsAddonHelpSettings, value: unknown) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Send only the editable fields. The route whitelists them anyway,
      // but posting id/created_at back would be noise in the audit trail.
      const { id, created_at, updated_at, ...editable } = settings;
      void id;
      void created_at;
      void updated_at;

      const res = await fetch('/api/super-admin/sheets-addon/help', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editable),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setSettings(data.settings ?? settings);
      toast.success('Help content saved. The add-on picks it up immediately.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading help content...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <AlertCircle className="size-8 text-red-400" />
        <p className="text-red-500">{error}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="mr-2 size-4" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* No <h2> here: the super-admin header titles this page from the
          pathname, and a second heading read as a duplicate. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          The add-on ships no built-in copy of this text, so whatever you save
          here is exactly what users see.
        </p>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Content'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* ── Dialog header ─────────────────────────────── */}
          <Section
            title="Dialog header"
            hint="The green banner at the top of the dialog."
          >
            <Field
              label="Title"
              value={settings.dialog_title ?? ''}
              onChange={(v) => change('dialog_title', v)}
            />
            <Field
              label="Subtitle"
              value={settings.dialog_subtitle ?? ''}
              onChange={(v) => change('dialog_subtitle', v)}
            />
          </Section>

          {/* ── Get Support ───────────────────────────────── */}
          <Section
            title="Get Support"
            hint="How users reach a human. Add, reorder or switch off any option."
          >
            <Field
              label="Section heading"
              value={settings.support_heading ?? ''}
              onChange={(v) => change('support_heading', v)}
            />
            <HelpLinkEditor
              section="support"
              links={links}
              onChanged={setLinks}
            />
          </Section>

          {/* ── Resources ─────────────────────────────────── */}
          <Section
            title="Resources"
            hint="Documentation and website links. Point these at your production site, not a dev host."
          >
            <Field
              label="Section heading"
              value={settings.resources_heading ?? ''}
              onChange={(v) => change('resources_heading', v)}
            />
            <HelpLinkEditor
              section="resources"
              links={links}
              onChanged={setLinks}
            />
          </Section>

          {/* ── Maintenance ───────────────────────────────── */}
          <Section
            title="Maintenance"
            hint="The two actions that used to sit loose in the Extensions menu. The buttons always work; only their wording is editable here."
          >
            <Field
              label="Section heading"
              value={settings.maintenance_heading ?? ''}
              onChange={(v) => change('maintenance_heading', v)}
            />
            <Field
              label="Section description"
              value={settings.maintenance_description ?? ''}
              onChange={(v) => change('maintenance_description', v)}
              multiline
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Reinstall triggers — label"
                value={settings.reinstall_label ?? ''}
                onChange={(v) => change('reinstall_label', v)}
              />
              <Field
                label="Reinstall triggers — description"
                value={settings.reinstall_description ?? ''}
                onChange={(v) => change('reinstall_description', v)}
              />
              <Field
                label="Disconnect — label"
                value={settings.disconnect_label ?? ''}
                onChange={(v) => change('disconnect_label', v)}
              />
              <Field
                label="Disconnect — description"
                value={settings.disconnect_description ?? ''}
                onChange={(v) => change('disconnect_description', v)}
              />
            </div>
          </Section>

          {/* ── Reset ─────────────────────────────────────── */}
          <Section
            title="Reset Configuration"
            hint="Irreversible for the user: clears their API key, every rule in the spreadsheet, and all triggers. Rules live in the spreadsheet only, so there is no server copy to restore."
          >
            <Toggle
              label="Show the Reset Configuration card"
              description="Turn off to withdraw the action without losing the wording below."
              checked={settings.is_reset_enabled ?? false}
              onChange={(v) => change('is_reset_enabled', v)}
            />
            <Field
              label="Heading"
              value={settings.reset_heading ?? ''}
              onChange={(v) => change('reset_heading', v)}
            />
            <Field
              label="Description"
              value={settings.reset_description ?? ''}
              onChange={(v) => change('reset_description', v)}
              multiline
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Button label"
                value={settings.reset_button_label ?? ''}
                onChange={(v) => change('reset_button_label', v)}
              />
              <Field
                label="Confirm label"
                hint="Second step of the confirm. The add-on appends the live rule count, so write a verb phrase."
                value={settings.reset_confirm_label ?? ''}
                onChange={(v) => change('reset_confirm_label', v)}
              />
            </div>
          </Section>

          {/* ── Report Issue ──────────────────────────────── */}
          <Section
            title="Report Issue"
            hint="Submissions land in Sheet Add-on → Issue Reports."
          >
            <Toggle
              label="Show the Report Issue form"
              description="Turn off to stop accepting reports from the dialog."
              checked={settings.is_report_enabled ?? false}
              onChange={(v) => change('is_report_enabled', v)}
            />
            <Field
              label="Heading"
              value={settings.report_heading ?? ''}
              onChange={(v) => change('report_heading', v)}
            />
            <Field
              label="Intro text"
              value={settings.report_intro ?? ''}
              onChange={(v) => change('report_intro', v)}
              multiline
            />
            <Field
              label="Textarea placeholder"
              value={settings.report_placeholder ?? ''}
              onChange={(v) => change('report_placeholder', v)}
              multiline
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Submit button label"
                value={settings.report_button_label ?? ''}
                onChange={(v) => change('report_button_label', v)}
              />
              <Field
                label="Success message"
                value={settings.report_success_message ?? ''}
                onChange={(v) => change('report_success_message', v)}
              />
            </div>
          </Section>

          {/* ── Footer ────────────────────────────────────── */}
          <Section title="Footer" hint="The small link at the bottom.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Footer text"
                value={settings.footer_text ?? ''}
                onChange={(v) => change('footer_text', v)}
              />
              <Field
                label="Footer URL"
                hint="https:// or mailto: only."
                value={settings.footer_url ?? ''}
                onChange={(v) => change('footer_url', v)}
              />
            </div>
          </Section>
        </div>

        {/* Sticky so the preview stays visible while scrolling a long form. */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <HelpDialogPreview settings={settings} links={links} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Local presentational helpers
// ------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-500 uppercase">
        {label}
      </label>
      {multiline ? (
        <Textarea
          value={value}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="border-slate-200 bg-white text-slate-900"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-slate-200 bg-white text-slate-900"
        />
      )}
      {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="pr-4">
        <p className="font-medium text-slate-900">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
