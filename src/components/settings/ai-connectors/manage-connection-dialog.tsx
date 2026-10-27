'use client';

// Manage one connection: label, read-only, action groups, caps, recent
// activity, disconnect. The server clamps every switch to what was granted
// at consent and what the workspace policy allows; the switches here are
// disabled for the same reasons so nothing looks on that wouldn't work.

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  GROUP_LABELS,
  actionLabel,
  api,
  blockMessage,
  type ActivityView,
  type ConnectionView,
  type SettingsGroup,
} from './shared';

export function ManageConnectionDialog({
  connection,
  open,
  onOpenChange,
  onSaved,
  onDisconnect,
}: {
  connection: ConnectionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (c: ConnectionView) => void;
  onDisconnect: (c: ConnectionView) => void;
}) {
  const [label, setLabel] = useState(connection.label ?? '');
  const [readOnly, setReadOnly] = useState(connection.settings.read_only);
  const [groups, setGroups] = useState(connection.settings.groups);
  const [cap, setCap] = useState(
    String(connection.settings.caps.messages_per_day)
  );
  const [idle, setIdle] = useState(String(connection.settings.idle_days));
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<ActivityView[] | null>(null);

  // Reset the form whenever a (fresh) connection is shown.
  useEffect(() => {
    if (!open) return;
    setLabel(connection.label ?? '');
    setReadOnly(connection.settings.read_only);
    setGroups(connection.settings.groups);
    setCap(String(connection.settings.caps.messages_per_day));
    setIdle(String(connection.settings.idle_days));
  }, [open, connection]);

  const loadActivity = useCallback(async () => {
    try {
      const r = await api<{ items: ActivityView[] }>(
        `/api/ai-connectors/${connection.id}/activity?limit=50`
      );
      setActivity(r.items);
    } catch {
      setActivity([]);
    }
  }, [connection.id]);

  useEffect(() => {
    if (open) void loadActivity();
  }, [open, loadActivity]);

  const availability = new Map(
    connection.availability.map((a) => [a.group, a])
  );

  const save = async () => {
    const capNum = Number.parseInt(cap, 10);
    const idleNum = Number.parseInt(idle, 10);
    if (!Number.isFinite(capNum) || capNum < 0)
      return toast.error('Enter a daily message limit of 0 or more.');
    if (!Number.isFinite(idleNum) || idleNum < 1 || idleNum > 90)
      return toast.error('Auto-disconnect must be between 1 and 90 days.');
    setSaving(true);
    try {
      const r = await api<{ connection: ConnectionView; adjusted: string[] }>(
        `/api/ai-connectors/${connection.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            label: label.trim() || null,
            settings: {
              read_only: readOnly,
              groups,
              messages_per_day: capNum,
              idle_days: idleNum,
            },
          }),
        }
      );
      if (r.adjusted.length)
        toast.message(
          'Saved. Some values were limited by your workspace settings.'
        );
      else toast.success('Connection settings saved.');
      onSaved(r.connection);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (group: SettingsGroup, value: boolean) =>
    setGroups((g) => ({ ...g, [group]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage {connection.app_name}</DialogTitle>
          <DialogDescription>
            {connection.is_mine
              ? 'Changes apply to the next thing it does.'
              : `${connection.user.name ?? connection.user.email ?? 'A teammate'}'s connection. Changes apply to the next thing it does.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="ai-conn-label">Label</Label>
            <Input
              id="ai-conn-label"
              value={label}
              maxLength={80}
              placeholder={`e.g. ${connection.app_name} on my laptop`}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <label className="border-border flex items-start gap-3 rounded-lg border p-3">
            <Switch
              checked={readOnly}
              onCheckedChange={(v: boolean) => setReadOnly(v)}
              aria-label="Read-only"
            />
            <span>
              <span className="text-foreground block text-sm font-medium">
                Read-only
              </span>
              <span className="text-muted-foreground block text-xs">
                Can look things up but every change or send is refused.
              </span>
            </span>
          </label>

          <fieldset className="space-y-2" disabled={readOnly}>
            <legend className="text-foreground mb-1 text-sm font-semibold">
              What it may do
            </legend>
            {(Object.keys(GROUP_LABELS) as SettingsGroup[]).map((group) => {
              const a = availability.get(group);
              const message = blockMessage(
                a?.block ?? null,
                connection.app_name
              );
              const id = `ai-group-${group}`;
              return (
                <div
                  key={group}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor={id}
                      className="text-foreground block text-sm"
                    >
                      {GROUP_LABELS[group].title}
                    </label>
                    <p className="text-muted-foreground text-xs">
                      {message ?? GROUP_LABELS[group].desc}
                    </p>
                  </div>
                  <Switch
                    id={id}
                    checked={Boolean(groups[group]) && Boolean(a?.available)}
                    disabled={readOnly || !a?.available}
                    onCheckedChange={(v: boolean) => toggle(group, v)}
                  />
                </div>
              );
            })}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-conn-cap">Messages per day</Label>
              <Input
                id="ai-conn-cap"
                type="number"
                min={0}
                max={connection.message_cap_limit}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Up to {connection.message_cap_limit} in this workspace.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-conn-idle">
                Disconnect after unused for (days)
              </Label>
              <Input
                id="ai-conn-idle"
                type="number"
                min={1}
                max={90}
                value={idle}
                onChange={(e) => setIdle(e.target.value)}
              />
            </div>
          </div>

          <div>
            <h3 className="text-foreground text-sm font-semibold">
              Recent activity
            </h3>
            {activity === null ? (
              <div className="text-muted-foreground flex items-center gap-2 py-3 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : activity.length === 0 ? (
              <p className="text-muted-foreground py-3 text-xs">Nothing yet.</p>
            ) : (
              <ul className="divide-border mt-2 max-h-56 divide-y overflow-y-auto rounded-lg border text-xs">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {format(new Date(a.created_at), 'dd MMM HH:mm')}
                    </span>
                    <span className="text-foreground min-w-0 flex-1 truncate font-mono">
                      {actionLabel(a.action)}
                    </span>
                    <OutcomeDot outcome={a.outcome} reason={a.deny_reason} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={() => onDisconnect(connection)}
          >
            Disconnect
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OutcomeDot({
  outcome,
  reason,
}: {
  outcome: string;
  reason: string | null;
}) {
  const ok = outcome === 'ok';
  return (
    <span
      className={
        ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
      }
      title={reason ?? undefined}
    >
      {ok ? '✔' : outcome === 'denied' ? '✖ refused' : '✖ error'}
    </span>
  );
}
