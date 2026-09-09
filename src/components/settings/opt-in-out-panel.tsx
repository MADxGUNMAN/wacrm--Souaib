'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban,
  BookOpen,
  Check,
  Info,
  Loader2,
  Lock,
  Plus,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
// Pure module on purpose: `marketing-opt-out.ts` pulls in the Meta API
// layer and Supabase's client, none of which a settings form needs.
import {
  MAX_KEYWORDS,
  MAX_RESPONSE_MESSAGE_LENGTH,
  normalizeKeyword,
  normalizeKeywordList,
} from '@/lib/whatsapp/opt-out-keywords';
import { SettingsPanelHead } from './settings-panel-head';
import { OptOutList } from './opt-out-list';
import { OptOutFlowDiagram } from './opt-out-flow-diagram';
import { OptOutFlowPreviewDialog } from './opt-out-flow-preview-dialog';

interface ApiResponse {
  configured: boolean;
  config: {
    isActive: boolean;
    optOutKeywords: string[];
    optInKeywords: string[];
    optOutResponseMessage: string;
    optInResponseMessage: string;
  };
  opted_out_count: number;
  summary: {
    total: number;
    last_30_days: number;
    by_source: Record<string, number>;
  };
  can_edit: boolean;
  suggestions: { opt_out: string[]; opt_in: string[] };
  limits: {
    max_keywords: number;
    max_keyword_length: number;
    max_message_length: number;
  };
}

/**
 * One keyword list: chips with remove, an add box, and one-tap
 * suggestions. Extracted because the opt-out and opt-in halves are the
 * same control with different tones — two copies would drift.
 */
