'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const MIN_PASSWORD = 8;

function getPasswordStrength(pwd: string) {
  const hasMinLength = pwd.length >= MIN_PASSWORD;
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd);
  const hasMixedCase = /[a-z]/.test(pwd) && /[A-Z]/.test(pwd);
  const hasGoodLength = pwd.length >= 12;

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasNumberOrSymbol) score += 1;
  if (hasMixedCase) score += 1;
  if (hasGoodLength) score += 1;

  let label = 'Too weak';
  if (score === 2) label = 'Fair';
  if (score === 3) label = 'Good';
  if (score >= 4) label = 'Strong';

  return {
    score,
    label,
    hasMinLength,
    hasNumberOrSymbol,
    hasMixedCase,
  };
}

export function PasswordForm() {
  const t = useTranslations('Settings.profile');
  const { profile } = useAuth();
  const supabase = createClient();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const strength = useMemo(() => getPasswordStrength(next), [next]);
  const isMismatch = confirm.length > 0 && next !== confirm;
  const isMatching = confirm.length > 0 && next === confirm;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.email) {
      toast.error(t('cannotChangeNoEmail'));
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setConfirmError(t('passwordTooShort', { min: MIN_PASSWORD }));
      return;
    }
    if (next !== confirm) {
      setConfirmError(t('passwordMismatch'));
      return;
    }
    setConfirmError(null);
    setSaving(true);

    try {
      // Supabase doesn't expose a "verify password without issuing a
      // session" API, so we re-authenticate with the provided current
      // password. If it matches, the session refreshes silently; if it
      // doesn't, we abort before calling updateUser.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: current,
      });
      if (signInError) {
        toast.error(t('currentPasswordIncorrect'));
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) {
        toast.error(
          t('passwordUpdateFailed', { message: updateError.message })
        );
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');
      setShowCurrent(false);
      setShowNext(false);
      setShowConfirm(false);
      toast.success(t('passwordUpdated'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <KeyRound className="text-primary size-4" />
          {t('passwordTitle')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('passwordDesc', { min: MIN_PASSWORD })}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Current password */}
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-foreground">
              {t('currentPassword')}
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter current password"
                disabled={saving}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
                aria-label={
                  showCurrent
                    ? 'Hide current password'
                    : 'Show current password'
                }
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 transition-colors focus:outline-none"
              >
                {showCurrent ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* New and Confirm password */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-foreground">
                {t('newPassword')}
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNext ? 'text' : 'password'}
                  value={next}
                  onChange={(e) => {
                    setNext(e.target.value);
                    if (confirmError) setConfirmError(null);
                  }}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  placeholder="Enter new password"
                  disabled={saving}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNext(!showNext)}
                  tabIndex={-1}
                  aria-label={
                    showNext ? 'Hide new password' : 'Show new password'
                  }
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 transition-colors focus:outline-none"
                >
                  {showNext ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-foreground">
                {t('confirmPassword')}
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (confirmError) setConfirmError(null);
                  }}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  placeholder="Re-enter new password"
                  disabled={saving}
                  className={cn(
                    'pr-10',
                    isMismatch &&
                      'border-destructive focus-visible:ring-destructive/30',
                    isMatching &&
                      'border-emerald-500/60 focus-visible:ring-emerald-500/20'
                  )}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                  aria-label={
                    showConfirm
                      ? 'Hide confirm password'
                      : 'Show confirm password'
                  }
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 transition-colors focus:outline-none"
                >
                  {showConfirm ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Password Strength Meter & Live Guidelines */}
          {next.length > 0 && (
            <div className="border-border/80 bg-muted/30 animate-in fade-in-50 space-y-2.5 rounded-lg border p-3.5 duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="text-primary size-3.5" />
                  Password strength:
                </span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    strength.score <= 1 && 'text-destructive',
                    strength.score === 2 && 'text-amber-500',
                    strength.score === 3 && 'text-blue-500',
                    strength.score >= 4 && 'text-emerald-500'
                  )}
                >
                  {strength.label}
                </span>
              </div>

              {/* 4-segment strength bar */}
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      strength.score >= step
                        ? strength.score <= 1
                          ? 'bg-destructive'
                          : strength.score === 2
                            ? 'bg-amber-500'
                            : strength.score === 3
                              ? 'bg-blue-500'
                              : 'bg-emerald-500'
                        : 'bg-muted'
                    )}
                  />
                ))}
              </div>

              {/* Live requirements checklist */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-[11px]">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 transition-colors',
                    strength.hasMinLength
                      ? 'font-medium text-emerald-500'
                      : 'text-muted-foreground'
                  )}
                >
                  {strength.hasMinLength ? (
                    <Check className="size-3 stroke-[2.5]" />
                  ) : (
                    <span className="bg-muted-foreground/40 inline-block size-1.5 rounded-full" />
                  )}
                  8+ characters
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 transition-colors',
                    strength.hasNumberOrSymbol
                      ? 'font-medium text-emerald-500'
                      : 'text-muted-foreground'
                  )}
                >
                  {strength.hasNumberOrSymbol ? (
                    <Check className="size-3 stroke-[2.5]" />
                  ) : (
                    <span className="bg-muted-foreground/40 inline-block size-1.5 rounded-full" />
                  )}
                  Number or symbol
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 transition-colors',
                    strength.hasMixedCase
                      ? 'font-medium text-emerald-500'
                      : 'text-muted-foreground'
                  )}
                >
                  {strength.hasMixedCase ? (
                    <Check className="size-3 stroke-[2.5]" />
                  ) : (
                    <span className="bg-muted-foreground/40 inline-block size-1.5 rounded-full" />
                  )}
                  Upper & lowercase
                </span>
              </div>
            </div>
          )}

          {/* Confirm match status */}
          {confirm.length > 0 && (
            <div className="animate-in fade-in-50 text-xs duration-150">
              {isMatching ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-500">
                  <Check className="size-3.5 stroke-[2.5]" /> Passwords match
                </span>
              ) : (
                <span className="text-destructive inline-flex items-center gap-1.5 font-medium">
                  <X className="size-3.5 stroke-[2.5]" /> Passwords do not match
                </span>
              )}
            </div>
          )}

          {confirmError && (
            <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
              {confirmError}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={
                saving ||
                !current ||
                !next ||
                !confirm ||
                next.length < MIN_PASSWORD ||
                next !== confirm
              }
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('updating')}
                </>
              ) : (
                t('updatePassword')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
