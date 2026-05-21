"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  MessageSquare,
  Loader2,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { VendorPermissions } from "@/types";

interface VendorProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: VendorPermissions;
  is_active: boolean;
  created_at: string;
  assigned_conversations_count: number;
}

const PERMISSION_LABELS: Record<keyof VendorPermissions, { label: string; desc: string }> = {
  inbox: { label: "Inbox", desc: "View and reply to assigned conversations" },
  dashboard: { label: "Dashboard", desc: "View analytics and metrics" },
  contacts: { label: "Contacts", desc: "View and manage contacts" },
  pipelines: { label: "Pipelines", desc: "View and manage deal pipelines" },
  broadcasts: { label: "Broadcasts", desc: "Send broadcast messages" },
  automations: { label: "Automations", desc: "View and manage automations" },
  settings: { label: "Settings", desc: "Access settings (profile only)" },
};

export function VendorManager() {
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editVendor, setEditVendor] = useState<VendorProfile | null>(null);
  const [showPermissions, setShowPermissions] = useState<VendorProfile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<VendorProfile | null>(null);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch("/api/vendors");
      if (!res.ok) throw new Error("Failed to load vendors");
      const data = await res.json();
      setVendors(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleToggleActive = async (vendor: VendorProfile) => {
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !vendor.is_active }),
      });
      if (!res.ok) throw new Error("Failed to update vendor");
      toast.success(
        vendor.is_active ? `${vendor.full_name} suspended` : `${vendor.full_name} activated`
      );
      fetchVendors();
    } catch {
      toast.error("Failed to update vendor status");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/vendors/${deleteConfirm.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete vendor");
      toast.success(`${deleteConfirm.full_name} deleted`);
      setDeleteConfirm(null);
      fetchVendors();
    } catch {
      toast.error("Failed to delete vendor");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                <Users className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">
                  Vendor Management
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Create and manage vendor accounts. Vendors can only see
                  conversations assigned to them.
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="gap-2 bg-violet-600 text-white hover:bg-violet-500"
            >
              <Plus className="h-4 w-4" />
              Add Vendor
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Vendor List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        </div>
      ) : vendors.length === 0 ? (
        <Card className="border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm text-muted-foreground">No vendors yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first vendor account to start assigning conversations
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              variant="outline"
              className="mt-4 gap-2 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Add Vendor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {vendors.map((vendor) => (
            <Card
              key={vendor.id}
              className="border-border bg-card/50 transition-colors hover:border-border"
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Avatar */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-sm font-semibold text-violet-600">
                  {vendor.full_name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {vendor.full_name}
                    </p>
                    <Badge
                      variant="secondary"
                      className={
                        vendor.is_active
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-red-500/10 text-red-600 border-red-500/20"
                      }
                    >
                      {vendor.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{vendor.email}</p>
                </div>

                {/* Stats */}
                <div className="hidden items-center gap-1.5 sm:flex">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {vendor.assigned_conversations_count} assigned
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-violet-600"
                    onClick={() => setShowPermissions(vendor)}
                    title="Permissions"
                  >
                    <Shield className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditVendor(vendor)}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-600"
                    onClick={() => handleToggleActive(vendor)}
                    title={vendor.is_active ? "Suspend" : "Activate"}
                  >
                    {vendor.is_active ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                    onClick={() => setDeleteConfirm(vendor)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Vendor Dialog */}
      <CreateVendorDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={fetchVendors}
      />

      {/* Edit Vendor Dialog */}
      {editVendor && (
        <EditVendorDialog
          vendor={editVendor}
          open={!!editVendor}
          onClose={() => setEditVendor(null)}
          onUpdated={fetchVendors}
        />
      )}

      {/* Permissions Dialog */}
      {showPermissions && (
        <PermissionsDialog
          vendor={showPermissions}
          open={!!showPermissions}
          onClose={() => setShowPermissions(null)}
          onUpdated={fetchVendors}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteConfirm?.full_name}
              </span>
              ? This will unassign all their conversations and remove their
              account permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Create Dialog ──────────────────────────────────────────────

function CreateVendorDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create vendor");
      }

      toast.success(`Vendor "${fullName}" created successfully`);
      setFullName("");
      setEmail("");
      setPassword("");
      onClose();
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Vendor</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a vendor account. They&apos;ll use these credentials to log in
            and will only see conversations assigned to them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vendor-name" className="text-muted-foreground">
              Full Name
            </Label>
            <Input
              id="vendor-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ahmed Khan"
              required
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor-email" className="text-muted-foreground">
              Email
            </Label>
            <Input
              id="vendor-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@company.com"
              required
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor-password" className="text-muted-foreground">
              Password
            </Label>
            <div className="relative">
              <Input
                id="vendor-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="border-border bg-muted pr-10 text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="gap-2 bg-violet-600 text-white hover:bg-violet-500"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Vendor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ────────────────────────────────────────────────

function EditVendorDialog({
  vendor,
  open,
  onClose,
  onUpdated,
}: {
  vendor: VendorProfile;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [fullName, setFullName] = useState(vendor.full_name);
  const [email, setEmail] = useState(vendor.email);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const body: Record<string, string> = { full_name: fullName, email };
      if (password) body.password = password;

      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update vendor");
      }

      toast.success("Vendor updated");
      onClose();
      onUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Vendor</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Update {vendor.full_name}&apos;s account details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-muted-foreground">
              Full Name
            </Label>
            <Input
              id="edit-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="border-border bg-muted text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email" className="text-muted-foreground">
              Email
            </Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-border bg-muted text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-password" className="text-muted-foreground">
              New Password{" "}
              <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>
            </Label>
            <Input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              minLength={6}
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="gap-2 bg-violet-600 text-white hover:bg-violet-500"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Permissions Dialog ─────────────────────────────────────────

function PermissionsDialog({
  vendor,
  open,
  onClose,
  onUpdated,
}: {
  vendor: VendorProfile;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [permissions, setPermissions] = useState<VendorPermissions>(
    vendor.permissions
  );
  const [saving, setSaving] = useState(false);

  const handleToggle = (key: keyof VendorPermissions) => {
    // Inbox is always required
    if (key === "inbox") return;
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) throw new Error("Failed to update permissions");
      toast.success("Permissions updated");
      onClose();
      onUpdated();
    } catch {
      toast.error("Failed to update permissions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-600" />
            Permissions — {vendor.full_name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Control which CRM sections this vendor can access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {(Object.keys(PERMISSION_LABELS) as Array<keyof VendorPermissions>).map(
            (key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {PERMISSION_LABELS[key].label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PERMISSION_LABELS[key].desc}
                  </p>
                </div>
                <Switch
                  checked={permissions[key]}
                  onCheckedChange={() => handleToggle(key)}
                  disabled={key === "inbox"}
                  className="data-[state=checked]:bg-violet-600"
                />
              </div>
            )
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-violet-600 text-white hover:bg-violet-500"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
