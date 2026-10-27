'use client';

// Workspace AI policy — owners only. Applies to every connection in the
// workspace on its next call. The platform lock (super admin) is shown
// but can't be changed here.

import { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Platform } from '@/lib/ai-connector/platforms';
import { PLATFORM_NAMES, api, type WorkspacePolicy } from './shared';

type BoolKey =
  | 'enabled'
  | 'members_allowed'
  | 'allow_messaging'
  | 'allow_broadcasts'
  | 'allow_automation_changes'
  | 'require_preview_for_sends';

const SWITCHES: { key: BoolKey; title: string; desc: string }[] = [
  {
    key: 'enabled',
    title: 'Allow AI connectors in this workspace',
    desc: 'Off refuses every AI app call.',
  },
  {
    key: 'members_allowed',
    title: 'Members can connect',
    desc: 'Off allows connections for the owner only.',
  },
  {
    key: 'allow_messaging',
    title: 'Sending messages',
    desc: 'AI apps may send WhatsApp messages and templates.',
  },
  {
    key: 'allow_broadcasts',
    title: 'Broadcasts',
    desc: 'AI apps may send broadcasts after a preview.',
  },
  {
    key: 'allow_automation_changes',
    title: 'Automations on/off',
    desc: 'AI apps may turn automations and flows on or off.',
  },
  {
    key: 'require_preview_for_sends',
    title: 'Require a preview before every message',
    desc: 'Every send needs a preview and confirmation first.',
  },
];

export function WorkspacePolicyCard({
  policy,
  platforms,
  onSaved,
}: {
  policy: WorkspacePolicy;
  platforms: Platform[];
  onSaved: (p: WorkspacePolicy) => void;
}) {
  const [draft, setDraft] = useState(policy);
  const [msgCap, setMsgCap] = useState(String(policy.daily_message_cap));
  const [rcptCap, setRcptCap] = useState(
    String(policy.daily_broadcast_recipient_cap)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(policy);
    setMsgCap(String(policy.daily_message_cap));
    setRcptCap(String(policy.daily_broadcast_recipient_cap));
  }, [policy]);

  const setBool = (key: BoolKey, value: boolean) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const togglePlatform = (p: Platform, on: boolean) =>
    setDraft((d) => ({
      ...d,
      allowed_platforms: on
        ? [...new Set([...d.allowed_platforms, p])]
        : d.allowed_platforms.filter((x) => x !== p),
    }));

  const save = async () => {
    const m = Number.parseInt(msgCap, 10);
    const r = Number.parseInt(rcptCap, 10);
    if (!Number.isFinite(m) || m < 0 || !Number.isFinite(r) || r < 0) {
      return toast.error('Daily limits must be 0 or more.');
    }
    setSaving(true);
    try {
      const res = await api<{ policy: WorkspacePolicy }>(
        '/api/ai-connectors/policy',
        {
          method: 'PUT',
          body: JSON.stringify({
            ...draft,
            daily_message_cap: m,
            daily_broadcast_recipient_cap: r,
          }),
        }
      );
      toast.success('Workspace AI policy saved.');
      onSaved(res.policy);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="border-border bg-card rounded-xl border p-5"
      aria-labelledby="ai-policy-heading"
    >
      <h3
        id="ai-policy-heading"
        className="text-foreground text-sm font-semibold"
      >
        Workspace policy
      </h3>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Limits every AI connection in this workspace, including members&rsquo;.
        Changes apply on their next call.
      </p>

      {policy.locked_by_platform ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Replai has switched off AI connectors for this workspace. Contact
          support to turn them back on.
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {SWITCHES.map((s) => (
          <div key={s.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label
                htmlFor={`ai-pol-${s.key}`}
                className="text-foreground block text-sm"
              >
                {s.title}
              </label>
              <p className="text-muted-foreground text-xs">{s.desc}</p>
            </div>
            <Switch
              id={`ai-pol-${s.key}`}
              checked={draft[s.key]}
              onCheckedChange={(v: boolean) => setBool(s.key, v)}
            />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="text-foreground text-sm">Apps allowed</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {platforms.map((p) => (
            <label
              key={p}
              className="text-foreground flex items-center gap-2 text-sm"
            >
              <Switch
                checked={draft.allowed_platforms.includes(p)}
                onCheckedChange={(v: boolean) => togglePlatform(p, v)}
                aria-label={PLATFORM_NAMES[p]}
              />
              {PLATFORM_NAMES[p]}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ai-pol-tier">Highest member access</Label>
          <select
            id="ai-pol-tier"
            value={draft.max_member_tier}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                max_member_tier: e.target
                  .value as WorkspacePolicy['max_member_tier'],
              }))
            }
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="view">View only</option>
            <option value="edit">Edit records</option>
            <option value="send">Send messages</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-pol-msg">Messages per day</Label>
          <Input
            id="ai-pol-msg"
            type="number"
            min={0}
            value={msgCap}
            onChange={(e) => setMsgCap(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-pol-rcpt">Broadcast recipients per day</Label>
          <Input
            id="ai-pol-rcpt"
            type="number"
            min={0}
            value={rcptCap}
            onChange={(e) => setRcptCap(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Save policy'
          )}
        </Button>
      </div>
    </section>
  );
}
