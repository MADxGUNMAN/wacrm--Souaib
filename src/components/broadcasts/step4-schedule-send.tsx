'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Send, Clock, Loader2, Users, Lock, Save } from 'lucide-react';

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  contactIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
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
}: Step4Props) {
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [totalReach, setTotalReach] = useState<number>(0);
  const [excludedReach, setExcludedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        // 1. Calculate the base audience
        let baseSet: Set<string> | null = null;
        let total = 0;

        if (audience.type === 'all') {
          const { count } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });
          total = count ?? 0;
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);
          baseSet = new Set((contactTags ?? []).map((ct) => ct.contact_id));
          total = baseSet.size;
        } else if (audience.type === 'specific_contacts' && audience.contactIds) {
          baseSet = new Set(audience.contactIds);
          total = baseSet.size;
        } else if (audience.type === 'csv' && audience.csvContacts) {
          total = audience.csvContacts.length;
        }

        // 2. Calculate the exclude set (if any)
        let excludedCount = 0;
        if (audience.excludeTagIds && audience.excludeTagIds.length > 0 && audience.type !== 'csv') {
          const { data: excludeRows } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.excludeTagIds);
            
          const excludeSet = new Set((excludeRows ?? []).map((ct) => ct.contact_id));
          
          if (baseSet) {
             excludedCount = [...baseSet].filter(id => excludeSet.has(id)).length;
          } else if (audience.type === 'all') {
             excludedCount = excludeSet.size;
          }
        }

        setTotalReach(total);
        setExcludedReach(excludedCount);
        setEstimatedReach(Math.max(0, total - excludedCount));
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  const audienceLabel =
    audience.type === 'all'
      ? 'All Contacts'
      : audience.type === 'tags'
        ? `Tags (${audience.tagIds?.length ?? 0} selected)`
        : audience.type === 'csv'
          ? 'CSV Upload'
          : 'Custom';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review & Send</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Name your broadcast, review the details, and send.
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Broadcast Name</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Summer Sale Announcement"
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Summary</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Template</p>
            <p className="text-foreground">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Audience</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estimated Reach</p>
            <div className="flex flex-col gap-1 mt-0.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-violet-600" />
                    <p className="font-medium text-foreground">{estimatedReach.toLocaleString()} recipients</p>
                  </div>
                  {excludedReach > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      (Total {totalReach.toLocaleString()} - {excludedReach.toLocaleString()} excluded)
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Language</p>
            <p className="text-foreground">{template.language ?? 'en_US'}</p>
          </div>
        </div>
      </div>

      {/* Delivery Timing */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Delivery Timing</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => setTiming('now')}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              timing === 'now'
                ? 'border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/30'
                : 'border-border bg-card/50 hover:border-border'
            }`}
          >
            <Send className={`mt-0.5 h-4 w-4 ${timing === 'now' ? 'text-violet-600' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-sm font-medium text-foreground">Send Immediately</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Start sending right away</p>
            </div>
          </button>

          <div className="relative flex items-start gap-3 rounded-xl border border-border bg-card/30 p-4 opacity-60">
            <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Schedule for Later</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" />
                  Pro
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Pick a date and time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              <p className="text-sm font-medium text-foreground">Sending broadcast...</p>
            </div>
            <span className="text-xs font-medium text-violet-600">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-violet-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
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
              Save as Draft
            </Button>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogTrigger
            render={
              <Button
                disabled={!name.trim() || isProcessing}
                className="bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              />
            }
          >
            <Send className="h-4 w-4" />
            Send Broadcast
          </DialogTrigger>
          <DialogContent className="border-border bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Confirm Broadcast</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                You are about to send this broadcast to{' '}
                <span className="font-medium text-foreground">{estimatedReach.toLocaleString()}</span>{' '}
                contacts using the{' '}
                <span className="font-medium text-foreground">{template.name}</span> template.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="border-border text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  onSend();
                }}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                <Send className="h-4 w-4" />
                Confirm & Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
