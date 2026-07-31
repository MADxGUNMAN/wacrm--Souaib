"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { 
  ArrowLeft, 
  Scale, 
  Eye, 
  EyeOff, 
  Edit3,
  AlertCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LegalPage } from "@/types/super-admin";

export default function CMSLegalListPage() {
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchPages() {
      try {
        const res = await fetch("/api/super-admin/cms/legal");
        if (!res.ok) throw new Error("Failed to fetch legal pages");
        const data = await res.json();
        setPages(data.pages || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPages();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Nav */}
      <div className="flex items-center space-x-4">
        <Link href="/super-admin/cms" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-slate-100 hover:text-slate-900 text-slate-500">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <Link href="/super-admin/cms" className="hover:text-primary transition-colors">CMS & Landing</Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">Legal Pages</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Scale className="h-6 w-6 text-rose-500" />
            Legal Pages
          </h2>
          <p className="text-sm text-slate-500 mt-1">Manage Privacy Policy, Terms of Service, and other legal documents.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading documents...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 flex flex-col items-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p>Failed to load legal pages.</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No legal documents found.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {pages.map((page) => (
              <div key={page.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors group">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg mt-1 ${page.is_published ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                    {page.is_published ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      {page.title}
                      {!page.is_published && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 uppercase">
                          Draft
                        </span>
                      )}
                    </h3>
                    <div className="text-sm text-slate-500 mt-1 flex gap-4">
                      <span>/{page.slug}</span>
                      <span className="text-slate-600">•</span>
                      <span>Last updated {formatDistanceToNow(new Date(page.last_updated_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
                
                <Link href={`/super-admin/cms/legal/${page.slug}`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900">
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit Document
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
