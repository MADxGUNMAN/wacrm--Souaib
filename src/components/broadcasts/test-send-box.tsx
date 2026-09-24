'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, TestTube2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { readApiResponse } from '@/lib/http/read-api-response';
import type { MessageTemplate } from '@/types';
import type { SendValues } from '@/lib/whatsapp/template-send-inputs';

/** One placeholder the operator fills in to send a test. */
export interface TestVariableField {
  /** Placeholder key as the template addresses it: '1' or 'order_id'. */
  key: string;
  /** How it reads in the template: '{{1}}' or '{{order_id}}'. */
  label: string;
  /**
   * Value to start from. Carries over a static campaign mapping so the
   * operator does not retype what they already typed upstairs.
   */
  initialValue: string;
  /**
   * Where the real value will come from on a live send — e.g.
   * "Contact field: name". Shown under the input so the operator knows
   * this box is a stand-in for the campaign, not a change to it.
   */
  hint?: string;
}

interface TestSendBoxProps {
  template: MessageTemplate;
  /**
   * The recipient-independent values — media, offer expiry, carousel
   * cards, commerce fields. Built by the shared `sendValuesFromExtras`
   * mapper so the test is assembled exactly like the real send.
   */
  sharedValues: SendValues;
  /** One entry per placeholder the operator must supply to test. */
  variableFields: TestVariableField[];
  /** NAMED templates key their values by name rather than position. */
  isNamed: boolean;
  /**
   * Blocks sending while values this box CANNOT collect are still
   * missing — a header media URL, carousel card images, an offer
   * deadline. Body variables are deliberately not part of this: the box
   * gathers those itself.
   */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * "Send test message" — deliver this exact template to one number the
 * operator types, before the campaign goes to the whole audience.
 *
 * ─── Why this earns its place in the wizard ───────────────────────
 *
 * A broadcast is irreversible. A wrong header image, a variable that
 * renders blank, a link that 404s — all of it is already on every
 * recipient's phone by the time anyone notices. The preview beside this
 * box is a faithful render, but it is still OUR render: it cannot catch
 * a media URL Meta refuses to fetch, a button Meta strips, or a variable
 * count Meta rejects. Only a real send does.
 *
 * ─── Why it collects its own variable values ──────────────────────
 *
 * A test goes to a bare phone number, which has no contact row. So a
 * placeholder mapped to a contact field — the common case — has nothing
 * to resolve from. The first version sent empty strings for those, which
 * could never work: Meta rejects an empty text parameter outright, so
 * the test failed for exactly the templates people most want to test.
 *
 * Asking the operator for the values fixes that and is better anyway:
 * they get to see the message with realistic content, and they can try
 * a long name or an awkward character without touching the campaign's
 * mapping. Nothing typed here changes the broadcast.
 */
export function TestSendBox({
  template,
  sharedValues,
  variableFields,
  isNamed,
  disabled = false,
  disabledReason,
}: TestSendBoxProps) {
  const [phone, setPhone] = useState('');
  const [phoneValid, setPhoneValid] = useState(false);
  const [label, setLabel] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSentTo, setLastSentTo] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  // Seed from the campaign's static mappings, and re-seed when the
  // template changes. Keyed on the field list so switching template
  // cannot leave the previous template's answers behind.
  const seedKey = variableFields
    .map((f) => `${f.key}:${f.initialValue}`)
    .join('|');
  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, string> = {};
      for (const field of variableFields) {
        // Keep what the operator has already typed for this key; fall
        // back to the campaign's static value.
        next[field.key] = prev[field.key]?.trim()
          ? prev[field.key]
          : field.initialValue;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  /** Every placeholder needs something — Meta rejects empty parameters. */
  const unfilled = useMemo(
    () =>
      variableFields.filter((f) => !values[f.key]?.trim()).map((f) => f.label),
    [variableFields, values]
  );

  const canSend = phoneValid && !sending && !disabled && unfilled.length === 0;

  async function handleSend() {
    if (!canSend) return;

    setSending(true);
    setLastSentTo(null);
    try {
      // Positional templates want an ordered array; NAMED ones want a
      // map keyed by parameter name. `variableFields` is already in
      // template order, so the array needs no separate sort.
      const ordered = variableFields.map((f) => values[f.key] ?? '');
      const namedBody = isNamed
        ? Object.fromEntries(
            variableFields.map((f) => [f.key, values[f.key] ?? ''])
          )
        : undefined;

      const res = await fetch('/api/whatsapp/templates/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          template_name: template.name,
          template_language: template.language ?? 'en_US',
          params: isNamed ? [] : ordered,
          messageParams: {
            ...sharedValues,
            ...(isNamed ? { namedBody } : { body: ordered }),
          },
        }),
      });

