"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { updateNavigationLinks } from "./actions";
import type { NavLink, FooterColumn } from "@/types/super-admin";

export default function NavigationSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [headerLinks, setHeaderLinks] = useState<NavLink[]>([]);
  const [footerLinks, setFooterLinks] = useState<FooterColumn[]>([]);
  const [siteDescription, setSiteDescription] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("header_links, footer_links, site_description")
        .limit(1)
        .maybeSingle();

      if (data) {
        setHeaderLinks(data.header_links || []);
        setFooterLinks(data.footer_links || []);
        setSiteDescription(data.site_description || "");
      }
      setIsLoading(false);
    }
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const res = await updateNavigationLinks({ 
        header_links: headerLinks, 
        footer_links: footerLinks,
        site_description: siteDescription
      });
      if (res.error) {
        alert("Failed to save settings: " + res.error);
      } else {
        alert("Navigation saved successfully!");
        router.refresh();
      }
    } catch (err: any) {
      alert("An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Header Helpers ---
  const addHeaderLink = () => {
    setHeaderLinks([...headerLinks, { label: "New Link", href: "/" }]);
  };
  const updateHeaderLink = (idx: number, field: keyof NavLink, value: any) => {
    const newLinks = [...headerLinks];
    newLinks[idx] = { ...newLinks[idx], [field]: value };
    setHeaderLinks(newLinks);
  };
  const removeHeaderLink = (idx: number) => {
    setHeaderLinks(headerLinks.filter((_, i) => i !== idx));
  };

  // --- Footer Helpers ---
  const addFooterColumn = () => {
    setFooterLinks([...footerLinks, { title: "New Column", links: [] }]);
  };
  const updateFooterColumnTitle = (idx: number, title: string) => {
    const newCols = [...footerLinks];
    newCols[idx].title = title;
    setFooterLinks(newCols);
  };
  const removeFooterColumn = (idx: number) => {
    setFooterLinks(footerLinks.filter((_, i) => i !== idx));
  };

  const addFooterLink = (colIdx: number) => {
    const newCols = [...footerLinks];
    newCols[colIdx].links.push({ label: "New Link", href: "/" });
    setFooterLinks(newCols);
  };
  const updateFooterLink = (colIdx: number, linkIdx: number, field: keyof NavLink, value: any) => {
    const newCols = [...footerLinks];
    newCols[colIdx].links[linkIdx] = { ...newCols[colIdx].links[linkIdx], [field]: value };
    setFooterLinks(newCols);
  };
  const removeFooterLink = (colIdx: number, linkIdx: number) => {
    const newCols = [...footerLinks];
    newCols[colIdx].links = newCols[colIdx].links.filter((_, i) => i !== linkIdx);
    setFooterLinks(newCols);
  };

  const moveHeaderLink = (idx: number, dir: -1 | 1) => {
    if (idx + dir < 0 || idx + dir >= headerLinks.length) return;
    const newLinks = [...headerLinks];
    const temp = newLinks[idx];
    newLinks[idx] = newLinks[idx + dir];
    newLinks[idx + dir] = temp;
    setHeaderLinks(newLinks);
  };

  const moveFooterColumn = (idx: number, dir: -1 | 1) => {
    if (idx + dir < 0 || idx + dir >= footerLinks.length) return;
    const newCols = [...footerLinks];
    const temp = newCols[idx];
    newCols[idx] = newCols[idx + dir];
    newCols[idx + dir] = temp;
    setFooterLinks(newCols);
  };

  const moveFooterLink = (colIdx: number, linkIdx: number, dir: -1 | 1) => {
    const newCols = [...footerLinks];
    const links = newCols[colIdx].links;
    if (linkIdx + dir < 0 || linkIdx + dir >= links.length) return;
    const temp = links[linkIdx];
    links[linkIdx] = links[linkIdx + dir];
    links[linkIdx + dir] = temp;
    setFooterLinks(newCols);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" type="button" onClick={() => router.push("/super-admin/cms")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Navigation Links</h2>
            <p className="text-sm text-slate-500 mt-1">Manage header navbar and footer column links.</p>
          </div>
        </div>
        <Button type="submit" disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Header Links */}
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <div>
              <CardTitle>Header Links</CardTitle>
              <CardDescription>Links shown in the top navigation bar.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addHeaderLink}>
              <Plus className="h-4 w-4 mr-2" /> Add Link
            </Button>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {headerLinks.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No header links configured.</p>
            ) : (
              headerLinks.map((link, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex flex-col -space-y-1">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-slate-900 disabled:opacity-30" disabled={idx === 0} onClick={() => moveHeaderLink(idx, -1)}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-slate-900 disabled:opacity-30" disabled={idx === headerLinks.length - 1} onClick={() => moveHeaderLink(idx, 1)}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <Input 
                      placeholder="Label (e.g. Pricing)" 
                      value={link.label}
                      onChange={(e) => updateHeaderLink(idx, "label", e.target.value)}
                      required
                    />
                    <Input 
                      placeholder="URL (e.g. /#pricing)" 
                      value={link.href}
                      onChange={(e) => updateHeaderLink(idx, "href", e.target.value)}
                      required
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50" onClick={() => removeHeaderLink(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Footer Links */}
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <div>
              <CardTitle>Footer Settings</CardTitle>
              <CardDescription>Manage your footer description and columns.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addFooterColumn}>
              <Plus className="h-4 w-4 mr-2" /> Add Column
            </Button>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            <div className="space-y-3">
              <Label htmlFor="siteDescription">Footer Description</Label>
              <Textarea
                id="siteDescription"
                placeholder="Brief description that appears below the logo in the footer..."
                value={siteDescription}
                onChange={(e) => setSiteDescription(e.target.value)}
                className="h-24 resize-none"
              />
            </div>
            
            <div className="pt-4 border-t space-y-4">
              <h3 className="text-sm font-medium mb-4">Footer Columns</h3>
              {footerLinks.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No footer columns configured.</p>
              ) : (
              footerLinks.map((col, colIdx) => (
                <div key={colIdx} className="space-y-4 border rounded-xl p-4 bg-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col -space-y-1">
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-slate-900 disabled:opacity-30" disabled={colIdx === 0} onClick={() => moveFooterColumn(colIdx, -1)}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-slate-900 disabled:opacity-30" disabled={colIdx === footerLinks.length - 1} onClick={() => moveFooterColumn(colIdx, 1)}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input 
                      value={col.title}
                      onChange={(e) => updateFooterColumnTitle(colIdx, e.target.value)}
                      className="font-semibold text-lg border-none bg-slate-50 px-3"
                      placeholder="Column Title (e.g. Company)"
                      required
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => addFooterLink(colIdx)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Link
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50" onClick={() => removeFooterColumn(colIdx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2 pl-4 border-l-2 border-slate-100 ml-2">
                    {col.links.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No links in this column.</p>
                    ) : (
                      col.links.map((link, linkIdx) => (
                        <div key={linkIdx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-md border border-slate-100">
                          <div className="flex flex-col -space-y-1">
                            <Button type="button" variant="ghost" size="icon" className="h-4 w-4 text-slate-400 hover:text-slate-900 disabled:opacity-30" disabled={linkIdx === 0} onClick={() => moveFooterLink(colIdx, linkIdx, -1)}>
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-4 w-4 text-slate-400 hover:text-slate-900 disabled:opacity-30" disabled={linkIdx === col.links.length - 1} onClick={() => moveFooterLink(colIdx, linkIdx, 1)}>
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <Input 
                            placeholder="Label" 
                            value={link.label}
                            onChange={(e) => updateFooterLink(colIdx, linkIdx, "label", e.target.value)}
                            className="h-8 text-sm"
                            required
                          />
                          <Input 
                            placeholder="URL" 
                            value={link.href}
                            onChange={(e) => updateFooterLink(colIdx, linkIdx, "href", e.target.value)}
                            className="h-8 text-sm font-mono"
                            required
                          />
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-500" onClick={() => removeFooterLink(colIdx, linkIdx)}>
                            <XIcon />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
  );
}
