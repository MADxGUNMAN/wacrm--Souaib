'use client';

// ============================================================
// Settings → Login & security → Two-factor authentication.
//
//   Personal Two-Factor Authentication — every user, owner or member,
//   links their own authenticator app (independent per user).
//   Workspace Owner Verification — the owner turns on "Require Owner 2FA
//   Verification for Members"; members see its status, read-only.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  UserRoundCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { browserTimezone } from '@/lib/security/client';

interface Status {
  personal: {
    status: 'off' | 'pending' | 'active';
    enabled_at: string | null;
    recovery_codes_remaining: number;
  };
  workspace: {
    in_workspace: boolean;
    is_owner: boolean;
    require_owner_verification: boolean;
    owner_has_two_factor: boolean;
    owner_verification_active: boolean;
  };
}

async function call<T>(
  path: string,
  init: RequestInit & { body?: string } = {}
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data as T;
}

const body = (v: Record<string, unknown>) =>
  JSON.stringify({ ...v, timezone: browserTimezone() });

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        on
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          on ? 'bg-emerald-500' : 'bg-muted-foreground/50'
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  aside,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-foreground text-sm font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

// ── Code entry dialog (disable, regenerate, owner toggle) ──────────

function CodeDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  destructive,
  allowRecovery,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  destructive?: boolean;
  allowRecovery?: boolean;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
    }
  }, [open]);

  const valid =
    /^\d{6}$/.test(code) ||
    (allowRecovery && code.replace(/[^A-Za-z0-9]/g, '').length === 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(code.trim());
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="two-factor-dialog-code">
              {allowRecovery
                ? 'Authentication code or recovery code'
                : 'Authentication Code'}
            </Label>
            <Input
              id="two-factor-dialog-code"
              value={code}
              onChange={(e) =>
                setCode(
                  allowRecovery
                    ? e.target.value.toUpperCase().slice(0, 11)
                    : e.target.value.replace(/\D/g, '').slice(0, 6)
                )
              }
              inputMode={allowRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
              className="text-center font-mono text-lg tracking-[0.3em]"
              aria-invalid={!!error}
            />
            {error ? (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={!valid || busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Recovery codes display ──────────────────────────────────────

function RecoveryCodesList({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the codes and copy them manually.');
    }
  };
  const download = () => {
    const blob = new Blob(
      [
        `Replai recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`,
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'replai-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Save these codes now. They are shown only once. Each one lets you sign
          in a single time if you lose access to your authenticator app.
        </span>
      </div>
      <ul
        aria-label="Recovery codes"
        className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border p-4 font-mono text-sm"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="size-4" /> Download
        </Button>
      </div>
    </div>
  );
}

// ── Setup dialog ────────────────────────────────────────────────

interface Enrollment {
  secret_display: string;
  qr_data_url: string;
}

function SetupDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'loading' | 'scan' | 'codes'>('loading');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    setStep('loading');
    setCode('');
    setError(null);
    setSaved(false);
    call<Enrollment>('/api/security/two-factor/enroll', {
      method: 'POST',
      body: body({}),
    })
      .then((e) => {
        setEnrollment(e);
        setStep('scan');
      })
      .catch((err: Error) => {
        toast.error(err.message);
        onOpenChange(false);
      });
  }, [open, onOpenChange]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ recovery_codes: string[] }>(
        '/api/security/two-factor/enroll/confirm',
        { method: 'POST', body: body({ code }) }
      );
      setCodes(r.recovery_codes);
      setStep('codes');
    } catch (err) {
      setError((err as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    // Once 2FA is on, closing the dialog always refreshes the page state.
    if (!next && step === 'codes') onDone();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'codes'
              ? 'Save your recovery codes'
              : 'Set up two-factor authentication'}
          </DialogTitle>
          <DialogDescription>
            {step === 'codes'
              ? 'Two-factor authentication is now on for your account.'
              : 'Use Google Authenticator, Microsoft Authenticator, Authy or any other TOTP authenticator app.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'loading' ? (
          <div className="flex justify-center py-10">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : step === 'scan' && enrollment ? (
          <form onSubmit={confirm} className="space-y-4">
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
              <li>Open your authenticator app and add a new account.</li>
              <li>Scan this QR code, or enter the setup key by hand.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrollment.qr_data_url}
                alt="QR code to add Replai to your authenticator app"
                width={180}
                height={180}
                className="rounded-lg border bg-white p-1"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-muted-foreground text-xs">Setup key</p>
                <code className="bg-muted block rounded-md px-2 py-1.5 font-mono text-xs break-all select-all">
                  {enrollment.secret_display}
                </code>
                <p className="text-muted-foreground text-[11px]">
                  Time-based, 6 digits, 30 seconds.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="two-factor-setup-code">Authentication Code</Label>
              <Input
                id="two-factor-setup-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="text-center font-mono text-lg tracking-[0.3em]"
                aria-invalid={!!error}
              />
              {error ? (
                <p role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => close(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!/^\d{6}$/.test(code) || busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Verify & Enable'
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <RecoveryCodesList codes={codes} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
                className="size-4"
              />
              I have saved my recovery codes
            </label>
            <DialogFooter>
              <Button
                type="button"
                disabled={!saved}
                onClick={() => close(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main ────────────────────────────────────────────────────────

export function TwoFactorSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [ownerToggle, setOwnerToggle] = useState<boolean | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    call<Status>('/api/security/two-factor')
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setLoadError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (!status) {
    return (
      <div className="bg-card flex h-40 items-center justify-center rounded-xl border">
        {loadError ? (
          <div className="text-center text-sm">
            <p className="text-muted-foreground">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        )}
      </div>
    );
  }

  const personalOn = status.personal.status === 'active';
  const ws = status.workspace;

  return (
    <div className="max-w-3xl space-y-4">
      <Card
        icon={Smartphone}
        title="Personal Two-Factor Authentication"
        description="Enable or disable an additional verification step to protect your account."
        aside={
          <StatusPill
            on={personalOn}
            label={personalOn ? 'Enabled' : 'Disabled'}
          />
        }
      >
        {personalOn ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              You enter a code from your authenticator app each time you sign in
              on a new device.{' '}
              <span
                className={cn(
                  status.personal.recovery_codes_remaining <= 2 &&
                    'font-medium text-amber-700 dark:text-amber-400'
                )}
              >
                {status.personal.recovery_codes_remaining} recovery{' '}
                {status.personal.recovery_codes_remaining === 1
                  ? 'code'
                  : 'codes'}{' '}
                left.
              </span>
            </p>
            {ws.is_owner && ws.require_owner_verification ? (
              <p className="text-muted-foreground text-xs">
                To turn this off, first turn off &quot;Require Owner 2FA
                Verification for Members&quot; below.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegenOpen(true)}
              >
                <KeyRound className="size-4" /> New recovery codes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisableOpen(true)}
                disabled={ws.is_owner && ws.require_owner_verification}
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <ShieldOff className="size-4" /> Disable
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Works with Google Authenticator, Microsoft Authenticator, Authy
              and other TOTP apps.
            </p>
            <Button size="sm" onClick={() => setSetupOpen(true)}>
              <ShieldCheck className="size-4" /> Enable
            </Button>
          </div>
        )}
      </Card>

      {ws.in_workspace && ws.is_owner ? (
        <Card
          icon={UserRoundCheck}
          title="Require Owner 2FA Verification for Members"
          description="When enabled, workspace members must enter a verification code from the owner's authenticator app to complete their login."
          aside={
            <Switch
              checked={ws.require_owner_verification}
              disabled={!personalOn && !ws.require_owner_verification}
              onCheckedChange={(v) => setOwnerToggle(v)}
              aria-label="Require Owner 2FA Verification for Members"
            />
          }
        >
          {!personalOn ? (
            <p className="text-muted-foreground text-sm">
              Set up your personal two-factor authentication first. Members will
              sign in with codes from your authenticator app.
            </p>
          ) : ws.require_owner_verification ? (
            <p className="text-muted-foreground text-sm">
              On. Every member needs a current code from your authenticator app
              to sign in, and their own 2FA codes are not accepted. Share codes
              only with your team, one sign-in at a time. Each use appears in
              your Login activity. This does not apply to you.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Off. Members sign in normally, with their own 2FA if they set it
              up.
            </p>
          )}
          {ws.require_owner_verification && !ws.owner_has_two_factor ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Paused: you no longer have two-factor authentication, so members
              aren&apos;t asked for your code. Set up 2FA to resume it.
            </p>
          ) : null}
        </Card>
      ) : null}

      {ws.in_workspace && !ws.is_owner ? (
        <Card
          icon={UserRoundCheck}
          title="Workspace Owner Verification"
          description={
            ws.owner_verification_active
              ? "Your workspace owner requires an additional authentication code when you log in. You will need a verification code from the owner's authenticator app to access this workspace."
              : 'Your workspace does not currently require additional verification from the workspace owner.'
          }
          aside={
            <StatusPill
              on={ws.owner_verification_active}
              label={
                ws.owner_verification_active
                  ? 'Enabled by Workspace Owner'
                  : 'Disabled'
              }
            />
          }
        >
          <p className="text-muted-foreground text-xs">
            Only your workspace owner can change this setting.
            {ws.owner_verification_active && personalOn
              ? ' While it is on, your personal code is not used when you sign in to this workspace.'
              : ''}
          </p>
        </Card>
      ) : null}

      <SetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onDone={() => void load()}
      />

      <CodeDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Disable two-factor authentication?"
        description="Enter a code from your authenticator app, or a recovery code, to confirm. Your account will be protected by your password only."
        confirmText="Disable"
        destructive
        allowRecovery
        onSubmit={async (code) => {
          await call('/api/security/two-factor/disable', {
            method: 'POST',
            body: body({ code }),
          });
          toast.success('Two-factor authentication is off');
          await load();
        }}
      />

      <CodeDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Create new recovery codes?"
        description="Your current recovery codes stop working. Enter a code from your authenticator app to continue."
        confirmText="Create codes"
        allowRecovery
        onSubmit={async (code) => {
          const r = await call<{ recovery_codes: string[] }>(
            '/api/security/two-factor/recovery-codes',
            { method: 'POST', body: body({ code }) }
          );
          setNewCodes(r.recovery_codes);
          await load();
        }}
      />

      <CodeDialog
        open={ownerToggle !== null}
        onOpenChange={(o) => {
          if (!o) setOwnerToggle(null);
        }}
        title={
          ownerToggle
            ? 'Require your code for member sign-ins?'
            : 'Stop requiring your code?'
        }
        description={
          ownerToggle
            ? 'Members will need a current code from your authenticator app every time they sign in, instead of their own 2FA. Signed-in members are asked for it on their next request. Enter your current code to confirm.'
            : 'Members will go back to their normal sign-in, with their own 2FA if they set it up. Enter your current code to confirm.'
        }
        confirmText={ownerToggle ? 'Turn on' : 'Turn off'}
        destructive={ownerToggle === false}
        onSubmit={async (code) => {
          await call('/api/security/two-factor/workspace', {
            method: 'PUT',
            body: body({ require_owner_verification: ownerToggle, code }),
          });
          toast.success(
            ownerToggle
              ? 'Owner verification is on'
              : 'Owner verification is off'
          );
          await load();
        }}
      />

      <Dialog
        open={newCodes !== null}
        onOpenChange={(o) => !o && setNewCodes(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your new recovery codes</DialogTitle>
            <DialogDescription>
              Your old recovery codes no longer work.
            </DialogDescription>
          </DialogHeader>
          {newCodes ? <RecoveryCodesList codes={newCodes} /> : null}
          <DialogFooter>
            <Button onClick={() => setNewCodes(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
