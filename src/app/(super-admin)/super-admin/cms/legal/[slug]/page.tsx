"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { LegalPage } from "@/types/super-admin";

export default function CMSLegalEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const { slug } = resolvedParams;
  const router = useRouter();

  const [page, setPage] = useState<LegalPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    async function fetchPage() {
      try {
        const res = await fetch("/api/super-admin/cms/legal");
        if (!res.ok) throw new Error("Failed to fetch legal pages");
        const data = await res.json();
        
        const found = data.pages?.find((p: LegalPage) => p.slug === slug);
        if (!found) {
          throw new Error("Page not found");
        }
        
        setPage(found);
        setTitle(found.title);
        setContent(found.content_markdown || "");
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
      const res = await fetch("/api/super-admin/cms/legal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title,
          content_markdown: content,
          is_published: isPublished
        }),
      });
      
      if (!res.ok) throw new Error("Failed to save document");
      router.push("/super-admin/cms/legal");
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400">Loading editor...</div>;
  }

  if (error || !page) {
    return (
      <div className="p-8 text-center text-red-400 flex flex-col items-center">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>{error?.message || "Document not found."}</p>
        <Button variant="link" onClick={() => router.push("/super-admin/cms/legal")} className="mt-4 text-primary">
          Back to Legal Pages
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Top Nav */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <Link href="/super-admin/cms/legal" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-slate-100 hover:text-slate-900 text-slate-500">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Link href="/super-admin/cms/legal" className="hover:text-primary transition-colors">Legal Pages</Link>
            <span>/</span>
            <span className="text-slate-900 font-medium">{page.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-4">
            <Switch 
              checked={isPublished} 
              onCheckedChange={setIsPublished}
              id="publish-toggle"
            />
            <label htmlFor="publish-toggle" className="text-sm text-slate-600 flex items-center gap-1.5 cursor-pointer">
              {isPublished ? (
                <><Eye className="h-4 w-4 text-primary" /> Published</>
              ) : (
                <><EyeOff className="h-4 w-4 text-slate-500" /> Draft</>
              )}
            </label>
          </div>
          
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 shrink-0">
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Document Title</label>
          <Input 
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="bg-white border-slate-300 text-slate-900 font-bold text-lg"
          />
        </div>
        
        <div className="flex-1 p-0 flex flex-col">
          <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Markdown Content</label>
            <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              Formatting Guide
            </a>
          </div>
          <Textarea 
            value={content}
            onChange={e => setContent(e.target.value)}
            className="flex-1 bg-transparent border-0 text-slate-900 font-mono resize-none focus-visible:ring-0 p-6 leading-relaxed rounded-none"
            placeholder="Write your markdown here..."
          />
        </div>
      </div>
    </div>
  );
}
