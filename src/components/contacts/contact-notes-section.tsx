'use client';

import { useState, useId, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MAX_NOTE_LENGTH,
  validateContactNote,
} from '@/lib/contacts/notes-validation';
import type { ContactNote } from '@/types';
import {
  StickyNote,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { format } from 'date-fns';

export interface ContactNotesSectionProps {
  contactId?: string | null;
  notes: ContactNote[];
  onNotesChange?: (notes: ContactNote[]) => void;
  compact?: boolean;
  maxDisplayCount?: number;
  onViewAll?: () => void;
  className?: string;
}

export function ContactNotesSection({
  contactId,
  notes,
  onNotesChange,
  compact = false,
  maxDisplayCount,
  onViewAll,
  className,
}: ContactNotesSectionProps) {
  const { accountId } = useAuth();
  const confirm = useConfirm();
  const inputId = useId();

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<ContactNote | null>(null);

  const charCount = newNote.length;
  const remainingChars = MAX_NOTE_LENGTH - charCount;
  const isOverLimit = charCount > MAX_NOTE_LENGTH;
  const isWarningLimit = charCount >= 850 && !isOverLimit;

  const handleCopyNote = async (noteId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(noteId);
      toast.success('Note copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy note');
    }
  };

  const handleAddNote = useCallback(async () => {
    const validation = validateContactNote(newNote);
    if (!validation.isValid) {
      toast.error(validation.error || 'Please enter a valid note.');
      return;
    }

    if (!contactId || !accountId) {
      toast.error('Unable to save note: missing contact context.');
      return;
    }

    setSavingNote(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      const { data, error } = await supabase
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          account_id: accountId,
          user_id: user?.id,
          note_text: validation.cleanText,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const updated = [data, ...notes];
        onNotesChange?.(updated);
        setNewNote('');
        toast.success('Note added successfully');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to save note';
      toast.error(message);
    } finally {
      setSavingNote(false);
    }
  }, [contactId, accountId, newNote, notes, onNotesChange]);

  const handleDeleteNote = async (noteId: string) => {
    const ok = await confirm({
      title: 'Delete Note',
      description:
        'Are you sure you want to permanently delete this note? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!ok) return;

    setDeletingId(noteId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('contact_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      const updated = notes.filter((n) => n.id !== noteId);
      onNotesChange?.(updated);
      toast.success('Note deleted');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete note';
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (newNote.trim() && !isOverLimit && !savingNote) {
        void handleAddNote();
      }
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Note Creation Form */}
      <div className="space-y-2">
        <div
          className={cn(
            'bg-muted/30 focus-within:border-primary/60 focus-within:ring-primary/30 relative rounded-lg border transition-all duration-150 focus-within:ring-1',
            isOverLimit
              ? 'border-red-500/70 bg-red-500/5 ring-1 ring-red-500/30'
              : 'border-border/70'
          )}
        >
          <textarea
            id={inputId}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              compact
                ? 'Add a quick note... (Ctrl+Enter to save)'
                : 'Write a note regarding calls, requirements, or client preferences...\n(Ctrl+Enter to save)'
            }
            rows={compact ? 2 : 3}
            disabled={savingNote}
            className="text-foreground placeholder:text-muted-foreground/70 w-full resize-none bg-transparent px-3 pt-2.5 pb-1.5 text-xs leading-relaxed outline-none"
          />
        </div>

        {/* Footer: Counter + Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Character Count */}
          <div className="flex min-w-0 items-center gap-1 text-[10px]">
            {isOverLimit && (
              <AlertCircle className="size-3 shrink-0 text-red-400" />
            )}
            <span
              className={cn(
                'font-mono whitespace-nowrap tabular-nums transition-colors',
                isOverLimit
                  ? 'font-semibold text-red-400'
                  : isWarningLimit
                    ? 'font-medium text-amber-400'
                    : 'text-muted-foreground/70'
              )}
            >
              {charCount.toLocaleString()} / {MAX_NOTE_LENGTH.toLocaleString()}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex shrink-0 items-center gap-1.5">
            {newNote.length > 0 && !savingNote && (
              <button
                type="button"
                onClick={() => setNewNote('')}
                className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-[10px] transition-colors"
              >
                Clear
              </button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleAddNote}
              disabled={!newNote.trim() || isOverLimit || savingNote}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-6 cursor-pointer gap-1 rounded-md px-2.5 text-[10px] font-medium disabled:opacity-50"
            >
              {savingNote ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  <span>Saving</span>
                </>
              ) : (
                <>
                  <Plus className="size-3" />
                  <span>Save Note</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Over-limit warning */}
        {isOverLimit && (
          <p className="flex items-center gap-1 text-[10px] font-medium text-red-400">
            <AlertCircle className="size-3 shrink-0" />
            <span>
              {Math.abs(remainingChars).toLocaleString()} characters over the{' '}
              {MAX_NOTE_LENGTH.toLocaleString()} limit
            </span>
          </p>
        )}
      </div>

      {/* Notes List */}
      <div className="space-y-2">
        {notes.length === 0 ? (
          <div className="border-border/80 rounded-xl border border-dashed p-4 text-center">
            <StickyNote className="text-muted-foreground/60 mx-auto mb-1.5 size-5" />
            <p className="text-muted-foreground text-xs font-medium">
              No notes added yet
            </p>
            <p className="text-muted-foreground/70 mt-0.5 text-[11px]">
              Record key requirements, customer preferences, or follow-ups.
            </p>
          </div>
        ) : (
          <>
            {(maxDisplayCount ? notes.slice(0, maxDisplayCount) : notes).map(
              (note) => {
                const isDeleting = deletingId === note.id;
                const isCopied = copiedId === note.id;

                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewNote(note)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreviewNote(note);
                      }
                    }}
                    className="group border-border/60 bg-muted/40 hover:bg-muted/70 hover:border-border relative cursor-pointer rounded-xl border p-3 transition-all duration-150"
                  >
                    {/* Note Content — truncated to 2 lines */}
                    <p className="text-foreground/90 line-clamp-2 text-xs leading-relaxed font-normal">
                      {note.note_text}
                    </p>

                    {/* Note Footer: Timestamp & Quick Actions */}
                    <div className="text-muted-foreground mt-2 flex items-center justify-between text-[10px]">
                      <span>
                        {format(new Date(note.created_at), 'MMM d, yyyy')}
                      </span>

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        {/* Copy Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyNote(note.id, note.note_text);
                          }}
                          title="Copy note text"
                          aria-label="Copy note text"
                          className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-primary/60 cursor-pointer rounded-md p-1 transition-colors focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {isCopied ? (
                            <Check className="size-3 text-green-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                          }}
                          disabled={isDeleting}
                          title="Delete note"
                          aria-label="Delete note"
                          className="text-muted-foreground focus-visible:ring-primary/60 cursor-pointer rounded-md p-1 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <Loader2 className="size-3 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
            )}

            {/* View All Button Trigger */}
            {onViewAll && notes.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onViewAll}
                className="border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground h-7 w-full cursor-pointer gap-1.5 border-dashed text-xs font-medium"
              >
                <span>View all {notes.length} notes</span>
                <ArrowRight className="size-3" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Note Preview Modal Dialog */}
      {previewNote && (
        <Dialog
          open={!!previewNote}
          onOpenChange={(open) => !open && setPreviewNote(null)}
        >
          <DialogContent className="bg-card border-border text-foreground max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 text-primary rounded-lg p-1.5">
                  <StickyNote className="size-4" />
                </div>
                <div>
                  <DialogTitle className="text-sm font-semibold">
                    Note Preview
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground text-xs">
                    Created on{' '}
                    {format(new Date(previewNote.created_at), 'PPPP • h:mm a')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {previewNote.note_text.length.toLocaleString()} characters
                </Badge>
                <span className="text-muted-foreground text-[11px]">
                  {format(
                    new Date(previewNote.created_at),
                    'MMM d, yyyy h:mm a'
                  )}
                </span>
              </div>

              <div className="border-border bg-muted/40 max-h-[55vh] overflow-y-auto rounded-xl border p-4">
                <p className="text-foreground text-sm leading-relaxed font-normal [overflow-wrap:anywhere] break-words whitespace-pre-wrap select-text">
                  {previewNote.note_text}
                </p>
              </div>
            </div>

            <DialogFooter className="border-border flex items-center justify-between gap-2 border-t pt-3 sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  const id = previewNote.id;
                  setPreviewNote(null);
                  void handleDeleteNote(id);
                }}
                className="h-8 cursor-pointer gap-1.5 text-xs"
              >
                <Trash2 className="size-3.5" />
                <span>Delete</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopyNote(previewNote.id, previewNote.note_text)
                  }
                  className="h-8 cursor-pointer gap-1.5 text-xs"
                >
                  {copiedId === previewNote.id ? (
                    <>
                      <Check className="size-3.5 text-green-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewNote(null)}
                  className="h-8 cursor-pointer text-xs"
                >
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
