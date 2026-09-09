'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Info,
  Trash2,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive' | 'warning' | 'info';
  icon?: React.ElementType;
}

export type ConfirmFunction = (
  options: ConfirmOptions | string
) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    const normalized: ConfirmOptions =
      typeof opts === 'string'
        ? { title: 'Are you sure?', description: opts }
        : opts;

    setOptions(normalized);
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  };

  const handleCancel = () => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  const variant = options.variant ?? 'destructive';
  const Icon =
    options.icon ??
    (variant === 'destructive'
      ? Trash2
      : variant === 'warning'
        ? AlertTriangle
        : variant === 'info'
          ? Info
          : HelpCircle);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCancel();
        }}
      >
        <DialogContent className="sm:max-w-md gap-5 p-6 rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                variant === 'destructive' &&
                  'bg-red-500/10 text-red-600 border border-red-500/20 dark:bg-red-950/40 dark:text-red-400',
                variant === 'warning' &&
                  'bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:bg-amber-950/40 dark:text-amber-400',
                variant === 'info' &&
                  'bg-blue-500/10 text-blue-600 border border-blue-500/20 dark:bg-blue-950/40 dark:text-blue-400',
                variant === 'default' &&
                  'bg-primary/10 text-primary border border-primary/20'
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="space-y-1.5 pt-0.5 min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold text-foreground leading-snug">
                {options.title ?? 'Are you sure?'}
              </DialogTitle>
              {options.description ? (
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  {options.description}
                </DialogDescription>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="rounded-lg px-4"
            >
              {options.cancelText ?? 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              className="rounded-lg px-4"
            >
              {options.confirmText ??
                (variant === 'destructive' ? 'Delete' : 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}
