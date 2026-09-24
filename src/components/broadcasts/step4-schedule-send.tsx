'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DateTimePickerField } from '@/components/ui/datetime-picker-field';
import {
  defaultOfferExpiryLocal,
  msToLocalInput,
  validateScheduleAt,
} from '@/lib/whatsapp/template-send-inputs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  CalendarClock,
  Send,
  Loader2,
  Users,
  Save,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
  excludedContactIds?: string[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
  /** Whether the operator chose to schedule rather than send now. */
  scheduleEnabled: boolean;
  onScheduleEnabledChange: (next: boolean) => void;
  /** `datetime-local` string in the operator's own timezone. */
  scheduledAtLocal: string;
  onScheduledAtLocalChange: (next: string) => void;
  /** Books the campaign for `scheduledAtLocal` instead of sending. */
  onSchedule: () => void;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
  scheduleEnabled,
  onScheduleEnabledChange,
  scheduledAtLocal,
  onScheduledAtLocalChange,
  onSchedule,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [showConfirm, setShowConfirm] = useState(false);

  /**
   * Validated against a clock read at render, so the "too soon" boundary
   * moves with real time rather than being frozen at mount — a form left
   * open for ten minutes must not still accept its original instant.
   */
  const scheduleCheck = useMemo(
    () =>
      scheduleEnabled
        ? validateScheduleAt(scheduledAtLocal)
        : { ok: true, problem: null, atMs: null, message: null },
    [scheduleEnabled, scheduledAtLocal]
  );

  /** Floor for the native picker. Advisory only — the check above is real. */
  const minScheduleLocal = useMemo(() => msToLocalInput(Date.now()), []);

  const localTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
    } catch {
      return 'local time';
    }
  }, []);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        let baseReach = 0;
        if (audience.type === 'all') {
          const { count } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });
          baseReach = count ?? 0;
        } else if (
          audience.type === 'tags' &&
          audience.tagIds &&
          audience.tagIds.length > 0
        ) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);

          const uniqueIds = new Set(
            (contactTags ?? []).map((ct) => ct.contact_id)
          );
          baseReach = uniqueIds.size;
        } else if (audience.type === 'csv' && audience.csvContacts) {
          baseReach = audience.csvContacts.length;
        }

        const manualExcluded = audience.excludedContactIds?.length ?? 0;
        setEstimatedReach(Math.max(0, baseReach - manualExcluded));
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : t('scheduleSend.audienceField');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">
          {t('scheduleSend.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          {t('scheduleSend.broadcastName')}
        </label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="border-border bg-card/50 space-y-3 rounded-xl border p-4">
        <p className="text-foreground text-sm font-medium">
          {t('scheduleSend.summary')}
        </p>
        <div className="grid min-w-0 grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">
              {t('scheduleSend.template')}
            </p>
            <p className="text-foreground min-w-0 break-all">{template.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {t('scheduleSend.audience')}
            </p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Estimated Reach</p>
            <div className="flex items-center gap-1.5">
              {loadingReach ? (
                <Loader2 className="text-primary h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Users className="text-primary h-3.5 w-3.5" />
                  <p className="text-foreground font-medium">
                    {estimatedReach.toLocaleString()}
                  </p>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Language</p>
            <p className="text-foreground">{template.language ?? 'en_US'}</p>
          </div>
        </div>
      </div>

      {/*
        Schedule campaign.

        The column and the 'scheduled' status have existed since the first
        migration but nothing ever wrote them, so this toggle is the first
        thing that makes them real. A scheduled send is executed by a
        server-side sweep, NOT by this browser — which is why the copy
        below promises it will send whether or not the tab stays open.
      */}
      <div className="border-border bg-card/50 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarClock className="text-primary h-4 w-4 shrink-0" />
              <p className="text-foreground text-sm font-medium">
                Schedule campaign
              </p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {scheduleEnabled
                ? 'Sends automatically at the time you pick. You can close this page.'
                : 'Off — the broadcast goes out as soon as you press Send now.'}
            </p>
          </div>
          <Switch
            checked={scheduleEnabled}
            onCheckedChange={(next: boolean) => {
              onScheduleEnabledChange(next);
              // Seed a sensible instant on first enable rather than an
              // empty field the operator has to discover is required.
              if (next && !scheduledAtLocal) {
                onScheduledAtLocalChange(defaultOfferExpiryLocal(1));
              }
            }}
            disabled={isProcessing}
          />
        </div>

        {scheduleEnabled && (
          <div className="border-border/60 mt-4 border-t pt-3">
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              Send at
            </label>
            <DateTimePickerField
              value={scheduledAtLocal}
              min={minScheduleLocal}
              onChange={onScheduledAtLocalChange}
              disabled={isProcessing}
              timeZone={localTimeZone}
              className="w-full sm:max-w-md"
            />
            {/*
              Times are the operator's own clock — `datetime-local` has no
              timezone, and it is stored as an absolute instant. Saying so
              avoids the "why did it send at 3am" support ticket from
              someone scheduling for a different region.
            */}
            <p className="text-muted-foreground mt-2 text-xs">
              Uses your device&apos;s timezone ({localTimeZone}). Sends within
              about 5 minutes of this time.
            </p>
            {scheduleCheck.message && (
              <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                {scheduleCheck.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="border-primary/20 bg-primary/5 rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="text-primary h-4 w-4 animate-spin" />
              <p className="text-foreground text-sm font-medium">
                {t('scheduleSend.sending')}
              </p>
            </div>
            <span className="text-primary text-xs font-medium">
              {progress}%
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full rounded-full">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogTrigger
              render={
                <Button
                  // A scheduled send is blocked on a VALID time, not merely
                  // on the toggle being on — otherwise the confirm dialog
                  // would open for an instant already in the past.
                  disabled={!name.trim() || isProcessing || !scheduleCheck.ok}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                />
              }
            >
              {scheduleEnabled ? (
                <CalendarClock className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {scheduleEnabled
                ? 'Schedule campaign'
                : t('scheduleSend.sendNow')}
            </DialogTrigger>
            <DialogContent className="border-border bg-popover sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-popover-foreground">
                  {scheduleEnabled ? 'Schedule broadcast' : 'Confirm Broadcast'}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {scheduleEnabled ? (
                    <>
                      This broadcast will be sent to{' '}
                      <span className="text-popover-foreground font-medium">
                        {estimatedReach.toLocaleString()}
                      </span>{' '}
                      contacts using the{' '}
                      <span className="text-popover-foreground font-medium">
                        {template.name}
                      </span>{' '}
                      template on{' '}
                      <span className="text-popover-foreground font-medium">
                        {scheduleCheck.atMs
                          ? new Date(scheduleCheck.atMs).toLocaleString()
                          : ''}
                      </span>
                      . The recipient list is worked out now and frozen, so
                      contacts added later will not be included. You can cancel
                      it from the broadcasts list until it sends.
                    </>
                  ) : (
                    <>
                      You are about to send this broadcast to{' '}
                      <span className="text-popover-foreground font-medium">
                        {estimatedReach.toLocaleString()}
                      </span>{' '}
                      contacts using the{' '}
                      <span className="text-popover-foreground font-medium">
                        {template.name}
                      </span>{' '}
                      template. This action cannot be undone.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="border-border text-muted-foreground"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => {
                    setShowConfirm(false);
                    if (scheduleEnabled) onSchedule();
                    else onSend();
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {scheduleEnabled ? (
                    <CalendarClock className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {scheduleEnabled
                    ? 'Schedule campaign'
                    : t('scheduleSend.sendNow')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
