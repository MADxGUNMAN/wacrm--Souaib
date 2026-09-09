'use client';

// ============================================================
// Auto Mail → Settings. One card per segment.
//
// The two segments are edited and saved INDEPENDENTLY, mirroring the
// row-per-segment schema. There is deliberately no "save all" button: a
// single submit spanning both audiences is how an operator ends up
// changing the trial copy while intending to change the renewal copy, and
// the whole point of the schema was to make that impossible.
//
// Preview renders through the same server endpoint the cron uses, so what
// an operator approves is the exact email that will be sent rather than a
// client-side approximation that can drift.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Eye, Loader2, Mail, Save, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AUTO_EMAIL_TOKENS } from '@/lib/auto-mail/templates';
import type { AutoEmailRule, AutoEmailSegment } from '@/lib/auto-mail/types';
import { cn } from '@/lib/utils';

const SEGMENT_COPY: Record<
  AutoEmailSegment,
  { title: string; description: string; offsetHint: string }
> = {
  trial: {
    title: 'Trial users',
    description:
      'Workspaces inside a free trial that have not paid yet. Reminds them before access pauses.',
    offsetHint:
      'Days before the trial ends. "1" sends one day before; "7, 3, 1" sends three reminders.',
  },
  paid: {
    title: 'Paid subscribers',
    description:
      'Workspaces on an active plan. Reminds them before the subscription is due for renewal.',
    offsetHint:
      'Days before the renewal date. Kept separate from the trial schedule on purpose.',
  },
};

export function SegmentSettingsPanel() {
  const [rules, setRules] = useState<AutoEmailRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/auto-mail/settings');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setRules(json.rules ?? []);
    } catch {
      toast.error('Could not load the Auto Mail settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#25D366]" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          No Auto Mail rules found
        </p>
        <p className="mt-1 text-sm text-amber-700">
          The migration seeds one row per segment, so an empty list means the
          rows were deleted. Re-run the Auto Mail migration to restore them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rules.map((rule) => (
        <SegmentCard key={rule.segment} rule={rule} onSaved={load} />
      ))}
      <TokenReference />
    </div>
  );
}

// ------------------------------------------------------------

