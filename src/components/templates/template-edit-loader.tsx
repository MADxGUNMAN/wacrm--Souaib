'use client';

// ============================================================
// Loads one template row, then hands it to the wizard in edit mode.
//
// Reads through the Supabase client rather than an API route because RLS
// already scopes `message_templates` to the caller's account — the same
// approach the template list uses. A bespoke GET endpoint would be a
// second place to get that scoping right.
// ============================================================

import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { templateStatusConfig } from '@/lib/template-status';
import { TemplateWizard } from '@/components/templates/template-wizard';
import type { MessageTemplate } from '@/types';

/**
 * Meta only accepts edits to templates in these states. A PENDING
 * template is mid-review and a DISABLED one is terminal, so editing
 * either is refused server-side too — this check exists so the operator
 * is told why instead of watching a save fail.
 */
const EDITABLE = new Set(['APPROVED', 'REJECTED', 'PAUSED', 'DRAFT']);

export function TemplateEditLoader({ id }: { id: string }) {
  const supabase = createClient();
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from('message_templates')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (cancelled) return;
        if (err) throw new Error(err.message);
        if (!data) throw new Error('That template no longer exists.');
        setTemplate(data as MessageTemplate);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load it.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `supabase` is a fresh client per render but stable in behaviour;
    // including it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const blockedReason = !template
    ? null
    : !EDITABLE.has(template.status ?? '')
      ? template.status === 'PENDING'
        ? 'This template is being reviewed by Meta. Wait for a decision before editing it.'
        : `A ${templateStatusConfig[template.status ?? 'DRAFT']?.label ?? template.status} template cannot be edited.`
      : !template.meta_template_id
        ? 'This template was never accepted by Meta, so there is nothing to edit yet. Delete it and create it again.'
        : null;

  if (error || blockedReason) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <AlertCircle className="mx-auto size-7 text-amber-600 dark:text-amber-500" />
          <p className="mt-3 text-sm text-foreground">
            {error ?? blockedReason}
          </p>
          <Link
            href="/templates"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            Back to templates
          </Link>
        </div>
      </div>
    );
  }

  return <TemplateWizard existing={template!} />;
}
