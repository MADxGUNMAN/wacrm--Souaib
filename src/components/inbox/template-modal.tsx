'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Loader2, Send } from 'lucide-react';
import type { MessageTemplate } from '@/types';
import type { ComposerMessage } from './message-composer';
import { cn } from '@/lib/utils';

interface TemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (message: ComposerMessage) => void;
}

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400',
  Utility: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  Authentication: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
};

export function TemplateModal({ open, onOpenChange, onSend }: TemplateModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setSelectedTemplate(null);
      setVariables({});
      return;
    }

    let cancelled = false;
    const fetchTemplates = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('message_templates')
        .select('*')
        .ilike('status', 'approved')
        .order('created_at', { ascending: false });

      if (!cancelled && data) {
        setTemplates(data);
      }
      if (!cancelled) setLoading(false);
    };

    fetchTemplates();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const placeholders = useMemo(() => {
    if (!selectedTemplate) return [];
    const matches = selectedTemplate.body_text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    // Extract numbers, sort them numerically
    return [...new Set(matches)]
      .map(p => p.replace(/^\{\{|\}\}$/g, ''))
      .sort((a, b) => parseInt(a) - parseInt(b));
  }, [selectedTemplate]);

  const allVariablesFilled = placeholders.every(p => variables[p]?.trim());

  const handleSend = () => {
    if (!selectedTemplate) return;
    
    // Convert variables record to ordered array based on placeholders
    const paramsArray = placeholders.map(p => variables[p].trim());

    onSend({
      messageType: 'template',
      templateName: selectedTemplate.name,
      templateLanguage: selectedTemplate.language || 'en_US',
      templateParams: paramsArray.length > 0 ? paramsArray : undefined,
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Send Message Template</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            </div>
          ) : !selectedTemplate ? (
            <div className="flex-1 overflow-y-auto p-6">
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                  <p className="text-sm font-medium">No approved templates found</p>
                  <p className="text-xs text-muted-foreground mt-1">Create and approve templates in Settings first.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {templates.map((template) => {
                    const catColor = categoryColors[template.category] ?? categoryColors.Utility;
                    return (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-violet-500/50 hover:bg-violet-500/5"
                      >
                        <div className="flex w-full items-start justify-between gap-2 min-w-0">
                          <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">
                            {template.name}
                          </h3>
                          <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${catColor}`}>
                            {template.category}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                          {template.body_text}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Selected Template</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setSelectedTemplate(null);
                        setVariables({});
                      }}
                      className="h-8 text-xs"
                    >
                      Change
                    </Button>
                  </div>
                  <div className="mt-2 rounded-lg bg-muted/50 p-4 border border-border">
                    <p className="whitespace-pre-wrap text-sm text-foreground/80">
                      {selectedTemplate.body_text}
                    </p>
                  </div>
                </div>

                {placeholders.length > 0 && (
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Template Variables</h4>
                    <p className="text-xs text-muted-foreground">
                      Fill in the values for the variables in this template.
                    </p>
                    <div className="space-y-3">
                      {placeholders.map((p) => (
                        <div key={p} className="grid gap-1.5">
                          <Label className="text-xs">Variable {`{{${p}}}`}</Label>
                          <Input
                            placeholder={`Value for {{${p}}}`}
                            value={variables[p] || ''}
                            onChange={(e) => setVariables(prev => ({ ...prev, [p]: e.target.value }))}
                            className="h-8"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={!selectedTemplate || !allVariablesFilled}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Send className="mr-2 h-4 w-4" />
            Send Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
