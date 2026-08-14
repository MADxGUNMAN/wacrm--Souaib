"use client";

import { useEffect, useState } from "react";
import { Settings, Save, AlertCircle, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { SiteSettings } from "@/types/super-admin";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<Partial<SiteSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/super-admin/cms/settings", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch settings");
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleChange = (field: keyof SiteSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (field: keyof SiteSettings, file: File) => {
    setUploadingField(field);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", field);

      const res = await fetch("/api/super-admin/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      handleChange(field, data.url);
    } catch (err) {
      alert("Upload failed: " + (err as Error).message);
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/super-admin/cms/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      alert("Settings saved successfully.");
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400">Loading settings...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400 flex flex-col items-center">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>Failed to load settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-blue-500" />
            Global Platform Settings
          </h2>
          <p className="text-sm text-slate-500 mt-1">Configure global SEO, branding, and contact emails for the platform.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm divide-y divide-slate-200">
        
        {/* Branding & SEO */}
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Branding & SEO</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Site Name</label>
              <Input 
                value={settings.site_name || ""} 
                onChange={(e) => handleChange("site_name", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Tagline</label>
              <Input 
                value={settings.tagline || ""} 
                onChange={(e) => handleChange("tagline", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Site Description (Meta)</label>
              <Textarea 
                value={settings.site_description || ""} 
                onChange={(e) => handleChange("site_description", e.target.value)}
                className="bg-white border-slate-200 text-slate-900 min-h-[80px]"
              />
            </div>
          </div>
        </div>

        {/* Assets */}
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Brand Assets &amp; Logos</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload PNG/WebP images to storage or enter direct URLs for your platform brand assets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Main Brand Logo - Light Mode */}
            <AssetCard
              label="Main Brand Logo (Light Mode)"
              description="Used in CRM Sidebar, Landing Header & Auth Forms when Light Theme is active"
              value={settings.logo_url || ""}
              fallback="/Replai-logo.png"
              isUploading={uploadingField === "logo_url"}
              onChange={(val) => handleChange("logo_url", val)}
              onFileSelect={(file) => handleFileUpload("logo_url", file)}
            />

            {/* 2. Main Brand Logo - Dark Mode */}
            <AssetCard
              label="Main Brand Logo (Dark Mode)"
              description="Used in CRM Sidebar & Headers when Dark Theme is active"
              value={settings.logo_dark_url || ""}
              fallback="/Replai-logo.png"
              isUploading={uploadingField === "logo_dark_url"}
              onChange={(val) => handleChange("logo_dark_url", val)}
              onFileSelect={(file) => handleFileUpload("logo_dark_url", file)}
            />

            {/* 2. Favicon / App Icon */}
            <AssetCard
              label="Favicon / App Icon (logo-icon)"
              description="Used in Browser Tab Favicon, Super Admin Sidebar & Mobile UI"
              value={settings.favicon_url || ""}
              fallback="/logo-icon.png"
              isUploading={uploadingField === "favicon_url"}
              onChange={(val) => handleChange("favicon_url", val)}
              onFileSelect={(file) => handleFileUpload("favicon_url", file)}
            />

            {/* 3. Full Email Logo */}
            <AssetCard
              label="Full Email Logo (logo-full)"
              description="Used in Outgoing Email Headers & Support Replies"
              value={settings.full_logo_url || ""}
              fallback="/logo-full.jpg"
              isUploading={uploadingField === "full_logo_url"}
              onChange={(val) => handleChange("full_logo_url", val)}
              onFileSelect={(file) => handleFileUpload("full_logo_url", file)}
            />

            {/* 4. Meta Business Partner Badge */}
            <AssetCard
              label="Meta Business Partner Badge"
              description="Used in Landing Page Footer Trust Section"
              value={settings.meta_partner_badge_url || ""}
              fallback="/meta-business-partner-badge.webp"
              isUploading={uploadingField === "meta_partner_badge_url"}
              onChange={(val) => handleChange("meta_partner_badge_url", val)}
              onFileSelect={(file) => handleFileUpload("meta_partner_badge_url", file)}
            />
          </div>
        </div>

        {/* Contact Emails */}
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Support Email</label>
              <Input 
                type="email"
                value={settings.support_email || ""} 
                onChange={(e) => handleChange("support_email", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Sales Email</label>
              <Input 
                type="email"
                value={settings.sales_email || ""} 
                onChange={(e) => handleChange("sales_email", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Social Media Links */}
        <div className="p-6 border-b border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Social Media Links</h3>
          <p className="text-sm text-slate-500 mb-4">URLs to display in the footer when "Show Social Icons" is enabled.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-2 block">Twitter / X URL</label>
              <Input 
                placeholder="https://x.com/yourusername"
                value={settings.social_twitter || ""} 
                onChange={(e) => handleChange("social_twitter", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-2 block">LinkedIn URL</label>
              <Input 
                placeholder="https://linkedin.com/company/yourcompany"
                value={settings.social_linkedin || ""} 
                onChange={(e) => handleChange("social_linkedin", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-2 block">GitHub URL</label>
              <Input 
                placeholder="https://github.com/yourorg"
                value={settings.social_github || ""} 
                onChange={(e) => handleChange("social_github", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-2 block">Instagram URL</label>
              <Input 
                placeholder="https://instagram.com/yourhandle"
                value={settings.social_instagram || ""} 
                onChange={(e) => handleChange("social_instagram", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-2 block">YouTube URL</label>
              <Input 
                placeholder="https://youtube.com/@yourchannel"
                value={settings.social_youtube || ""} 
                onChange={(e) => handleChange("social_youtube", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Features</h3>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <p className="font-medium text-slate-900">Show Social Icons</p>
                <p className="text-sm text-slate-500">Display social media links in the public footer.</p>
              </div>
              <Switch 
                checked={settings.show_social_icons || false}
                onCheckedChange={(val) => handleChange("show_social_icons", val)}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <p className="font-medium text-slate-900">Show Newsletter Signup</p>
                <p className="text-sm text-slate-500">Display the email subscription form in the footer.</p>
              </div>
              <Switch 
                checked={settings.show_newsletter || false}
                onCheckedChange={(val) => handleChange("show_newsletter", val)}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function AssetCard({
  label,
  description,
  value,
  fallback,
  isUploading,
  onChange,
  onFileSelect,
}: {
  label: string;
  description: string;
  value: string;
  fallback: string;
  isUploading: boolean;
  onChange: (val: string) => void;
  onFileSelect: (file: File) => void;
}) {
  const currentSrc = value || fallback;

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {label}
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>

        {/* Live Image Preview */}
        <div className="relative size-12 rounded-lg border border-slate-200 bg-white p-1 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
          <img
            src={currentSrc}
            alt={label}
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallback;
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          className="bg-white border-slate-200 text-slate-900 text-xs h-9 flex-1"
        />

        <label className="cursor-pointer inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs font-medium rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm shrink-0">
          {isUploading ? (
            <Loader2 className="size-3.5 animate-spin text-blue-500" />
          ) : (
            <Upload className="size-3.5 text-slate-500" />
          )}
          <span>{isUploading ? "Uploading..." : "Upload File"}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
