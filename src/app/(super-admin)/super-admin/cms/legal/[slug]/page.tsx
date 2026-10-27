'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StrapiMarkdownEditor } from '@/components/super-admin/cms/strapi-markdown-editor';
import type { LegalPage } from '@/types/super-admin';

export default function CMSLegalEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const { slug } = resolvedParams;
  const router = useRouter();

  const [page, setPage] = useState<LegalPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    async function fetchPage() {
      try {
        const res = await fetch('/api/super-admin/cms/legal');
        if (!res.ok) throw new Error('Failed to fetch legal pages');
        const data = await res.json();

        const found = data.pages?.find((p: LegalPage) => p.slug === slug);
        if (!found) {
          throw new Error('Page not found');
        }

        setPage(found);
        setTitle(found.title);
        setContent(found.content_markdown || '');
        setIsPublished(found.is_published);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPage();
  }, [slug]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/super-admin/cms/legal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title,
          content_markdown: content,
          is_published: isPublished,
        }),
      });

      if (!res.ok) throw new Error('Failed to save document');
      toast.success('Document saved successfully!');
      router.push('/super-admin/cms/legal');
    } catch (err) {
      toast.error('Error: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400">Loading editor...</div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex flex-col items-center p-8 text-center text-red-400">
        <AlertCircle className="mb-2 h-8 w-8" />
        <p>{error?.message || 'Document not found.'}</p>
        <Button
          variant="link"
          onClick={() => router.push('/super-admin/cms/legal')}
          className="text-primary mt-4"
        >
          Back to Legal Pages
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* Top Nav */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link
            href="/super-admin/cms/legal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Link
              href="/super-admin/cms/legal"
              className="hover:text-primary transition-colors"
            >
              Legal Pages
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-900">{page.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="mr-2 flex items-center gap-2">
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
              id="publish-toggle"
            />
            <label
              htmlFor="publish-toggle"
              className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-700 select-none"
            >
              {isPublished ? (
                <>
                  <Eye className="text-primary h-4 w-4" />
                  <span className="text-primary font-semibold">Published</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-500">Draft</span>
                </>
              )}
            </label>
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="font-semibold shadow-xs"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Document Title Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <label className="mb-2 block text-xs font-bold tracking-wider text-slate-500 uppercase">
          Document Title
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Terms of Service, Refund Policy..."
          className="focus-visible:ring-primary/20 border-slate-200 bg-white text-base font-bold text-slate-900 sm:text-lg"
        />
      </div>

      {/* Strapi-Style Markdown Content Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">
            Markdown Content
          </label>
          <a
            href="https://www.markdownguide.org/cheat-sheet/"
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            Formatting Guide
          </a>
        </div>

        <StrapiMarkdownEditor
          value={content}
          onChange={setContent}
          documentTitle={title || page.title}
          placeholder="Write your legal document markdown here..."
        />
      </div>
    </div>
  );
}