function KeywordEditor({
  idPrefix,
  label,
  hint,
  tone,
  keywords,
  suggestions,
  readOnly,
  /** Keeps the last opt-out keyword undeletable; opt-in may be emptied. */
  minKeywords,
  onChange,
}: {
  idPrefix: string;
  label: string;
  hint: string;
  tone: 'out' | 'in';
  keywords: string[];
  suggestions: string[];
  readOnly: boolean;
  minKeywords: number;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const chipTone =
    tone === 'out'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

  const add = (raw: string) => {
    const candidate = normalizeKeyword(raw);
    if (!candidate) return;
    if (keywords.includes(candidate)) {
      toast.error(`"${candidate}" is already in the list.`);
      setDraft('');
      return;
    }
    if (keywords.length >= MAX_KEYWORDS) {
      toast.error(`Use at most ${MAX_KEYWORDS} keywords.`);
      return;
    }
    onChange(normalizeKeywordList([...keywords, candidate]));
    setDraft('');
  };

  // Only suggest what is not already chosen, so the row shrinks as it is
  // used rather than offering no-ops.
  const unusedSuggestions = suggestions.filter((s) => !keywords.includes(s));

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-new`}>{label}</Label>
      <p className="text-muted-foreground text-xs">{hint}</p>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {keywords.length === 0 ? (
          <p className="text-muted-foreground/70 text-xs italic">
            No keywords — customers cannot use a word to opt in.
          </p>
        ) : null}

        {keywords.map((keyword) => (
          <span
            key={keyword}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-medium',
              chipTone
            )}
          >
            {keyword}
            {!readOnly && keywords.length > minKeywords ? (
              <button
                type="button"
                aria-label={`Remove ${keyword}`}
                onClick={() => onChange(keywords.filter((k) => k !== keyword))}
                className="opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}

        {!readOnly && keywords.length < MAX_KEYWORDS ? (
          <div className="flex items-center gap-1">
            <Input
              id={`${idPrefix}-new`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(draft);
                }
              }}
              placeholder="Add word"
              aria-label={`Add ${label.toLowerCase()}`}
              className="h-8 w-28 text-xs uppercase"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => add(draft)}
              aria-label={`Add ${label.toLowerCase()}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      {!readOnly && unusedSuggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-muted-foreground text-[11px]">Suggested:</span>
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-full border border-dashed px-2 py-0.5 font-mono text-[11px] transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OptInOutPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Draft state, separate from the server copy so an unsaved edit is never
  // confused with what the webhook is actually acting on.
  const [isActive, setIsActive] = useState(true);
  const [optOutKeywords, setOptOutKeywords] = useState<string[]>([]);
  const [optInKeywords, setOptInKeywords] = useState<string[]>([]);
  const [optOutMessage, setOptOutMessage] = useState('');
  const [optInMessage, setOptInMessage] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/opt-in-out');
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.error || 'Could not load opt-in/out settings.');
        return;
      }
      const body = payload as ApiResponse;
      setData(body);
      setIsActive(body.config.isActive);
      setOptOutKeywords(body.config.optOutKeywords);
      setOptInKeywords(body.config.optInKeywords);
      setOptOutMessage(body.config.optOutResponseMessage);
      setOptInMessage(body.config.optInResponseMessage);
    } catch {
      toast.error('Could not load opt-in/out settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (optOutKeywords.length === 0) {
      toast.error('Keep at least one opt-out keyword.');
      return;
    }
    const overlap = optOutKeywords.filter((k) => optInKeywords.includes(k));
    if (overlap.length > 0) {
      toast.error(
        `"${overlap[0]}" cannot be both an opt-out and an opt-in word.`
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/opt-in-out', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: isActive,
          opt_out_keywords: optOutKeywords,
          opt_in_keywords: optInKeywords,
          opt_out_response_message: optOutMessage,
          opt_in_response_message: optInMessage,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error || 'Could not save.');
        return;
      }
      toast.success(
        isActive
          ? 'Opt-in/out settings saved and active.'
          : 'Opt-in/out settings saved — keyword watching is off.'
      );
      await load();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="text-primary size-5 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const readOnly = !data.can_edit;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SettingsPanelHead
          title="Opt-in / opt-out"
          description="Let customers leave politely. People who cannot unsubscribe block you instead, and blocks are what damage your number's quality rating."
        />
        {/* Opens in a new tab: this panel is a form, and someone reading the
            guide usually wants it beside the settings they are changing. */}
        <a
          href="/settings/opt-out-guide"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground border-border hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
        >
          <BookOpen className="size-3.5" />
          Read the guide
        </a>
      </div>

      {readOnly ? (
        <div className="border-border bg-muted/40 flex items-start gap-2 rounded-lg border p-3">
          <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground text-xs">
            Only the account owner can change these settings. You can see the
            keywords and wording currently in use.
          </p>
        </div>
      ) : null}

      {/* ---- Status + master toggle ---- */}
      <div className="border-border bg-card rounded-xl border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Watch for keywords</Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              When on, a customer replying with one of the opt-out words below
              is unsubscribed automatically and gets a confirmation.
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={readOnly}
            aria-label="Watch for opt-in and opt-out keywords"
          />
        </div>

        <div className="border-border mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-t pt-4">
          <div>
            <p className="text-foreground text-2xl font-semibold tabular-nums">
              {data.summary.total.toLocaleString('en-US')}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.summary.total === 1 ? 'number' : 'numbers'} currently
              unsubscribed
            </p>
          </div>

          {/* The trend, not just the total. A flat total cannot tell you
              whether opt-outs are accelerating, which is the early warning
              that a campaign is annoying people. */}
          <div>
            <p className="text-foreground text-2xl font-semibold tabular-nums">
              {data.summary.last_30_days.toLocaleString('en-US')}
            </p>
            <p className="text-muted-foreground text-xs">in the last 30 days</p>
          </div>

          {data.summary.by_source.meta_131050 > 0 ? (
            <div>
              <p className="text-foreground text-2xl font-semibold tabular-nums">
                {data.summary.by_source.meta_131050.toLocaleString('en-US')}
              </p>
              <p className="text-muted-foreground text-xs">reported by Meta</p>
            </div>
          ) : null}

          {!data.configured ? (
            <p className="text-muted-foreground ml-auto text-xs">
              Using the built-in defaults — nothing saved yet.
            </p>
          ) : null}
        </div>

        {/* The single most important thing to understand about this screen:
            turning it off does NOT resume messaging people who already
            opted out. Said plainly so nobody discovers it by accident. */}
        <div className="border-border mt-4 flex items-start gap-2 border-t pt-3">
          <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Turning this off only stops watching for new keywords. Customers who
            already unsubscribed stay unsubscribed — withdrawn consent is not
            restored by a setting. Suppression applies to{' '}
            <strong>marketing</strong> templates only; utility and
            authentication messages such as order updates and one-time codes
            still go out.
          </p>
        </div>
      </div>

      {/* Driven by the DRAFT state, not the saved config, so the diagram
          reflects what the owner is currently editing. Seeing the branches
          update as keywords change is the point — it is what stops this
          being a static help illustration that drifts. */}
      <OptOutFlowDiagram
        isActive={isActive}
        optOutKeywords={optOutKeywords}
        optInKeywords={optInKeywords}
        onOpenPreview={() => setPreviewOpen(true)}
      />

      {/* Mounted only once opened: it pulls in React Flow, which is a large
          dependency and has no business loading for somebody who just came
          to change a keyword. */}
      {previewOpen ? (
        <OptOutFlowPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          isActive={isActive}
          optOutKeywords={optOutKeywords}
          optInKeywords={optInKeywords}
          optOutMessage={optOutMessage}
          optInMessage={optInMessage}
        />
      ) : null}

      {/* ---- The two keyword sets ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Opt-out */}
        <div className="border-border bg-card space-y-4 rounded-xl border p-5">
          <div className="flex items-center gap-2">
            <span className="bg-destructive/10 text-destructive flex size-7 items-center justify-center rounded-lg">
              <Ban className="size-4" />
            </span>
            <h3 className="text-foreground text-sm font-semibold">Opt-out</h3>
          </div>

          <KeywordEditor
            idPrefix="opt-out"
            label="Opt-out keywords"
            hint="Matched against the whole message, ignoring case and trailing punctuation. “stop by tomorrow” will not unsubscribe anyone."
            tone="out"
            keywords={optOutKeywords}
            suggestions={data.suggestions.opt_out}
            readOnly={readOnly}
            minKeywords={1}
            onChange={setOptOutKeywords}
          />

          <div className="border-border space-y-1.5 border-t pt-4">
            <Label htmlFor="opt-out-message">Confirmation reply</Label>
            <Textarea
              id="opt-out-message"
              value={optOutMessage}
              onChange={(e) => setOptOutMessage(e.target.value)}
              disabled={readOnly}
              rows={3}
              maxLength={MAX_RESPONSE_MESSAGE_LENGTH}
              className="text-sm"
            />
            <p className="text-muted-foreground text-[11px]">
              Sent once, straight after they unsubscribe. Leave blank to use the
              default wording.
            </p>
          </div>
        </div>

        {/* Opt-in */}
        <div className="border-border bg-card space-y-4 rounded-xl border p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" />
            </span>
            <h3 className="text-foreground text-sm font-semibold">Opt-in</h3>
          </div>

          <KeywordEditor
            idPrefix="opt-in"
            label="Opt-in keywords"
            hint="Lets somebody re-subscribe themselves. Leave empty if you would rather only your team can do that."
            tone="in"
            keywords={optInKeywords}
            suggestions={data.suggestions.opt_in}
            readOnly={readOnly}
            minKeywords={0}
            onChange={setOptInKeywords}
          />

          <div className="border-border space-y-1.5 border-t pt-4">
            <Label htmlFor="opt-in-message">Confirmation reply</Label>
            <Textarea
              id="opt-in-message"
              value={optInMessage}
              onChange={(e) => setOptInMessage(e.target.value)}
              disabled={readOnly}
              rows={3}
              maxLength={MAX_RESPONSE_MESSAGE_LENGTH}
              className="text-sm"
            />
            <p className="text-muted-foreground text-[11px]">
              Sent once, straight after they opt back in. Leave blank to use the
              default wording.
            </p>
          </div>
        </div>
      </div>

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      ) : null}

      {/* Who is actually suppressed. `onChanged` re-reads the summary above
          so the headline count cannot disagree with the list under it. */}
      <OptOutList onChanged={load} />
    </div>
  );
}
