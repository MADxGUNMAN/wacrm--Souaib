'use client';

// ============================================================
// CreateMemberDialog
//
// Direct IDP account creation modal with granular section permission
// toggles. Two steps:
//   1. Form — Full Name, Email, Password, Role, and Permission switches.
//   2. Result — Shows generated login credentials once with a copy button.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, Sparkles, Shield, Eye, EyeOff, Check, ChevronDown, ChevronUp, Sliders } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSION_ITEMS,
  SETTINGS_SUB_ITEMS,
  type MemberPermissions,
} from '@/types';

interface CreateMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateMemberDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<MemberPermissions>({
    ...DEFAULT_MEMBER_PERMISSIONS,
    inbox: true,
    contacts: true,
    pipelines: true,
  });
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    fullName: string;
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setPermissions({
      ...DEFAULT_MEMBER_PERMISSIONS,
      inbox: true,
      contacts: true,
      pipelines: true,
    });
    setResult(null);
    setCopied(false);
    setSubmitting(false);
  }

  function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
    setShowPassword(true);
  }

  async function handleCreate() {
    if (!fullName.trim()) {
      toast.error('Please enter a full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/account/members/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          permissions,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to create member account');
        return;
      }

      setResult({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
      onCreated();
    } catch (err) {
      console.error('[CreateMemberDialog] create error:', err);
      toast.error('Could not reach the server. Try again?');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCredentials() {
    if (!result) return;
    const loginUrl = window.location.origin + '/login';
    const text = `WACRM Login Credentials:\n\nName: ${result.fullName}\nEmail: ${result.email}\nPassword: ${result.password}\nRole: MEMBER\nLogin URL: ${loginUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Credentials copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <Sparkles className="size-4 text-primary" />
                Account Created Successfully!
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                An IDP login account has been created for <strong>{result.fullName}</strong>. Share these credentials with them so they can sign in.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs space-y-2 text-foreground">
                <div><span className="text-muted-foreground">Name:</span> {result.fullName}</div>
                <div><span className="text-muted-foreground">Email:</span> {result.email}</div>
                <div><span className="text-muted-foreground">Password:</span> {result.password}</div>
                <div><span className="text-muted-foreground">Role:</span> MEMBER</div>
              </div>

              <div className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                <strong className="font-semibold text-amber-100">
                  Save credentials now!
                </strong>{' '}
                For security reasons, this password will not be shown again once you close this window.
              </div>

              <Button
                type="button"
                onClick={copyCredentials}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
                {copied ? 'Copied to Clipboard' : 'Copy Login Credentials'}
              </Button>
            </div>

            <DialogFooter className="bg-popover border-border">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="w-full border-border text-foreground hover:bg-muted"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">Create member account</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Directly create login credentials and assign section access permissions for a team member or vendor.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Full Name</Label>
                <Input
                  placeholder="e.g. Alex Rivera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-muted border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Email Address</Label>
                <Input
                  type="email"
                  placeholder="alex@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-muted border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">Password</Label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Generate secure password
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-muted border-border text-foreground pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>



              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-primary" />
                  <Label className="text-foreground font-semibold">Section Access Permissions</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Toggle which specific areas of the application this member is permitted to access.
                </p>

                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1.5">
                  {PERMISSION_ITEMS.map((item) => (
                    <div key={item.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 bg-muted/20">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground">{item.label}</span>
                            {item.key === 'settings' && permissions.settings && (
                              <button
                                type="button"
                                onClick={() => setSettingsExpanded(!settingsExpanded)}
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px] bg-background border border-border px-1.5 py-0.5 rounded transition-colors shadow-2xs"
                              >
                                <span>{settingsExpanded ? 'Hide modules' : 'Configure modules'}</span>
                                {settingsExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                              </button>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                        </div>
                        <Switch
                          checked={!!permissions[item.key]}
                          onCheckedChange={(val) => {
                            setPermissions((prev) => {
                              const next = { ...prev, [item.key]: val };
                              if (item.key === 'settings' && val) {
                                SETTINGS_SUB_ITEMS.forEach((sub) => {
                                  if (next[sub.key] === undefined) {
                                    next[sub.key] = sub.defaultVal;
                                  }
                                });
                              }
                              return next;
                            });
                            if (item.key === 'settings' && val) setSettingsExpanded(true);
                          }}
                        />
                      </div>

                      {/* Granular Drop Menu for Settings Modules */}
                      {item.key === 'settings' && permissions.settings && settingsExpanded && (
                        <div className="ml-4 pl-3 py-2 pr-2.5 border-l-2 border-primary/40 space-y-2 bg-muted/10 rounded-r-md animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="flex items-center justify-between pb-1 border-b border-border/50">
                            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                              <Sliders className="size-3" />
                              Settings Sub-Modules Access
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setPermissions((prev) => {
                                    const next = { ...prev };
                                    SETTINGS_SUB_ITEMS.forEach((sub) => { next[sub.key] = true; });
                                    return next;
                                  });
                                }}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Allow All
                              </button>
                              <span className="text-muted-foreground/30">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPermissions((prev) => {
                                    const next = { ...prev };
                                    SETTINGS_SUB_ITEMS.forEach((sub) => { next[sub.key] = false; });
                                    return next;
                                  });
                                }}
                                className="text-[10px] text-muted-foreground hover:text-foreground font-medium"
                              >
                                Restrict All
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-0.5">
                            {SETTINGS_SUB_ITEMS.map((sub) => (
                              <div
                                key={sub.key}
                                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
                              >
                                <div className="space-y-0.5">
                                  <div className="text-xs font-medium text-foreground">{sub.label}</div>
                                  <div className="text-[10px] text-muted-foreground">{sub.desc}</div>
                                </div>
                                <Switch
                                  checked={permissions[sub.key] !== false}
                                  onCheckedChange={(val) =>
                                    setPermissions((prev) => ({ ...prev, [sub.key]: val }))
                                  }
                                  className="scale-90"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="bg-popover border-border pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={submitting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
