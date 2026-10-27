'use client';

// ============================================================
// Super admin → Accounts → Delete account.
//
//   Step 1  Re-enter your password (+ authenticator code if you use 2FA)
//   Step 2  Type CONFIRM
//   Step 3  "Are you sure?" — final, irreversible
//
// Every rule is enforced again by the server; this is the guided UI.
// ============================================================

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CONFIRM_WORD = 'CONFIRM';

type Step = 'password' | 'confirm' | 'final';

interface LiveAutopay {
  mode: string;
  status: string;
  provider_subscription_id: string | null;
}

export interface DeleteAccountSummary {
  id: string;
  name: string;
  ownerEmail: string | null;
  members: number;
  contacts: number;
  messages: number;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  account,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: DeleteAccountSummary;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveAutopay, setLiveAutopay] = useState<LiveAutopay[]>([]);

  // Fresh state every time the dialog opens; never keep the password.
  useEffect(() => {
    if (!open) return;
    setStep('password');
    setPassword('');
    setCode('');
    setNeedsCode(false);
    setToken(null);
    setConfirmText('');
    setError(null);
    setLiveAutopay([]);
  }, [open]);

  const close = () => {
    if (!busy) onOpenChange(false);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/super-admin/accounts/${account.id}/delete/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, ...(needsCode ? { code } : {}) }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setToken(data.token as string);
        setLiveAutopay(
          Array.isArray(data.live_autopay)
            ? (data.live_autopay as LiveAutopay[])
            : []
        );
        setPassword('');
        setCode('');
        setStep('confirm');
        return;
      }
      if (data.code === 'two_factor_code_required') {
        setNeedsCode(true);
        setError(null);
        return;
      }
      setError(data.error || 'Could not verify. Try again.');
      if (data.code === 'invalid_password') setPassword('');
      if (data.code === 'invalid_two_factor_code') setCode('');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/accounts/${account.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, confirmation: confirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'reauth_required') {
          setToken(null);
          setStep('password');
        }
        setError(data.error || 'Could not delete the account.');
        return;
      }
      toast.success(
        `"${account.name}" was permanently deleted${data.storage_cleanup_incomplete ? '. Some files could not be removed yet.' : '.'}`
      );
      onOpenChange(false);
      onDeleted();
    } catch {
      setError(
        'Network error. Nothing was deleted if this keeps happening; try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const stepNo = step === 'password' ? 1 : step === 'confirm' ? 2 : 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
    >
      <DialogContent className="sm:max-w-md" data-mode="light">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-red-600 uppercase">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Delete account · Step {stepNo} of 3
          </div>
          <DialogTitle>
            {step === 'password'
              ? 'Confirm it’s you'
              : step === 'confirm'
                ? `Type ${CONFIRM_WORD} to continue`
                : 'Are you absolutely sure?'}
          </DialogTitle>
          <DialogDescription>
            {step === 'password'
              ? 'Enter your super admin password to delete this workspace.'
              : step === 'confirm'
                ? `This permanently deletes "${account.name}" and every user in it.`
                : 'This cannot be undone. The workspace will be removed as if it never existed.'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        {step !== 'password' && liveAutopay.length > 0 ? (
          <div
            role="note"
            className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-slate-700"
          >
            {liveAutopay.map((a) => (
              <p key={a.provider_subscription_id ?? a.status}>
                Razorpay AutoPay{' '}
                <span className="font-mono">{a.provider_subscription_id}</span>{' '}
                ({a.mode}, {a.status}) will be cancelled first. If Razorpay
                refuses, nothing is deleted.
              </p>
            ))}
          </div>
        ) : null}

        {step === 'password' ? (
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sa-delete-password">Your password</Label>
              <Input
                id="sa-delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            {needsCode ? (
              <div className="space-y-1.5">
                <Label htmlFor="sa-delete-code">Authentication code</Label>
                <Input
                  id="sa-delete-code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="text-center font-mono tracking-[0.3em]"
                  autoFocus
                />
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy || !password || (needsCode && code.length !== 6)}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Verify
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {step === 'confirm' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmText === CONFIRM_WORD) setStep('final');
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="sa-delete-confirm">
                Type <span className="font-mono font-bold">{CONFIRM_WORD}</span>
              </Label>
              <Input
                id="sa-delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="font-mono"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={confirmText !== CONFIRM_WORD}
              >
                Continue
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {step === 'final' ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-900">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Permanently deleted:
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>
                  Workspace <strong>{account.name}</strong>
                  {account.ownerEmail ? ` (owner ${account.ownerEmail})` : ''}
                </li>
                <li>
                  {account.members}{' '}
                  {account.members === 1 ? 'user login' : 'user logins'}. They
                  will see “account doesn’t exist” and can sign up again as new
                  users.
                </li>
                <li>
                  {account.contacts.toLocaleString()} contacts,{' '}
                  {account.messages.toLocaleString()} messages, and all deals,
                  broadcasts, templates, automations, settings and files
                </li>
                <li>The WhatsApp connection stored in Replai</li>
              </ul>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={busy}
              >
                No, keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void destroy()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Yes, delete permanently
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
