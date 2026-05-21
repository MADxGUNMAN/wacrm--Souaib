'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ArrowRight } from 'lucide-react';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400',
  Utility: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  Authentication: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
};

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseTemplate({ selectedTemplate, onSelect, onNext, onBack }: Step1Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setTemplates(data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Choose a Template</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select an approved message template for your broadcast.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-slate-600" />
          <p className="text-sm text-muted-foreground">No templates available.</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a template in Settings first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            const catColor = categoryColors[template.category] ?? categoryColors.Utility;

            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className={`group flex flex-col justify-between gap-4 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/30 shadow-sm'
                    : 'border-border bg-card/50 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-card hover:shadow-sm'
                }`}
              >
                <div className="space-y-3 w-full">
                  <div className="flex w-full items-start justify-between gap-2 min-w-0">
                    <h3 
                      className="min-w-0 flex-1 text-sm font-semibold text-foreground break-all tracking-tight leading-tight" 
                      title={template.name}
                    >
                      {template.name}
                    </h3>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${catColor}`}
                    >
                      {template.category}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed bg-muted/30 p-2.5 rounded-lg border border-border/30">
                    {template.body_text}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 mt-1 font-mono uppercase">
                  <span className="bg-muted px-1.5 py-0.5 rounded border border-border/40 font-medium">{template.language ?? 'en_US'}</span>
                  {template.status && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className={`px-1.5 py-0.5 rounded border border-border/40 font-medium ${
                        template.status.toLowerCase() === 'approved' 
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/10' 
                          : 'text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/10'
                      }`}>
                        {template.status}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
