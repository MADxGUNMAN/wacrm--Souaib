"use client";

// ============================================================
// Wizard step 2, FLOWS variant.
//
// ─── The thing to understand before reading this ──────────────
//
// A Flow button opens one of META'S WhatsApp Flows: a multi-screen form
// that runs inside WhatsApp, built in Meta's Flow Builder and stored on
// the WhatsApp Business Account.
//
// It is NOT this app's /flows feature. That is an in-house chatbot graph
// which replies with ordinary interactive messages, and a template button
// has no way to reference it. So this step lists Flows fetched live from
// the WABA rather than from our own `flows` table, and the note at the top
// of the form says so — the alternative is an operator hunting for the
// automation they built here and concluding the picker is broken.
//
// Two rules that produce unhelpful rejections or dead sends when broken,
// both surfaced inline rather than left to Meta:
//
//   - Only a PUBLISHED Flow can be sent. A draft Flow is approved happily
//     and then fails on every send.
//   - `navigate` needs the first screen's name from the Flow JSON;
//     `data_exchange` must not have one.
// ============================================================

import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, Workflow } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FLOW_LIMITS, TEMPLATE_LIMITS } from '@/lib/whatsapp/template-limits';
import { extractVariableIndices } from '@/lib/whatsapp/template-variables';
import {
  definitionFromDraft,
  draftBodyValues,
  type FlowDraft,
  type WizardDraft,
} from '@/components/templates/wizard-draft';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import type { TemplateCategory } from '@/lib/whatsapp/template-types-catalogue';

interface MetaFlow {
  id: string;
  name: string;
  status: string;
  categories?: string[];
}

