"use client";

import { useEffect, useState } from "react";
import { Settings, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { SiteSettings } from "@/types/super-admin";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<Partial<SiteSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/super-admin/cms/settings");
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
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Assets</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Logo URL</label>
              <Input 
                value={settings.logo_url || ""} 
                onChange={(e) => handleChange("logo_url", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
                placeholder="https://"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Favicon URL</label>
              <Input 
                value={settings.favicon_url || ""} 
                onChange={(e) => handleChange("favicon_url", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
                placeholder="https://"
              />
            </div>
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