function SegmentCard({
  rule,
  onSaved,
}: {
  rule: AutoEmailRule;
  onSaved: () => void;
}) {
  const copy = SEGMENT_COPY[rule.segment];

  const [enabled, setEnabled] = useState(rule.is_enabled);
  const [offsets, setOffsets] = useState(rule.offsets_days.join(', '));
  const [subject, setSubject] = useState(rule.subject_template);
  const [headingText, setHeadingText] = useState(rule.heading_template);
  const [body, setBody] = useState(rule.body_template);
  const [ctaLabel, setCtaLabel] = useState(rule.cta_label);
  const [ctaPath, setCtaPath] = useState(rule.cta_path);
  const [footer, setFooter] = useState(rule.footer_note ?? '');

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  /** The unsaved form, in the shape both the PUT and the preview want. */
  const draft = useCallback(
    () => ({
      segment: rule.segment,
      is_enabled: enabled,
      offsets_days: offsets
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Number(part)),
      subject_template: subject,
      heading_template: headingText,
      body_template: body,
      cta_label: ctaLabel,
      cta_path: ctaPath,
      footer_note: footer,
    }),
    [
      rule.segment,
      enabled,
      offsets,
      subject,
      headingText,
      body,
      ctaLabel,
      ctaPath,
      footer,
    ]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/super-admin/auto-mail/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft()),
      });
      const json = await res.json();
      if (!res.ok) {
        // The server names the offending field; surfacing it verbatim is
        // more useful than a generic "save failed".
        toast.error(json.error ?? 'Could not save.');
        return;
      }
      toast.success(`${copy.title} settings saved.`);
      onSaved();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch('/api/super-admin/auto-mail/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft()),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not render the preview.');
        return;
      }
      setPreviewSubject(json.subject ?? '');
      setPreviewHtml(json.html ?? '');
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleTestSend = async () => {
    if (!testEmail.trim()) {
      toast.error('Enter an address to send the test to.');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/super-admin/auto-mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment: rule.segment,
          testEmail: testEmail.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Test send failed.');
        return;
      }
      toast.success(`Test sent to ${testEmail.trim()}.`);
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              rule.segment === 'trial'
                ? 'bg-blue-50 text-blue-600'
                : 'bg-[#25D366]/10 text-[#25D366]'
            )}
          >
            <Mail className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">{copy.title}</h3>
            <p className="mt-0.5 max-w-xl text-sm text-slate-500">
              {copy.description}
            </p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2.5">
          <span className="text-sm font-medium text-slate-600">
            {enabled ? 'Sending' : 'Paused'}
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* ---- Timing ---- */}
        <Field
          label="Send this many days before"
          hint={copy.offsetHint}
          htmlFor={`offsets-${rule.segment}`}
        >
          <Input
            id={`offsets-${rule.segment}`}
            value={offsets}
            onChange={(e) => setOffsets(e.target.value)}
            placeholder="7, 3, 1"
            className="max-w-[220px] border-slate-200 bg-white text-slate-900"
          />
        </Field>

        {/* ---- Copy ---- */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Subject line" htmlFor={`subject-${rule.segment}`}>
            <Input
              id={`subject-${rule.segment}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
          <Field
            label="Heading inside the email"
            htmlFor={`heading-${rule.segment}`}
          >
            <Input
              id={`heading-${rule.segment}`}
              value={headingText}
              onChange={(e) => setHeadingText(e.target.value)}
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
        </div>

        <Field
          label="Body"
          hint="Leave a blank line between paragraphs. Plain text only — formatting is applied by the template."
          htmlFor={`body-${rule.segment}`}
        >
          <Textarea
            id={`body-${rule.segment}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="border-slate-200 bg-white font-mono text-sm text-slate-900"
          />
        </Field>

        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Button label" htmlFor={`cta-label-${rule.segment}`}>
            <Input
              id={`cta-label-${rule.segment}`}
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
          <Field
            label="Button link"
            hint="A path like /upgrade-plan, or a full https:// URL."
            htmlFor={`cta-path-${rule.segment}`}
          >
            <Input
              id={`cta-path-${rule.segment}`}
              value={ctaPath}
              onChange={(e) => setCtaPath(e.target.value)}
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>
        </div>

        <Field
          label="Footer note"
          hint="Optional small print under the divider. Leave empty to omit it."
          htmlFor={`footer-${rule.segment}`}
        >
          <Textarea
            id={`footer-${rule.segment}`}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={2}
            className="border-slate-200 bg-white text-sm text-slate-900"
          />
        </Field>
      </div>

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          className="bg-[#25D366] text-white hover:bg-[#1fae57]"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save {copy.title.toLowerCase()}
        </Button>

        <Button
          variant="outline"
          onClick={() => void handlePreview()}
          disabled={previewing}
          className="border-slate-200"
        >
          {previewing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          Preview
        </Button>

        {/* Test send uses the CURRENT form, not the saved row, so an
            operator can check a change before committing it. */}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-9 w-[200px] border-slate-200 bg-white text-sm text-slate-900"
          />
          <Button
            variant="outline"
            onClick={() => void handleTestSend()}
            disabled={testing}
            className="border-slate-200"
          >
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-3.5 w-3.5" />
            )}
            Send test
          </Button>
        </div>
      </div>

      <PreviewDialog
        open={previewHtml !== null}
        onClose={() => setPreviewHtml(null)}
        subject={previewSubject}
        html={previewHtml ?? ''}
      />
    </div>
  );
}

// ------------------------------------------------------------

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium text-slate-600"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function TokenReference() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900">
        Available placeholders
      </h4>
      <p className="mt-0.5 text-xs text-slate-500">
        Type these anywhere in the subject, heading, body or footer. They are
        replaced per recipient when the email is sent. A placeholder you mistype
        is left visible rather than silently deleted, so you can spot it in the
        preview.
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {AUTO_EMAIL_TOKENS.map((t) => (
          <div key={t.token} className="flex items-baseline gap-2">
            <dt>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                {t.token}
              </code>
            </dt>
            <dd className="text-xs text-slate-500">{t.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PreviewDialog({
  open,
  onClose,
  subject,
  html,
}: {
  open: boolean;
  onClose: () => void;
  subject: string;
  html: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-4">
          <DialogTitle className="text-base font-bold text-slate-900">
            Email preview
          </DialogTitle>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">Subject:</span>{' '}
            {subject}
          </p>
        </DialogHeader>
        {/* An iframe with srcDoc, not dangerouslySetInnerHTML.
            Two reasons: the email is a full document with its own <style>
            and table layout, which would fight the admin page's CSS and
            render nothing like the real thing; and it keeps the email's
            markup out of this page's DOM entirely. `sandbox` with no
            allow-scripts means nothing in it can execute. */}
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox=""
          className="h-[65vh] w-full border-0 bg-slate-50"
        />
      </DialogContent>
    </Dialog>
  );
}
