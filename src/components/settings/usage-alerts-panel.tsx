'use client';

// ============================================================
// Settings → Usage alerts
//
// A message budget with warning steps, shaped like an AWS budget alarm:
// current usage against the limit, the thresholds that will notify, and
// which ones have already fired this period.
//
// It never blocks sending, and the UI says so out loud. An operator who
// thinks this is a hard cap will set it low "to be safe" and then wonder
// why nothing stopped — or worse, expect it to protect them and find it
// did not.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
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
import { cn } from '@/lib/utils';
import {
  DEFAULT_THRESHOLDS,
  MAX_THRESHOLD_COUNT,
  normalizeThresholds,
  type UsageAlertPeriod,
} from '@/lib/alerts/usage-alerts';
import { SettingsPanelHead } from './settings-panel-head';

interface ApiResponse {
  alert: {
    enabled: boolean;
    period: UsageAlertPeriod;
    message_limit: number;
    thresholds: number[];
    last_evaluated_at: string | null;
  } | null;
  usage: {
    used: number;
    period: UsageAlertPeriod;
    period_label: string;
    period_resets_at: string | null;
  };
  status: {
    level: 'ok' | 'warning' | 'critical';
    percent: number;
    crossed: number[];
    next: number | null;
    remainingToNext: number | null;
  } | null;
  fired_this_period: number[];
  can_edit: boolean;
  defaults: {
    period: UsageAlertPeriod;
    thresholds: number[];
    suggested_limit: number;
  };
}

const PERIOD_COPY: Record<UsageAlertPeriod, { label: string; resets: string }> =
  {
    weekly: { label: 'Weekly', resets: 'Resets every Monday' },
    monthly: { label: 'Monthly', resets: 'Resets on the 1st' },
  };

