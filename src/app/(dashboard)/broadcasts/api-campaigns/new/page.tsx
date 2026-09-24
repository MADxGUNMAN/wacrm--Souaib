'use client';

// ============================================================
// Create an API Campaign — deliberately the smallest form in the
// broadcasts area.
//
// Per plan §2.7 (screenshot 15): a campaign IS a name bound to an
// approved template. Nothing else — no audience, no schedule, no
// per-recipient variables — because those only exist once something
// external actually SENDS through the campaign (the Google Sheets
// add-on, or a direct API call). Adding more fields here would be
// configuring a send this screen has no recipient to send to.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plug } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import type { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import { definitionFromRow } from '@/lib/whatsapp/template-definition';
import { templateSendability } from '@/lib/whatsapp/template-sendability';

export default function NewApiCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [name, setName] = useState('');
  // '' rather than null for "nothing chosen yet". Base UI decides on the
  // FIRST render whether a Select is controlled, by testing
  // `value !== undefined` — so a value that starts undefined and later
  // becomes a string flips the component from uncontrolled to controlled
  // and warns. Empty string still renders the placeholder: Base UI's
  // `hasSelectedValue` treats '' and null identically.
  const [templateKey, setTemplateKey] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        // Approved only — the same guard step1-choose-template applies.
        // Anything else would 400 the first time a send is attempted
        // through the campaign, with no indication the campaign itself
        // was ever the problem.
        const { data, error } = await supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) setTemplates(data ?? []);
      } catch {
        if (!cancelled) toast.error('Failed to load templates');
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // A campaign run IS a broadcast (plan §4.1), so it inherits every
  // constraint `templateSendability(..., 'broadcast')` already enforces
  // — an order-status template, for instance, targets one order and is
  // refused in a broadcast context for exactly the same reason it would
  // be refused here.
  const sendableTemplates = useMemo(
    () => templates.filter((t) => templateSendability(t, 'broadcast').sendable),
    [templates]
  );

  // `name` + `language` together identify a template row — two
  // templates can share a name in different languages — so the select
  // value has to carry both rather than just the id, matching what the
  // create route looks the row up by.
  const selected = useMemo(
    () =>
      sendableTemplates.find(
        (t) => `${t.name}::${t.language ?? 'en_US'}` === templateKey
      ) ?? null,
    [sendableTemplates, templateKey]
  );

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Give the campaign a name');
      return;
    }
    if (!selected) {
      toast.error('Choose a template');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/account/api-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          template_name: selected.name,
          template_language: selected.language ?? 'en_US',
        }),
      });
      const payload = (await res.json()) as {
        campaign?: { id: string };
        error?: string;
      };
      if (!res.ok || !payload.campaign) {
        throw new Error(payload.error ?? 'Failed to create the campaign');
      }
      toast.success('API campaign created');
      router.push(`/broadcasts/api-campaigns/${payload.campaign.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create the campaign'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/broadcasts')}
          aria-label="Back to Broadcasts"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-lg font-semibold">
            <Plug className="text-primary h-5 w-5" />
            New API Campaign
          </h1>
          <p className="text-muted-foreground text-sm">
            Send messages from your own system — a spreadsheet, a script, or the
            Google Sheets add-on.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="border-border bg-card space-y-5 rounded-xl border p-6">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Order confirmations"
              maxLength={80}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="campaign-template">Template Name</Label>
            {loadingTemplates ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading templates…
              </div>
            ) : sendableTemplates.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No approved templates yet.{' '}
                <a
                  href="/templates/new"
                  className="text-primary font-medium hover:underline"
                >
                  Create new template
                </a>
              </p>
            ) : (
              <>
                <Select
                  value={templateKey}
                  // Base UI can emit null when a selection is cleared;
                  // letting that through would undo the controlled state
                  // the empty string above establishes.
                  onValueChange={(value) => setTemplateKey(value ?? '')}
                  disabled={submitting}
                >
                  <SelectTrigger id="campaign-template" className="w-full">
                    <SelectValue placeholder="Select a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sendableTemplates.map((t) => (
                      <SelectItem
                        key={`${t.name}::${t.language ?? 'en_US'}`}
                        value={`${t.name}::${t.language ?? 'en_US'}`}
                      >
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Can&apos;t find your template?{' '}
                  <a
                    href="/templates/new"
                    className="text-primary font-medium hover:underline"
                  >
                    Create new template
                  </a>
                </p>
              </>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !selected}
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              'Add Campaign'
            )}
          </Button>
        </div>

        {/* Live preview, matching screenshot 15. Reuses the same
            component the broadcast wizard and the inbox template
            picker render from, so the picture the operator sees here
            can never drift from what a recipient actually gets — see
            the design note at the top of whatsapp-preview.tsx. */}
        <div className="hidden lg:block">
          {/* Height-capped and scrollable, because a sticky element taller
              than the viewport is unreachable: it pins at `top-6` and
              never scrolls far enough to reveal its own bottom. Long
              templates — a promo with a link list, or a carousel — hit
              that easily, and the end of the message became impossible to
              read. Capping here rather than inside WhatsAppPreview keeps
              the component identical to the one the broadcast wizard and
              the inbox picker render, which is what stops the preview
              drifting from what a recipient actually gets. */}
          <div className="sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
            {selected ? (
              <WhatsAppPreview definition={definitionFromRow(selected)} />
            ) : (
              <div className="border-border bg-muted/30 flex h-64 items-center justify-center rounded-xl border border-dashed">
                <p className="text-muted-foreground px-6 text-center text-sm">
                  Pick a template to preview it here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
