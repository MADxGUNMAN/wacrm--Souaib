'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Settings, Save, AlertCircle, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { SiteSettings } from '@/types/super-admin';
import { uploadAccountMedia } from '@/lib/storage/upload-media';

/**
 * Advertised ceiling for the hero background video.
 *
 * Checked in the browser BEFORE asking for a presigned URL, so an oversized
 * file fails instantly with a readable reason instead of after a long upload.
 * `/api/storage/presign` enforces its own hard backstop.
 */
const HERO_VIDEO_MAX_BYTES = 15 * 1024 * 1024;
const HERO_VIDEO_ACCEPT = 'video/mp4';

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<Partial<SiteSettings>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  /** 0-100 while the hero video uploads. A video is slow enough that a
   *  button with no progress reads as hung. */
  const [videoProgress, setVideoProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/super-admin/cms/settings', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Failed to fetch settings');
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
      formData.append('file', file);
      formData.append('folder', field);

      const res = await fetch('/api/super-admin/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      handleChange(field, data.url);
    } catch (err) {
      toast.error('Upload failed: ' + (err as Error).message);
    } finally {
      setUploadingField(null);
    }
  };

  /**
   * The hero video does NOT go through /api/super-admin/upload.
   *
   * That route buffers the whole file in memory and passes through nginx,
   * whose request-body cap sits well below the size of a video - so a real
   * upload there fails with a 413 that looks like a server fault. This uses
   * the presigned browser-to-S3 path instead, into the platform-wide
   * `landing-assets` prefix (allowed, and deliberately not account-scoped).
   */
  const handleVideoUpload = async (field: keyof SiteSettings, file: File) => {
    if (file.size > HERO_VIDEO_MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      toast.error(
        `That video is ${mb} MB. Keep it under ${HERO_VIDEO_MAX_BYTES / 1024 / 1024} MB so the landing page stays fast.`
      );
      return;
    }
    if (file.type !== HERO_VIDEO_ACCEPT) {
      toast.error(
        'Use an MP4 (H.264) - it is the one format every browser plays.'
      );
      return;
    }

    setUploadingField(field);
    setVideoProgress(0);
    try {
      const { publicUrl } = await uploadAccountMedia('landing-assets', file, {
        onProgress: setVideoProgress,
      });
      handleChange(field, publicUrl);
      toast.success('Video uploaded. Press Save Settings to publish it.');
    } catch (err) {
      toast.error('Upload failed: ' + (err as Error).message);
    } finally {
      setUploadingField(null);
      setVideoProgress(0);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/super-admin/cms/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      toast.success('Settings saved successfully.');
    } catch (err) {
      toast.error('Error: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400">Loading settings...</div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center p-8 text-center text-red-400">
        <AlertCircle className="mb-2 h-8 w-8" />
        <p>Failed to load settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Branding & SEO */}
        <div className="space-y-4 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            Branding & SEO
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                Site Name
              </label>
              <Input
                value={settings.site_name || ''}
                onChange={(e) => handleChange('site_name', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                Tagline
              </label>
              <Input
                value={settings.tagline || ''}
                onChange={(e) => handleChange('tagline', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                Site Description (Meta)
              </label>
              <Textarea
                value={settings.site_description || ''}
                onChange={(e) =>
                  handleChange('site_description', e.target.value)
                }
                className="min-h-[80px] border-slate-200 bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Assets */}
        <div className="space-y-6 p-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Brand Assets &amp; Logos
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload PNG/WebP images to storage or enter direct URLs for your
              platform brand assets.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* 1. Main Brand Logo - Light Mode */}
            <AssetCard
              label="Main Brand Logo (Light Mode)"
              description="Used in CRM Sidebar, Landing Header & Auth Forms when Light Theme is active"
              value={settings.logo_url || ''}
              isUploading={uploadingField === 'logo_url'}
              onChange={(val) => handleChange('logo_url', val)}
              onFileSelect={(file) => handleFileUpload('logo_url', file)}
            />

            {/* 2. Main Brand Logo - Dark Mode */}
            <AssetCard
              label="Main Brand Logo (Dark Mode)"
              description="Used in CRM Sidebar & Headers when Dark Theme is active"
              value={settings.logo_dark_url || ''}
              isUploading={uploadingField === 'logo_dark_url'}
              onChange={(val) => handleChange('logo_dark_url', val)}
              onFileSelect={(file) => handleFileUpload('logo_dark_url', file)}
            />

            {/* 2. Favicon / App Icon */}
            <AssetCard
              label="Favicon / App Icon (logo-icon)"
              description="Used in Browser Tab Favicon, Super Admin Sidebar & Mobile UI"
              value={settings.favicon_url || ''}
              isUploading={uploadingField === 'favicon_url'}
              onChange={(val) => handleChange('favicon_url', val)}
              onFileSelect={(file) => handleFileUpload('favicon_url', file)}
            />

            {/* 3. Full Email Logo */}
            <AssetCard
              label="Full Email Logo (logo-full)"
              description="Used in Outgoing Email Headers & Support Replies"
              value={settings.full_logo_url || ''}
              isUploading={uploadingField === 'full_logo_url'}
              onChange={(val) => handleChange('full_logo_url', val)}
              onFileSelect={(file) => handleFileUpload('full_logo_url', file)}
            />

            {/* 4. Meta Business Partner Badge */}
            <AssetCard
              label="Meta Business Partner Badge"
              description="Used in Landing Page Footer Trust Section"
              value={settings.meta_partner_badge_url || ''}
              isUploading={uploadingField === 'meta_partner_badge_url'}
              onChange={(val) => handleChange('meta_partner_badge_url', val)}
              onFileSelect={(file) =>
                handleFileUpload('meta_partner_badge_url', file)
              }
            />
          </div>

          {/* 5. Landing hero background video. Full width: it behaves
                differently from the logo fields above (different upload path,
                different constraints) and the caveats need room. */}
          <VideoAssetCard
            label="Landing Hero Background Video"
            description="Plays behind the hero on the public landing page. Desktop only - never loaded on phones, or for visitors who ask for reduced motion. Muted and looping, so a short clip works best."
            value={settings.hero_video_url || ''}
            isUploading={uploadingField === 'hero_video_url'}
            progress={videoProgress}
            maxMb={HERO_VIDEO_MAX_BYTES / 1024 / 1024}
            onChange={(val) => handleChange('hero_video_url', val)}
            onFileSelect={(file) => handleVideoUpload('hero_video_url', file)}
          />
        </div>

        {/* Contact Emails */}
        <div className="space-y-4 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            Contact Information
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                Support Email
              </label>
              <Input
                type="email"
                value={settings.support_email || ''}
                onChange={(e) => handleChange('support_email', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 uppercase">
                Sales Email
              </label>
              <Input
                type="email"
                value={settings.sales_email || ''}
                onChange={(e) => handleChange('sales_email', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Social Media Links */}
        <div className="space-y-4 border-b border-slate-200 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            Social Media Links
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            URLs to display in the footer when "Show Social Icons" is enabled.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
                Twitter / X URL
              </label>
              <Input
                placeholder="https://x.com/yourusername"
                value={settings.social_twitter || ''}
                onChange={(e) => handleChange('social_twitter', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
                LinkedIn URL
              </label>
              <Input
                placeholder="https://linkedin.com/company/yourcompany"
                value={settings.social_linkedin || ''}
                onChange={(e) =>
                  handleChange('social_linkedin', e.target.value)
                }
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
                GitHub URL
              </label>
              <Input
                placeholder="https://github.com/yourorg"
                value={settings.social_github || ''}
                onChange={(e) => handleChange('social_github', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
                Instagram URL
              </label>
              <Input
                placeholder="https://instagram.com/yourhandle"
                value={settings.social_instagram || ''}
                onChange={(e) =>
                  handleChange('social_instagram', e.target.value)
                }
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
                YouTube URL
              </label>
              <Input
                placeholder="https://youtube.com/@yourchannel"
                value={settings.social_youtube || ''}
                onChange={(e) => handleChange('social_youtube', e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4 p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            Features
          </h3>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="font-medium text-slate-900">Show Social Icons</p>
                <p className="text-sm text-slate-500">
                  Display social media links in the public footer.
                </p>
              </div>
              <Switch
                checked={settings.show_social_icons || false}
                onCheckedChange={(val) =>
                  handleChange('show_social_icons', val)
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="font-medium text-slate-900">
                  Show Newsletter Signup
                </p>
                <p className="text-sm text-slate-500">
                  Display the email subscription form in the footer.
                </p>
              </div>
              <Switch
                checked={settings.show_newsletter || false}
                onCheckedChange={(val) => handleChange('show_newsletter', val)}
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
  isUploading,
  onChange,
  onFileSelect,
}: {
  label: string;
  description: string;
  value: string;
  isUploading: boolean;
  onChange: (val: string) => void;
  onFileSelect: (file: File) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-bold tracking-wider text-slate-700 uppercase">
            {label}
          </label>
          <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        </div>

        {/* Live Image Preview */}
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {value ? (
            <img
              src={value}
              alt={label}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Upload className="size-4 text-slate-300" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://... or upload image"
          className="h-9 flex-1 border-slate-200 bg-white text-xs text-slate-900"
        />

        <label className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          {isUploading ? (
            <Loader2 className="size-3.5 animate-spin text-blue-500" />
          ) : (
            <Upload className="size-3.5 text-slate-500" />
          )}
          <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
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

/**
 * Same shape as AssetCard, but for a video.
 *
 * Separate rather than a prop on AssetCard because almost everything
 * differs: the preview is a muted looping <video> instead of an <img>, the
 * accept list is MP4 only, there is a byte ceiling worth stating up front,
 * and the upload reports progress because it is large enough to look stuck
 * without it.
 */
function VideoAssetCard({
  label,
  description,
  value,
  isUploading,
  progress,
  maxMb,
  onChange,
  onFileSelect,
}: {
  label: string;
  description: string;
  value: string;
  isUploading: boolean;
  progress: number;
  maxMb: number;
  onChange: (val: string) => void;
  onFileSelect: (file: File) => void;
}) {
  return (
    <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-bold tracking-wider text-slate-700 uppercase">
            {label}
          </label>
          <p className="mt-0.5 max-w-2xl text-[11px] text-slate-500">
            {description}
          </p>
        </div>

        <div className="relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {value ? (
            // Muted + loop so the preview shows what visitors get, without
            // audio firing inside the admin panel.
            <video
              src={value}
              muted
              loop
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <Upload className="size-4 text-slate-300" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://... or upload an MP4"
          className="h-9 flex-1 border-slate-200 bg-white text-xs text-slate-900"
        />

        <label className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          {isUploading ? (
            <Loader2 className="size-3.5 animate-spin text-blue-500" />
          ) : (
            <Upload className="size-3.5 text-slate-500" />
          )}
          <span>{isUploading ? `Uploading ${progress}%` : 'Upload Video'}</span>
          <input
            type="file"
            accept="video/mp4"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
            }}
          />
        </label>
      </div>

      <p className="text-[11px] text-slate-400">
        MP4 (H.264), up to {maxMb} MB. Clearing this field returns the hero to
        its static background.
      </p>
    </div>
  );
}
