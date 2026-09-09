'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, Loader2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { updateSiteSettings } from './actions';

export default function GlobalSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    site_name: '',
    tagline: '',
    meta_title: '',
    meta_description: '',
    og_image_url: '',
    canonical_url: '',
    no_index: false,
    json_ld_schema: '',
    support_email: '',
    copyright_text: '',
  });

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();
      const { data } = await supabase
        .from('site_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        setFormData({
          site_name: data.site_name || '',
          tagline: data.tagline || '',
          meta_title: data.meta_title || '',
          meta_description: data.meta_description || '',
          og_image_url: data.og_image_url || '',
          canonical_url: data.canonical_url || '',
          no_index: !!data.no_index,
          json_ld_schema: data.json_ld_schema || '',
          support_email: data.support_email || '',
          copyright_text: data.copyright_text || '',
        });
      }
      setIsLoading(false);
    }
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await updateSiteSettings(formData);
      if (res.error) {
        toast.error('Failed to save settings: ' + res.error);
      } else {
        toast.success('Site settings saved successfully!');
        router.refresh();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An error occurred while saving.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (
    field: keyof typeof formData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => router.push('/super-admin/cms')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Global Settings
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage global site metadata and SEO configuration.
            </p>
          </div>
        </div>
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Main Column */}
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                The core identity of your website.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Site Name</Label>
                  <Input
                    value={formData.site_name}
                    onChange={(e) =>
                      handleInputChange('site_name', e.target.value)
                    }
                    placeholder="e.g. Replai"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tagline</Label>
                  <Input
                    value={formData.tagline}
                    onChange={(e) =>
                      handleInputChange('tagline', e.target.value)
                    }
                    placeholder="e.g. WhatsApp CRM Automation"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Support Email</Label>
                  <Input
                    type="email"
                    value={formData.support_email}
                    onChange={(e) =>
                      handleInputChange('support_email', e.target.value)
                    }
                    placeholder="support@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Footer Website Link</Label>
                  <Input
                    value={formData.copyright_text?.split('|||')[2] || ''}
                    onChange={(e) => {
                      const parts = formData.copyright_text?.split('|||') || [
                        '',
                        '',
                        '',
                        '',
                      ];
                      while (parts.length < 4) parts.push('');
                      parts[2] = e.target.value;
                      handleInputChange('copyright_text', parts.join('|||'));
                    }}
                    placeholder="e.g. https://junkiescoder.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Footer Text (Left)</Label>
                  <Input
                    value={formData.copyright_text?.split('|||')[0] || ''}
                    onChange={(e) => {
                      const parts = formData.copyright_text?.split('|||') || [
                        '',
                        '',
                        '',
                        '',
                      ];
                      while (parts.length < 4) parts.push('');
                      parts[0] = e.target.value;
                      handleInputChange('copyright_text', parts.join('|||'));
                    }}
                    placeholder="e.g. © 2026 Replai. All rights reserved."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Footer Text (Right)</Label>
                  <Input
                    value={formData.copyright_text?.split('|||')[1] || ''}
                    onChange={(e) => {
                      const parts = formData.copyright_text?.split('|||') || [
                        '',
                        '',
                        '',
                        '',
                      ];
                      while (parts.length < 4) parts.push('');
                      parts[1] = e.target.value;
                      handleInputChange('copyright_text', parts.join('|||'));
                    }}
                    placeholder="e.g. Made with ❤️ in India"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEO Section matched to the screenshot */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle>SEO Configuration</CardTitle>
                <CardDescription>
                  Manage how your site appears on search engines and social
                  media.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-2 gap-8">
                {/* meta_title */}
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700">
                    meta_title
                  </Label>
                  <Input
                    value={formData.meta_title}
                    onChange={(e) =>
                      handleInputChange('meta_title', e.target.value)
                    }
                    placeholder="Custom Workflow Automation Engineered for Scale"
                    maxLength={120}
                    className="font-medium"
                  />
                  <div className="text-right font-mono text-[11px] text-slate-500">
                    max. 120 characters ({formData.meta_title.length}/120)
                  </div>
                </div>

                {/* meta_description */}
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700">
                    meta_description
                  </Label>
                  <Textarea
                    value={formData.meta_description}
                    onChange={(e) =>
                      handleInputChange('meta_description', e.target.value)
                    }
                    placeholder="Create intelligent workflows that adapt to your processes..."
                    maxLength={320}
                    className="h-24 resize-none"
                  />
                  <div className="text-right font-mono text-[11px] text-slate-500">
                    max. 320 characters ({formData.meta_description.length}/320)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                {/* og_image */}
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-700">
                    og_image
                  </Label>
                  <div className="group mt-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 transition-colors hover:bg-slate-50">
                    {formData.og_image_url ? (
                      <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-md bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={formData.og_image_url}
                          alt="OG Preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 shadow-sm transition-transform group-hover:scale-105">
                        <ImagePlus className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <Input
                      placeholder="Paste image URL here..."
                      value={formData.og_image_url}
                      onChange={(e) =>
                        handleInputChange('og_image_url', e.target.value)
                      }
                      className="bg-white text-center"
                    />
                    <p className="mt-3 text-center text-xs text-slate-400">
                      Provide a URL for the OpenGraph image asset
                    </p>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* canonical_url */}
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">
                      canonical_url
                    </Label>
                    <Input
                      value={formData.canonical_url}
                      onChange={(e) =>
                        handleInputChange('canonical_url', e.target.value)
                      }
                      placeholder="https://www.junkiescoder.com/automation"
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* no_index */}
                    <div className="space-y-3">
                      <Label className="block font-semibold text-slate-700">
                        no_index
                      </Label>
                      <div className="flex w-fit overflow-hidden rounded-md border bg-white">
                        <button
                          type="button"
                          onClick={() => handleInputChange('no_index', false)}
                          className={`px-6 py-1.5 text-sm font-medium transition-colors ${!formData.no_index ? 'border-r bg-rose-50 text-rose-600' : 'border-r text-slate-500 hover:bg-slate-50'}`}
                        >
                          FALSE
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInputChange('no_index', true)}
                          className={`px-6 py-1.5 text-sm font-medium transition-colors ${formData.no_index ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                          TRUE
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Prevent search engines from indexing.
                      </p>
                    </div>

                    {/* json_ld_schema */}
                    <div className="col-span-2 mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold text-slate-700">
                          JSON_LD_SCHEMA
                        </Label>
                        {formData.json_ld_schema && (
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() =>
                              handleInputChange('json_ld_schema', '')
                            }
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <Textarea
                        value={formData.json_ld_schema}
                        onChange={(e) =>
                          handleInputChange('json_ld_schema', e.target.value)
                        }
                        placeholder={
                          '{\n  "@context": "https://schema.org",\n  "@type": "Service"\n}'
                        }
                        className="h-32 bg-slate-50 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Indexability</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${formData.no_index ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}
                >
                  {formData.no_index ? 'No Index' : 'Indexed'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Schema.org</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${formData.json_ld_schema ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}
                >
                  {formData.json_ld_schema ? 'Configured' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Robots.txt</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${formData.no_index ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}
                >
                  {formData.no_index ? 'Disallow All' : 'Allow Crawling'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Sitemap</span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                  Active
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a
                href="/robots.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-sm text-blue-600 hover:underline"
              >
                <span>/robots.txt</span>
                <span className="text-slate-400">↗</span>
              </a>
              <a
                href="/sitemap.xml"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-sm text-blue-600 hover:underline"
              >
                <span>/sitemap.xml</span>
                <span className="text-slate-400">↗</span>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
