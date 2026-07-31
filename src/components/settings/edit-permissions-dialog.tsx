'use client';

// ============================================================
// EditPermissionsDialog
//
// Allows admins to modify the granular section permissions (`permissions` JSONB)
// for an existing workspace member.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Shield, ChevronDown, ChevronUp, Sliders } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSION_ITEMS,
  SETTINGS_SUB_ITEMS,
  type AccountMember,
  type MemberPermissions,
} from '@/types';

interface EditPermissionsDialogProps {
  member: AccountMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function EditPermissionsDialog({
  member,
  open,
  onOpenChange,
  onUpdated,
}: EditPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<MemberPermissions>(DEFAULT_MEMBER_PERMISSIONS);
  const [saving, setSaving] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  useEffect(() => {
    if (member) {
      const base = member.permissions ?? {
        ...DEFAULT_MEMBER_PERMISSIONS,
        inbox: true,
        dashboard: true,
        contacts: true,
        pipelines: true,
        broadcasts: true,
        automations: true,
        settings: false,
      };
      setPermissions({
        ...DEFAULT_MEMBER_PERMISSIONS,
        ...base,
      });
    }
  }, [member, open]);

  async function handleSave() {
    if (!member) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/account/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to update member permissions');
        return;
      }

      toast.success(`Updated permissions for ${member.full_name || member.email || 'member'}`);
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      console.error('[EditPermissionsDialog] save error:', err);
      toast.error('Could not reach the server. Try again?');
    } finally {
      setSaving(false);
    }
  }

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <Shield className="size-4 text-primary" />
            Edit Access Permissions
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure which section modules <strong className="text-foreground">{member.full_name || member.email || 'this member'}</strong> can access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 py-2 max-h-[70vh] overflow-y-auto pr-1.5">
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

        <DialogFooter className="bg-popover border-border pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Permissions'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