export function UsageAlertsPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Draft state, separate from the server copy so an unsaved edit is
  // never confused with what is actually running.
  const [enabled, setEnabled] = useState(false);
  const [period, setPeriod] = useState<UsageAlertPeriod>('monthly');
  const [limit, setLimit] = useState('');
  const [thresholds, setThresholds] = useState<number[]>(DEFAULT_THRESHOLDS);
  const [newThreshold, setNewThreshold] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alerts/usage');
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.error || 'Could not load usage alerts.');
        return;
      }
      const body = payload as ApiResponse;
      setData(body);
      setEnabled(body.alert?.enabled ?? false);
      setPeriod(body.alert?.period ?? body.defaults.period);
      setLimit(
        body.alert
          ? String(body.alert.message_limit)
          : String(body.defaults.suggested_limit)
      );
      setThresholds(body.alert?.thresholds ?? body.defaults.thresholds);
    } catch {
      toast.error('Could not load usage alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const parsed = Number.parseInt(limit, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error('Enter a message limit of at least 1.');
      return;
    }
    if (thresholds.length === 0) {
      toast.error('Add at least one threshold.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/alerts/usage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          period,
          message_limit: parsed,
          thresholds,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error || 'Could not save.');
        return;
      }
      toast.success(
        enabled ? 'Usage alert saved and active.' : 'Usage alert saved (off).'
      );
      await load();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const addThreshold = () => {
    const merged = normalizeThresholds([...thresholds, newThreshold]);
    if (merged.length === thresholds.length) {
      toast.error('Enter a new percentage between 1 and 200.');
      return;
    }
    setThresholds(merged);
    setNewThreshold('');
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
  const used = data.usage.used;
  const parsedLimit = Number.parseInt(limit, 10);
  // Previewed against the DRAFT limit, so dragging the number shows its
  // effect before saving.
  const livePercent =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.round((used / parsedLimit) * 100)
      : null;

  const barTone =
    livePercent === null
      ? 'bg-muted-foreground'
      : livePercent >= 100
        ? 'bg-destructive'
        : livePercent >= 80
          ? 'bg-amber-500'
          : 'bg-primary';

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Usage alerts"
        description="Get told when this workspace approaches the number of WhatsApp messages you budgeted for the week or month."
      />

      {readOnly ? (
        <div className="border-border bg-muted/40 flex items-start gap-2 rounded-lg border p-3">
          <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground text-xs">
            Only the account owner can change these settings. You can see the
            current usage and thresholds.
          </p>
        </div>
      ) : null}

      {/* ---- Current period ---- */}
      <div className="border-border bg-card rounded-xl border p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              This {data.usage.period === 'monthly' ? 'month' : 'week'}
            </h3>
            <p className="text-muted-foreground text-xs">
              {data.usage.period_label}
              {data.usage.period_resets_at
                ? ` · resets ${new Date(data.usage.period_resets_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
                : ''}
            </p>
          </div>
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {used.toLocaleString('en-US')}
            {Number.isFinite(parsedLimit) && parsedLimit > 0 ? (
              <span className="text-muted-foreground text-sm font-normal">
                {' / '}
                {parsedLimit.toLocaleString('en-US')}
              </span>
            ) : null}
          </p>
        </div>

        {livePercent !== null ? (
          <>
            <div
              className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={Math.min(100, livePercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Messages used this period"
            >
              <div
                className={cn('h-full rounded-full transition-all', barTone)}
                style={{ width: `${Math.min(100, livePercent)}%` }}
              />
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {livePercent}% of the limit used.
              {data.status?.remainingToNext != null && data.status.next != null
                ? ` About ${data.status.remainingToNext.toLocaleString('en-US')} more messages would reach ${data.status.next}%.`
                : ''}
            </p>
          </>
        ) : null}

        {/* Counted-what disclosure. Without it the number invites a
            "why doesn't this match Meta" question, and the answer is that
            they measure different things. */}
        <div className="border-border mt-4 flex items-start gap-2 border-t pt-3">
          <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Counts every message this workspace sent — by your team, by
            automations and AI, and from the WhatsApp Business App on your
            phone. It is your own budget, not Meta&apos;s limit: Meta caps how
            many <em>new customers</em> you can start a chat with per day, which
            is a different number shown under WhatsApp Setup. Periods run in
            UTC.
          </p>
        </div>
      </div>

      {/* ---- Configuration ---- */}
      <div className="border-border bg-card space-y-5 rounded-xl border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">Alert me about usage</Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Turn this off to keep the settings but stop the notifications.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={readOnly}
            aria-label="Enable usage alerts"
          />
        </div>

        <div className="border-border grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="alert-period">Budget period</Label>
            <div className="flex gap-2">
              {(['weekly', 'monthly'] as UsageAlertPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60',
                    period === p
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  <span className="text-foreground block text-sm font-medium">
                    {PERIOD_COPY[p].label}
                  </span>
                  <span className="text-muted-foreground block text-[11px]">
                    {PERIOD_COPY[p].resets}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-limit">Message limit</Label>
            <Input
              id="alert-limit"
              inputMode="numeric"
              value={limit}
              disabled={readOnly}
              onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))}
              placeholder="10000"
            />
            <p className="text-muted-foreground text-[11px]">
              How many messages you plan to send per{' '}
              {period === 'monthly' ? 'month' : 'week'}.
            </p>
          </div>
        </div>

        {/* ---- Thresholds ---- */}
        <div className="border-border space-y-2 border-t pt-5">
          <Label>Notify at</Label>
          <p className="text-muted-foreground text-xs">
            Percentages of the limit. Each one notifies once per{' '}
            {period === 'monthly' ? 'month' : 'week'} — you will not be told
            twice about the same step.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {thresholds.map((t) => {
              const alreadyFired = data.fired_this_period.includes(t);
              return (
                <span
                  key={t}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                    alreadyFired
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-foreground'
                  )}
                  title={
                    alreadyFired
                      ? 'Already notified this period'
                      : 'Not reached yet this period'
                  }
                >
                  {alreadyFired ? <CheckCircle2 className="size-3" /> : null}
                  {t}%
                  <span className="text-muted-foreground tabular-nums">
                    (
                    {Number.isFinite(parsedLimit) && parsedLimit > 0
                      ? Math.ceil((t / 100) * parsedLimit).toLocaleString(
                          'en-US'
                        )
                      : '—'}
                    )
                  </span>
                  {!readOnly && thresholds.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove ${t}% threshold`}
                      onClick={() =>
                        setThresholds((prev) => prev.filter((v) => v !== t))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </span>
              );
            })}

            {!readOnly && thresholds.length < MAX_THRESHOLD_COUNT ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newThreshold}
                  inputMode="numeric"
                  onChange={(e) =>
                    setNewThreshold(e.target.value.replace(/\D/g, ''))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addThreshold();
                    }
                  }}
                  placeholder="%"
                  aria-label="New threshold percentage"
                  className="h-8 w-16 text-xs"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={addThreshold}
                  aria-label="Add threshold"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
          {thresholds.some((t) => t > 100) ? (
            <p className="text-muted-foreground flex items-start gap-1.5 pt-1 text-[11px]">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
              A threshold above 100% fires only after you have gone over budget.
              Useful as a second, louder warning.
            </p>
          ) : null}
        </div>

        {/* ---- Who gets it ---- */}
        <div className="border-border border-t pt-5">
          <Label>Who gets notified</Label>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            You, as the account owner, always. To include a team member, turn on{' '}
            <span className="text-foreground font-medium">Usage Alerts</span>{' '}
            for them under{' '}
            <span className="text-foreground font-medium">
              Team members → Edit permissions → Settings
            </span>
            . Notifications appear in the bell menu; nothing is emailed.
          </p>
        </div>

        {!readOnly ? (
          <div className="border-border flex items-center justify-between gap-3 border-t pt-5">
            <p className="text-muted-foreground text-xs">
              {data.alert?.last_evaluated_at
                ? `Last checked ${new Date(data.alert.last_evaluated_at).toLocaleString('en-GB')}.`
                : 'Usage is checked every few minutes once this is on.'}
            </p>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        ) : null}
      </div>

      {/* Sending is never blocked. Said plainly, because an operator who
          believes this is a hard cap will set it wrong in both directions. */}
      <div className="border-border bg-muted/30 flex items-start gap-2 rounded-lg border p-3">
        <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p className="text-muted-foreground text-xs leading-relaxed">
          This alert only warns you — it never blocks a message. A CRM that
          silently stopped replying to customers because of a number typed in
          Settings would be worse than going over budget.
        </p>
      </div>
    </div>
  );
}