export function WizardStepFlow({
  draft,
  category,
  onChange,
}: {
  draft: WizardDraft;
  category: TemplateCategory;
  onChange: (fields: Partial<WizardDraft>) => void;
}) {
  const flow = draft.flow;
  const patchFlow = (fields: Partial<FlowDraft>) =>
    onChange({ flow: { ...flow, ...fields } });

  const [flows, setFlows] = useState<MetaFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/whatsapp/meta-flows');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data?.error || `Could not load Flows (${res.status}).`);
          setFlows([]);
        } else {
          setFlows(Array.isArray(data.flows) ? data.flows : []);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : 'Could not load Flows.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bodyVarCount = extractVariableIndices(draft.bodyText).length;
  const bodySamples = Array.from(
    { length: bodyVarCount },
    (_, i) => draft.bodySamples[i] ?? '',
  );

  const selected = flows.find((f) => f.id === flow.flowId);
  // Shown for a Flow that exists but cannot be sent. Not a hard block: the
  // operator may be building the template before publishing the Flow, and
  // refusing outright would force them to abandon the draft.
  const selectedUnpublished =
    selected != null && selected.status !== FLOW_LIMITS.sendableStatus;

  const definition = definitionFromDraft(draft, category, 'flows');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            These are the WhatsApp Flows on your WhatsApp Business account,
            built in Meta&apos;s Flow Builder. They are a different thing from
            the automations under <strong>Flows</strong> in this app — a
            template button can only open a Meta Flow.
          </p>
        </div>

        {/* ---- Name + language ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Template name and language
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="flow-name">Name your template</Label>
              <Input
                id="flow-name"
                value={draft.name}
                onChange={(e) =>
                  onChange({
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, '_')
                      .slice(0, 512),
                  })
                }
                placeholder="appointment_booking"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-lang">Select language</Label>
              <Input
                id="flow-lang"
                value={draft.language}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* ---- The Flow ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Workflow className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              The Flow this button opens
            </h2>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="flow-picker">Flow</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading Flows from your WhatsApp Business account…
              </div>
            ) : loadError ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    <p>{loadError}</p>
                    <p className="mt-1">
                      You can still paste a Flow ID below. Listing Flows needs
                      the <code>whatsapp_business_management</code> permission
                      on your access token.
                    </p>
                  </div>
                </div>
                <Input
                  value={flow.flowId}
                  onChange={(e) => patchFlow({ flowId: e.target.value.trim() })}
                  placeholder="Flow ID, e.g. 1234567890123456"
                  aria-label="Flow ID"
                />
              </div>
            ) : flows.length === 0 ? (
              <div className="space-y-2">
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No Flows on this WhatsApp Business account yet. Build one in
                  Meta&apos;s Flow Builder (WhatsApp Manager → Flows), publish
                  it, then come back.
                </p>
                <Input
                  value={flow.flowId}
                  onChange={(e) => patchFlow({ flowId: e.target.value.trim() })}
                  placeholder="…or paste a Flow ID"
                  aria-label="Flow ID"
                />
              </div>
            ) : (
              <>
                <Select
                  value={flow.flowId || undefined}
                  onValueChange={(val) => {
                    const picked = flows.find((f) => f.id === val);
                    patchFlow({
                      flowId: val ?? '',
                      flowName: picked?.name ?? '',
                    });
                  }}
                >
                  <SelectTrigger id="flow-picker">
                    <SelectValue placeholder="Pick a Flow" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Unpublished Flows are listed, not hidden: a Flow the
                        operator just created should be visible, with the
                        reason it cannot be sent yet. */}
                    {flows.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                        {f.status !== FLOW_LIMITS.sendableStatus
                          ? ` · ${f.status.toLowerCase()}`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedUnpublished ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      This Flow is {selected?.status.toLowerCase()}. Meta will
                      approve the template, but every send will fail until the
                      Flow is published.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="flow-btn-text">Button label</Label>
              <Input
                id="flow-btn-text"
                value={flow.buttonText}
                onChange={(e) => patchFlow({ buttonText: e.target.value })}
                maxLength={FLOW_LIMITS.buttonTextMaxLength}
                placeholder="Book now"
              />
              <p className="text-xs text-muted-foreground">
                {flow.buttonText.length}/{FLOW_LIMITS.buttonTextMaxLength}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-action">When the button is tapped</Label>
              <Select
                value={flow.action}
                onValueChange={(val) =>
                  patchFlow({
                    action: val === 'data_exchange' ? 'data_exchange' : 'navigate',
                    // Meta rejects a screen name on data_exchange, so clear
                    // it rather than carrying a value that will be refused.
                    ...(val === 'data_exchange' ? { navigateScreen: '' } : {}),
                  })
                }
              >
                <SelectTrigger id="flow-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="navigate">
                    Open a screen straight away
                  </SelectItem>
                  <SelectItem value="data_exchange">
                    Ask my server what to show first
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {flow.action === 'navigate'
                  ? 'Simplest option, and works without a Flow endpoint.'
                  : 'Requires a published Flow endpoint that answers Meta’s request.'}
              </p>
            </div>
          </div>

          {flow.action === 'navigate' ? (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="flow-screen">First screen</Label>
              <Input
                id="flow-screen"
                value={flow.navigateScreen}
                onChange={(e) => patchFlow({ navigateScreen: e.target.value })}
                placeholder="WELCOME_SCREEN"
              />
              <p className="text-xs text-muted-foreground">
                The screen id from your Flow JSON — not the Flow name. Meta
                rejects the template without it.
              </p>
            </div>
          ) : null}
        </section>

        {/* ---- Message content ---- */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Message content
          </h2>

          <div className="mt-4 space-y-2">
            <Label htmlFor="flow-header-format">Header · optional</Label>
            <Select
              value={draft.headerFormat}
              onValueChange={(val) =>
                onChange({
                  headerFormat: (val ??
                    'none') as WizardDraft['headerFormat'],
                })
              }
            >
              <SelectTrigger id="flow-header-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectContent>
            </Select>
            {draft.headerFormat === 'text' ? (
              <Input
                value={draft.headerContent}
                onChange={(e) => onChange({ headerContent: e.target.value })}
                maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                placeholder="Book your appointment"
                aria-label="Header text"
              />
            ) : null}
            {draft.headerFormat === 'image' ||
            draft.headerFormat === 'video' ||
            draft.headerFormat === 'document' ? (
              <Input
                value={draft.headerMediaUrl}
                onChange={(e) => onChange({ headerMediaUrl: e.target.value })}
                placeholder={`https://example.com/sample.${draft.headerFormat === 'video' ? 'mp4' : draft.headerFormat === 'document' ? 'pdf' : 'jpg'}`}
                aria-label="Header media sample URL"
              />
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            <Label htmlFor="flow-body">Body</Label>
            <Textarea
              id="flow-body"
              rows={4}
              value={draft.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.bodyMaxLength}
              placeholder="Hi {{1}}, tap below to pick a time that suits you."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {draft.bodyText.length}/{TEMPLATE_LIMITS.bodyMaxLength}
            </p>

            {bodyVarCount > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">
                  Example values
                </p>
                {bodySamples.map((val, i) => (
                  <Input
                    key={i}
                    value={val}
                    onChange={(e) => {
                      const next = [...bodySamples];
                      next[i] = e.target.value;
                      onChange({ bodySamples: next });
                    }}
                    placeholder={`Example for {{${i + 1}}}`}
                    aria-label={`Example value ${i + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-1.5">
            <Label htmlFor="flow-footer">Footer · optional</Label>
            <Input
              id="flow-footer"
              value={draft.footerText}
              onChange={(e) => onChange({ footerText: e.target.value })}
              maxLength={TEMPLATE_LIMITS.footerMaxLength}
              placeholder="Takes about a minute"
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            The Flow button is the only button on this template — Meta allows
            one, and no others alongside it.
          </p>
        </section>
      </div>

      {/* ---- Preview ---- */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Template preview
          </h3>
          <WhatsAppPreview
            definition={definition}
            values={draftBodyValues({ ...draft, bodySamples })}
            className="mt-3"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Tapping the button opens the Flow inside WhatsApp. The form itself
            is designed in Meta&apos;s Flow Builder, so it is not previewed
            here.
          </p>
        </div>
      </aside>
    </div>
  );
}