      // Read as text first: a proxy error page would make res.json()
      // throw "Unexpected token <", which tells the operator nothing.
      const parsed = await readApiResponse<{
        success?: boolean;
        phone?: string;
      }>(res, 'sent');

      if (!parsed.ok) {
        // Meta's own refusal reason is the useful part, so show that
        // rather than a generic failure.
        toast.error(parsed.error ?? 'Failed to send the test message', {
          description: parsed.hint ?? undefined,
        });
        return;
      }

      setLastSentTo(parsed.data?.phone ?? phone);
      toast.success(
        label.trim()
          ? `Test message sent to ${label.trim()} (${parsed.data?.phone ?? phone})`
          : `Test message sent to ${parsed.data?.phone ?? phone}`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to send the test message'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        <TestTube2 className="text-primary h-4 w-4" />
        <p className="text-foreground text-sm font-medium">Send test message</p>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        Delivers this template to one number so you can check it on a real
        handset. Does not add the number to your contacts or inbox, and is not
        counted in the campaign.
      </p>

      {/*
        One input per placeholder. Present even when the campaign mapping
        is incomplete, because testing the message is a separate job from
        finishing the campaign — and blocking the test on the mapping was
        the thing that made this box unusable.
      */}
      {variableFields.length > 0 && (
        <div className="border-border/60 mb-3 rounded-md border border-dashed p-3">
          <p className="text-foreground mb-2 text-xs font-medium">
            Test values for this template&apos;s placeholders
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {variableFields.map((field) => (
              <div key={field.key}>
                <Label
                  htmlFor={`test-var-${field.key}`}
                  className="mb-1 block font-mono text-xs"
                >
                  {field.label}
                </Label>
                <Input
                  id={`test-var-${field.key}`}
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder="Value for this test"
                  disabled={sending}
                />
                {field.hint && (
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {field.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 text-[11px]">
            Used for this test only — your campaign&apos;s placeholder mapping
            is not changed.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="sm:w-44">
          <Label htmlFor="test-send-label" className="mb-1.5 block text-xs">
            Name{' '}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="test-send-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Who is this?"
            disabled={sending}
          />
        </div>

        <div className="min-w-0 flex-1">
          <Label htmlFor="test-send-phone" className="mb-1.5 block text-xs">
            Phone number
          </Label>
          <PhoneInput
            id="test-send-phone"
            value={phone}
            onChange={(fullE164, isValid) => {
              setPhone(fullE164);
              setPhoneValid(isValid);
            }}
            disabled={sending}
          />
        </div>

        <div className="sm:pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleSend}
            disabled={!canSend}
            className="w-full sm:w-auto"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending ? 'Sending' : 'Send'}
          </Button>
        </div>
      </div>

      {/* Say WHY the button is unavailable rather than leaving a dead control. */}
      {disabled && disabledReason && (
        <p className="text-muted-foreground mt-2 text-xs">{disabledReason}</p>
      )}

      {!disabled && unfilled.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">
          Fill every test value above before sending —{' '}
          <span className="font-mono">{unfilled.join(', ')}</span>{' '}
          {unfilled.length === 1 ? 'is' : 'are'} still empty, and Meta rejects a
          message with an empty placeholder.
        </p>
      )}

      {lastSentTo && !sending && (
        <p className="mt-2 text-xs text-emerald-400">
          Sent to {lastSentTo}. Check that handset — if nothing arrives within a
          minute, the number may not have opted in to receive messages from this
          business.
        </p>
      )}
    </div>
  );
}
