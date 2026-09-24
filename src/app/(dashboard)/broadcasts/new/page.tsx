'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import {
  EMPTY_SEND_EXTRAS,
  msToLocalInput,
  validateScheduleAt,
  type BroadcastSendExtras,
} from '@/lib/whatsapp/template-send-inputs';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const steps = [
  { label: 'template', key: 'template' },
  { label: 'audience', key: 'audience' },
  { label: 'personalize', key: 'personalize' },
  { label: 'send', key: 'send' },
] as const;

function NewBroadcastWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');

  const t = useTranslations('Broadcasts.new');
  const { accountId } = useAuth();
  const { createAndSendBroadcast, scheduleBroadcast, isProcessing, progress } =
    useBroadcastSending();

  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [audience, setAudience] = useState<{
    type: 'all' | 'tags' | 'custom_field' | 'csv';
    tagIds?: string[];
    customField?: {
      fieldId: string;
      operator: 'is' | 'is_not' | 'contains';
      value: string;
    };
    csvContacts?: { phone: string; name?: string }[];
    excludeTagIds?: string[];
    excludedContactIds?: string[];
  }>({ type: 'all' });
  const [variables, setVariables] = useState<
    Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>
  >({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  /**
   * Schedule-for-later, opt-in. Held here rather than in step 4 so the
   * choice survives stepping back to fix a variable — losing a chosen
   * send time on a Back click would be its own small betrayal.
   */
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  /** Offer expiry and per-card carousel values — one set for the whole send. */
  const [sendExtras, setSendExtras] =
    useState<BroadcastSendExtras>(EMPTY_SEND_EXTRAS);
  const [name, setName] = useState('');

  // Load draft data whenever draftId is present
  useEffect(() => {
    if (!draftId) {
      setLoadingDraft(false);
      return;
    }

    let cancelled = false;

    async function loadDraft(id: string) {
      setLoadingDraft(true);
      try {
        const supabase = createClient();
        const { data: bc, error } = await supabase
          .from('broadcasts')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (cancelled) return;
        if (error || !bc) {
          console.error('Draft load error:', error);
          toast.error('Draft not found');
          setLoadingDraft(false);
          return;
        }

        setName(bc.name || '');
        if (bc.template_variables) {
          setVariables(bc.template_variables);
        }
        if (bc.audience_filter) {
          setAudience(bc.audience_filter);
        }

        // Restore the send-time values that used to be lost on reload.
        // `csvContacts` is folded back into the audience because that is
        // where the rest of the wizard reads it from; audience_filter has
        // never carried it (the rows are synthetic, not a filter rule).
        const cfg = bc.send_config as {
          headerMediaUrl?: string;
          sendExtras?: BroadcastSendExtras | null;
          csvContacts?: { phone: string; name?: string }[] | null;
        } | null;
        if (cfg) {
          if (typeof cfg.headerMediaUrl === 'string') {
            setHeaderMediaUrl(cfg.headerMediaUrl);
          }
          if (cfg.sendExtras) {
            setSendExtras(cfg.sendExtras);
          }
          if (cfg.csvContacts && cfg.csvContacts.length > 0) {
            setAudience((prev) => ({ ...prev, csvContacts: cfg.csvContacts! }));
          }
        }

        // A scheduled broadcast opened for editing keeps its time, so
        // saving again does not silently turn it into an immediate send.
        if (bc.status === 'scheduled' && bc.scheduled_at) {
          const ms = new Date(bc.scheduled_at).getTime();
          if (Number.isFinite(ms)) {
            setScheduleEnabled(true);
            setScheduledAtLocal(msToLocalInput(ms));
          }
        }

        // Fetch APPROVED template matching name and language
        if (bc.template_name) {
          let query = supabase
            .from('message_templates')
            .select('*')
            .eq('name', bc.template_name)
            .eq('status', 'APPROVED');

          if (bc.template_language) {
            query = query.eq('language', bc.template_language);
          }

          const { data: tplRows } = await query
            .order('created_at', { ascending: false })
            .limit(1);

          let loadedTpl = tplRows?.[0] as MessageTemplate | undefined;

          // Fallback: any APPROVED template by name
          if (!loadedTpl) {
            const { data: fallbackRows } = await supabase
              .from('message_templates')
              .select('*')
              .eq('name', bc.template_name)
              .eq('status', 'APPROVED')
              .order('created_at', { ascending: false })
              .limit(1);
            loadedTpl = fallbackRows?.[0] as MessageTemplate | undefined;
          }

          // Ultimate fallback: any template row by name
          if (!loadedTpl) {
            const { data: anyRows } = await supabase
              .from('message_templates')
              .select('*')
              .eq('name', bc.template_name)
              .limit(1);
            loadedTpl = anyRows?.[0] as MessageTemplate | undefined;
          }

          if (!cancelled && loadedTpl) {
            setTemplate(loadedTpl);

            // If draft already has variables and audience, jump to Step 4 (Schedule & Send)
            const hasVars =
              bc.template_variables &&
              Object.keys(bc.template_variables).length > 0;
            const hasAudience = Boolean(bc.audience_filter?.type);

            if (hasAudience && hasVars) {
              setCurrentStep(3); // Step 4: Schedule & Send
            } else if (hasAudience) {
              setCurrentStep(2); // Step 3: Personalize
            } else {
              setCurrentStep(1); // Step 2: Select Audience
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Failed to load draft:', e);
          toast.error('Failed to load draft broadcast');
        }
      } finally {
        if (!cancelled) {
          setLoadingDraft(false);
        }
      }
    }

    void loadDraft(draftId);

    return () => {
      cancelled = true;
    };
  }, [draftId]);

  async function handleSend() {
    if (!template) return;

    try {
      const broadcastId = await createAndSendBroadcast({
        name,
        template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
          excludedContactIds: audience.excludedContactIds,
        },
        variables,
        headerMediaUrl,
        sendExtras,
        draftId: draftId ?? undefined,
      });
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Broadcast failed';
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  async function handleSchedule() {
    if (!template) return;

    // Re-validate at the moment of submit, not just on change. The form
    // can sit open long enough for a time that was comfortably ahead to
    // fall inside (or behind) the minimum lead.
    const check = validateScheduleAt(scheduledAtLocal);
    if (!check.ok || check.atMs === null) {
      toast.error(check.message ?? 'Pick a valid send time.');
      return;
    }

    try {
      const broadcastId = await scheduleBroadcast({
        name,
        template,
        audience: {
          type: audience.type,
          tagIds: audience.tagIds,
          customField: audience.customField,
          csvContacts: audience.csvContacts,
          excludeTagIds: audience.excludeTagIds,
          excludedContactIds: audience.excludedContactIds,
        },
        variables,
        headerMediaUrl,
        sendExtras,
        draftId: draftId ?? undefined,
        scheduledAtMs: check.atMs,
      });
      toast.success(
        `Scheduled for ${new Date(check.atMs).toLocaleString()}. You can close this page.`
      );
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to schedule broadcast';
      console.error('Schedule failed:', err);
      toast.error(message);
    }
  }

  async function handleSaveDraft() {
    if (!template || !name.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      toast.error(t('toastNotSignedIn'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNotLinked'));
      return;
    }

    const draftPayload = {
      name: name.trim(),
      template_name: template.name,
      template_language: template.language ?? 'en_US',
      template_variables: variables,
      audience_filter: {
        type: audience.type,
        tagIds: audience.tagIds,
        customField: audience.customField,
        excludeTagIds: audience.excludeTagIds,
        excludedContactIds: audience.excludedContactIds,
      },
      // Media, offer deadline, carousel cards and a CSV audience used to
      // be dropped on save, so reloading a draft carousel broadcast came
      // back with no card images and a CSV draft came back with no
      // audience at all. There is a column for them now.
      send_config: {
        headerMediaUrl,
        sendExtras,
        csvContacts: audience.csvContacts ?? null,
      },
      status: 'draft',
      // A draft that had been scheduled and is now being saved as a
      // plain draft must lose its send time, or the sweep would still
      // fire it.
      scheduled_at: null,
      total_recipients: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
      updated_at: new Date().toISOString(),
    };

    // Only `.message` is read below, and Supabase returns null on
    // success — so this is exactly the shape, rather than `any`.
    let error: { message: string } | null;
    if (draftId) {
      const res = await supabase
        .from('broadcasts')
        .update(draftPayload)
        .eq('id', draftId);
      error = res.error;
    } else {
      const res = await supabase.from('broadcasts').insert({
        ...draftPayload,
        user_id: user.id,
        account_id: accountId,
      });
      error = res.error;
    }

    if (error) {
      toast.error(t('toastFailedDraft', { error: error.message }));
      return;
    }
    toast.success(t('toastDraftSaved'));
    router.push('/broadcasts');
  }

  async function handleDeleteDraft() {
    if (!draftId) return;
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('broadcasts')
        .delete()
        .eq('id', draftId);

      if (error) throw error;
      toast.success('Draft deleted successfully');
      setShowDeleteConfirm(false);
      router.push('/broadcasts');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete draft';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }

  if (loadingDraft) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
        <p className="text-muted-foreground text-sm">
          Loading draft broadcast...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-foreground text-2xl font-bold">{t('title')}</h1>
            {draftId && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                Editing Draft
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>

        {draftId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="h-8 cursor-pointer gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Draft</span>
          </Button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isAccessible = index === 0 || template !== null;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <button
                type="button"
                disabled={!isAccessible}
                onClick={() => isAccessible && setCurrentStep(index)}
                className="group flex cursor-pointer items-center gap-2 text-left transition-opacity disabled:cursor-not-allowed"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground group-hover:opacity-90'
                      : isActive
                        ? 'border-primary bg-primary/10 text-primary border-2'
                        : 'border-border bg-muted text-muted-foreground group-hover:border-primary/50 border'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isActive
                      ? 'text-foreground font-semibold'
                      : isCompleted
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                >
                  {t(`steps.${step.label}`)}
                </span>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-px flex-1 ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="relative min-h-[400px]">
        <div
          className="transition-all duration-300 ease-in-out"
          style={{
            opacity: isProcessing ? 0.6 : 1,
            pointerEvents: isProcessing ? 'none' : 'auto',
          }}
        >
          {currentStep === 0 && (
            <Step1ChooseTemplate
              selectedTemplate={template}
              onSelect={(tpl) => {
                setTemplate(tpl);
                setCurrentStep(1);
              }}
              onNext={() => setCurrentStep(1)}
              onBack={() => router.push('/broadcasts')}
            />
          )}
          {currentStep === 1 && (
            <Step2SelectAudience
              audience={audience}
              onUpdate={setAudience}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
              // Decides whether unsubscribed contacts are skipped. Only
              // marketing templates are suppressed.
              templateCategory={template?.category}
            />
          )}
          {currentStep === 2 && template && (
            <Step3Personalize
              template={template}
              variables={variables}
              onUpdate={setVariables}
              headerMediaUrl={headerMediaUrl}
              onHeaderMediaUrlChange={setHeaderMediaUrl}
              sendExtras={sendExtras}
              onSendExtrasChange={setSendExtras}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && template && (
            <Step4ScheduleSend
              name={name}
              onNameChange={setName}
              template={template}
              audience={audience}
              onSend={handleSend}
              onSaveDraft={handleSaveDraft}
              onBack={() => setCurrentStep(2)}
              isProcessing={isProcessing}
              progress={progress}
              scheduleEnabled={scheduleEnabled}
              onScheduleEnabledChange={setScheduleEnabled}
              scheduledAtLocal={scheduledAtLocal}
              onScheduledAtLocalChange={setScheduledAtLocal}
              onSchedule={handleSchedule}
            />
          )}
        </div>
      </div>

      {/* Delete Draft Confirmation Modal */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setShowDeleteConfirm(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Draft</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this draft broadcast &ldquo;
              {name || 'Untitled Draft'}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDraft}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NewBroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="text-primary h-6 w-6 animate-spin" />
        </div>
      }
    >
      <NewBroadcastWizard />
    </Suspense>
  );
}
