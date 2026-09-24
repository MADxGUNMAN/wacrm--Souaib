'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  ExternalLink,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  FileText,
  HelpCircle,
  Shield,
  Layers,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  IntegrationPage,
  IntegrationFeature,
  IntegrationStep,
  IntegrationFAQ,
} from '@/types/super-admin';

export default function GoogleSheetsCMSEditorPage() {
  const [page, setPage] = useState<IntegrationPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('landing');

  useEffect(() => {
    async function fetchPage() {
      try {
        const res = await fetch(
          '/api/super-admin/cms/integration-pages/google-sheets'
        );
        if (!res.ok) throw new Error('Failed to load integration page');
        const data = await res.json();
        setPage(data.page);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPage();
  }, []);

  const handleSave = async () => {
    if (!page) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        '/api/super-admin/cms/integration-pages/google-sheets',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(page),
        }
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save changes');
      }
      toast.success('Google Sheets integration settings saved!');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = <K extends keyof IntegrationPage>(
    field: K,
    value: IntegrationPage[K]
  ) => {
    setPage((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  // Features
  const addFeature = () => {
    if (!page) return;
    const newFeature: IntegrationFeature = {
      title: 'New Feature',
      description: 'Feature description here.',
      icon: 'Sparkles',
    };
    updateField('features', [...(page.features || []), newFeature]);
  };

  const updateFeature = (
    index: number,
    field: keyof IntegrationFeature,
    val: string
  ) => {
    if (!page) return;
    const updated = [...(page.features || [])];
    updated[index] = { ...updated[index], [field]: val };
    updateField('features', updated);
  };

  const removeFeature = (index: number) => {
    if (!page) return;
    const updated = (page.features || []).filter((_, i) => i !== index);
    updateField('features', updated);
  };

  // How it works steps
  const addStep = () => {
    if (!page) return;
    const current = page.how_it_works || [];
    const nextNum = current.length + 1;
    const newStep: IntegrationStep = {
      step_number: nextNum,
      title: `Step ${nextNum}`,
      description: 'Describe this step.',
    };
    updateField('how_it_works', [...current, newStep]);
  };

  const updateStep = (
    index: number,
    field: keyof IntegrationStep,
    val: string | number
  ) => {
    if (!page) return;
    const updated = [...(page.how_it_works || [])];
    updated[index] = { ...updated[index], [field]: val };
    updateField('how_it_works', updated);
  };

  const removeStep = (index: number) => {
    if (!page) return;
    const updated = (page.how_it_works || [])
      .filter((_, i) => i !== index)
      .map((s, idx) => ({ ...s, step_number: idx + 1 }));
    updateField('how_it_works', updated);
  };

  // FAQs
  const addFaq = () => {
    if (!page) return;
    const newFaq: IntegrationFAQ = {
      question: 'New Question?',
      answer: 'Answer text here.',
    };
    updateField('faqs', [...(page.faqs || []), newFaq]);
  };

  const updateFaq = (
    index: number,
    field: keyof IntegrationFAQ,
    val: string
  ) => {
    if (!page) return;
    const updated = [...(page.faqs || [])];
    updated[index] = { ...updated[index], [field]: val };
    updateField('faqs', updated);
  };

  const removeFaq = (index: number) => {
    if (!page) return;
    const updated = (page.faqs || []).filter((_, i) => i !== index);
    updateField('faqs', updated);
  };

  // Prerequisites
  const updatePrerequisite = (index: number, val: string) => {
    if (!page) return;
    const updated = [...(page.prerequisites || [])];
    updated[index] = val;
    updateField('prerequisites', updated);
  };

  const addPrerequisite = () => {
    if (!page) return;
    updateField('prerequisites', [
      ...(page.prerequisites || []),
      'New prerequisite',
    ]);
  };

  const removePrerequisite = (index: number) => {
    if (!page) return;
    const updated = (page.prerequisites || []).filter((_, i) => i !== index);
    updateField('prerequisites', updated);
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="p-8 text-center text-slate-500">
        Could not load Google Sheets integration page settings.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/super-admin/cms"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Link
                href="/super-admin/cms"
                className="transition-colors hover:text-slate-600"
              >
                CMS
              </Link>
              <span>/</span>
              <span>Integrations</span>
              <span>/</span>
              <span className="font-medium text-slate-700">Google Sheets</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Google Sheets Add-on CMS
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/integrations/google-sheets"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-emerald-600"
          >
            <span>Live Preview</span>
            <ExternalLink className="h-4 w-4" />
          </Link>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="border border-slate-200 bg-slate-100/80 p-1">
          <TabsTrigger value="landing" className="gap-2">
            <Layers className="h-4 w-4" />
            Landing & Overview
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <Shield className="h-4 w-4" />
            Privacy Policy
          </TabsTrigger>
          <TabsTrigger value="terms" className="gap-2">
            <FileText className="h-4 w-4" />
            Terms of Service
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-2">
            <Search className="h-4 w-4" />
            SEO & Status
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: LANDING & OVERVIEW */}
        <TabsContent value="landing" className="space-y-6">
          {/* Hero Section Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Hero & Action Buttons
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Badge Text
                </label>
                <Input
                  value={page.badge_text}
                  onChange={(e) => updateField('badge_text', e.target.value)}
                  placeholder="e.g. Google Workspace Marketplace Add-on"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Main Headline (Title)
                </label>
                <Input
                  value={page.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="e.g. Replai for Google Sheets — Automated WhatsApp Messaging"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Subtitle / Description
                </label>
                <Textarea
                  rows={3}
                  value={page.subtitle}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  placeholder="Summary of what the add-on does..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Primary CTA Button Text
                </label>
                <Input
                  value={page.primary_cta_text}
                  onChange={(e) =>
                    updateField('primary_cta_text', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Primary CTA Link (Marketplace URL)
                </label>
                <Input
                  value={page.primary_cta_url}
                  onChange={(e) =>
                    updateField('primary_cta_url', e.target.value)
                  }
                  placeholder="https://workspace.google.com/marketplace/app/..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Secondary CTA Button Text
                </label>
                <Input
                  value={page.secondary_cta_text}
                  onChange={(e) =>
                    updateField('secondary_cta_text', e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Secondary CTA Link (Sign Up / Login)
                </label>
                <Input
                  value={page.secondary_cta_url}
                  onChange={(e) =>
                    updateField('secondary_cta_url', e.target.value)
                  }
                />
              </div>
            </div>
          </div>

          {/* Prerequisites (Mandatory for Google Marketplace Review) */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Shield className="h-5 w-5 text-amber-600" />
                Required Disclosures & Prerequisites
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPrerequisite}
                className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              >
                <Plus className="mr-1 h-4 w-4" /> Add Requirement
              </Button>
            </div>
            <p className="mb-4 text-xs text-amber-800">
              Google review strictly requires stating that this add-on needs a
              Replai account and an approved Meta WhatsApp template.
            </p>
            <div className="space-y-2">
              {(page.prerequisites || []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item}
                    onChange={(e) => updatePrerequisite(idx, e.target.value)}
                    className="bg-white"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePrerequisite(idx)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Features Grid */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Feature Highlights
                </h2>
                <p className="text-xs text-slate-500">
                  Key capabilities shown on the integration landing page.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFeature}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Feature
              </Button>
            </div>
            <div className="space-y-4">
              {(page.features || []).map((feat, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <Input
                        value={feat.title}
                        onChange={(e) =>
                          updateFeature(idx, 'title', e.target.value)
                        }
                        placeholder="Feature Title"
                        className="bg-white font-medium"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFeature(idx)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={feat.description}
                    onChange={(e) =>
                      updateFeature(idx, 'description', e.target.value)
                    }
                    placeholder="Short description of this feature..."
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* How It Works Steps */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  How It Works (Steps)
                </h2>
                <p className="text-xs text-slate-500">
                  Step-by-step onboarding guide.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStep}
              >
                <Plus className="mr-1 h-4 w-4" /> Add Step
              </Button>
            </div>
            <div className="space-y-3">
              {(page.how_it_works || []).map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                    {step.step_number || idx + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={step.title}
                      onChange={(e) => updateStep(idx, 'title', e.target.value)}
                      placeholder="Step Title"
                      className="bg-white font-medium"
                    />
                    <Textarea
                      rows={2}
                      value={step.description}
                      onChange={(e) =>
                        updateStep(idx, 'description', e.target.value)
                      }
                      placeholder="Step instructions..."
                      className="bg-white"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStep(idx)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* FAQs */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <HelpCircle className="h-5 w-5 text-emerald-500" />
                  Frequently Asked Questions (FAQ)
                </h2>
                <p className="text-xs text-slate-500">
                  Interactive FAQ accordion on the public landing page.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFaq}
              >
                <Plus className="mr-1 h-4 w-4" /> Add FAQ
              </Button>
            </div>
            <div className="space-y-3">
              {(page.faqs || []).map((faq, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Input
                      value={faq.question}
                      onChange={(e) =>
                        updateFaq(idx, 'question', e.target.value)
                      }
                      placeholder="Question"
                      className="bg-white font-medium"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFaq(idx)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                    placeholder="Answer"
                    className="bg-white"
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: PRIVACY POLICY */}
        <TabsContent value="privacy" className="space-y-4">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Shield className="h-5 w-5 text-emerald-500" />
                  Dedicated Google Sheets Add-on Privacy Policy
                </h2>
                <p className="text-xs text-slate-500">
                  Rendered live at{' '}
                  <Link
                    href="/integrations/google-sheets/privacy"
                    target="_blank"
                    className="font-mono text-emerald-600 underline"
                  >
                    /integrations/google-sheets/privacy
                  </Link>
                </p>
              </div>
              <Link
                href="/integrations/google-sheets/privacy"
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
              >
                <span>View Public Page</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              💡 <strong>Marketplace Review Compliance:</strong> Google
              reviewers require this document to state that only{' '}
              <code className="font-mono text-emerald-700">
                spreadsheets.currentonly
              </code>{' '}
              is accessed, data is transferred exclusively to deliver WhatsApp
              messages over HTTPS, and data is never sold or used for AI
              training.
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Privacy Policy Content (Markdown)
              </label>
              <Textarea
                rows={22}
                value={page.privacy_markdown}
                onChange={(e) =>
                  updateField('privacy_markdown', e.target.value)
                }
                className="font-mono text-sm leading-relaxed"
                placeholder="# Privacy Policy for Replai..."
              />
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: TERMS OF SERVICE */}
        <TabsContent value="terms" className="space-y-4">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  Dedicated Google Sheets Add-on Terms of Service
                </h2>
                <p className="text-xs text-slate-500">
                  Rendered live at{' '}
                  <Link
                    href="/integrations/google-sheets/terms"
                    target="_blank"
                    className="font-mono text-emerald-600 underline"
                  >
                    /integrations/google-sheets/terms
                  </Link>
                </p>
              </div>
              <Link
                href="/integrations/google-sheets/terms"
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
              >
                <span>View Public Page</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Terms of Service Content (Markdown)
              </label>
              <Textarea
                rows={22}
                value={page.terms_markdown}
                onChange={(e) => updateField('terms_markdown', e.target.value)}
                className="font-mono text-sm leading-relaxed"
                placeholder="# Terms of Service for Replai..."
              />
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: SEO & PUBLISHING */}
        <TabsContent value="seo" className="space-y-4">
          <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Publishing Status
                </h2>
                <p className="text-xs text-slate-500">
                  Toggle whether the public pages are active.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {page.is_published ? 'Published' : 'Draft'}
                </span>
                <Switch
                  checked={page.is_published}
                  onCheckedChange={(val) => updateField('is_published', val)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Search className="h-4 w-4 text-slate-500" />
                SEO Metadata
              </h2>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Meta Title
                </label>
                <Input
                  value={page.seo_meta_title}
                  onChange={(e) =>
                    updateField('seo_meta_title', e.target.value)
                  }
                  placeholder="Page title for search engines"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Meta Description
                </label>
                <Textarea
                  rows={3}
                  value={page.seo_meta_description}
                  onChange={(e) =>
                    updateField('seo_meta_description', e.target.value)
                  }
                  placeholder="Summary for Google search results..."
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
