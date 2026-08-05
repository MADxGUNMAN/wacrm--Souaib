"use client";

import { useEffect, useState } from "react";
import { Save, AlertCircle, ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContactPageSettings } from "@/types/super-admin";

export default function CMSContactPage() {
  const [settings, setSettings] = useState<Partial<ContactPageSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/super-admin/cms/contact");
        if (!res.ok) throw new Error("Failed to fetch contact settings");
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

  const handleChange = (field: keyof ContactPageSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/super-admin/cms/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading settings...
      </div>
    );
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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/super-admin/cms"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Contact Page
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Manage all dynamic content shown on the public Contact Us page.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className={`${saveSuccess ? "bg-green-600 hover:bg-green-700" : "bg-[#25D366] hover:bg-[#20b958]"} text-white transition-colors`}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : saveSuccess ? "Saved ✓" : "Save Changes"}
        </Button>
      </div>

      {/* ─── Section 1: Page Headings ─── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Page Headings</h3>
          <p className="text-xs text-slate-400 mt-0.5">The hero title and subtitle shown at the top of the contact page.</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase">Heading</label>
            <Input
              value={settings.heading || ""}
              onChange={(e) => handleChange("heading", e.target.value)}
              className="bg-white border-slate-200 text-slate-900 font-bold"
              placeholder="Get in Touch"
            />
            <p className="text-xs text-slate-400">Displayed as &quot;Contact [SiteName].&quot; — this controls the main title word.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase">Subheading</label>
            <Textarea
              value={settings.subheading || ""}
              onChange={(e) => handleChange("subheading", e.target.value)}
              className="bg-white border-slate-200 text-slate-900 h-24 resize-none"
              placeholder="Reach out for product support, billing questions, or WhatsApp automation help."
            />
          </div>
        </div>
      </div>

      {/* ─── Section 2: Contact Info ─── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Contact Information</h3>
          <p className="text-xs text-slate-400 mt-0.5">Business address, phone, email, and working hours displayed on the left side of the contact page.</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase">Office Address</label>
            <Textarea
              value={settings.office_address || ""}
              onChange={(e) => handleChange("office_address", e.target.value)}
              className="bg-white border-slate-200 text-slate-900 h-24 resize-none"
              placeholder="3rd Floor, 16-C, above Central Bank of India&#10;Indrapuri C Sector&#10;Bhopal, Madhya Pradesh 462022&#10;India"
            />
            <p className="text-xs text-slate-400">Supports multi-line addresses.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Phone Number</label>
              <Input
                value={settings.phone_number || ""}
                onChange={(e) => handleChange("phone_number", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
                placeholder="+91 8828891029"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">Public Email Address</label>
              <Input
                type="email"
                value={settings.email_address || ""}
                onChange={(e) => handleChange("email_address", e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
                placeholder="info@junkiescoder.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase">Working Hours</label>
            <Input
              value={settings.working_hours || ""}
              onChange={(e) => handleChange("working_hours", e.target.value)}
              className="bg-white border-slate-200 text-slate-900"
              placeholder="Mon – Fri, 9:00 AM – 6:00 PM IST"
            />
          </div>
        </div>
      </div>

      {/* ─── Section 3: Form Section ─── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Contact Form</h3>
          <p className="text-xs text-slate-400 mt-0.5">The heading and subheading shown above the contact form on the right side.</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase">Form Heading</label>
            <Input
              value={settings.form_heading || ""}
              onChange={(e) => handleChange("form_heading", e.target.value)}
              className="bg-white border-slate-200 text-slate-900 font-bold"
              placeholder="Send us a message"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase">Form Subheading</label>
            <Input
              value={settings.form_subheading || ""}
              onChange={(e) => handleChange("form_subheading", e.target.value)}
              className="bg-white border-slate-200 text-slate-900"
              placeholder="We usually respond within 24 business hours."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
