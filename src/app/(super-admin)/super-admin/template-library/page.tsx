"use client";

// ============================================================
// Super admin — manage the starter template library.
//
// Two things to manage: the industry CATEGORIES and the TEMPLATES inside
// them. Both live on one page because you almost always add a category and
// then immediately add templates to it.
//
// ─── Why templates are validated on save ──────────────────────────
//
// Everything here is content a CUSTOMER will submit to Meta later. If a
// template ships with a variable that has no example value, or a footer
// containing {{1}}, the customer gets the rejection and has no idea the
// library handed them a broken start. The API therefore runs the same
// validator the real submit route runs, and its message is shown verbatim.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LibraryBig,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  StarterCategory,
  StarterTemplate,
} from "@/lib/templates/starter-library";

type Tab = "templates" | "categories";

const META_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
const HEADER_TYPES = ["none", "text", "image", "video", "document"] as const;

/** A blank template form. Slug is derived from the title as you type. */
function emptyTemplate(categoryId: string): Partial<StarterTemplate> {
  return {
    category_id: categoryId,
    slug: "",
    title: "",
    description: "",
    emoji: "",
    meta_category: "UTILITY",
    template_type: "default",
    language: "en_US",
    header_type: null,
    header_content: "",
    body_text: "",
    footer_text: "",
    buttons: null,
    sample_values: { body: [] },
    tags: [],
    position: 0,
    is_active: true,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Count distinct {{n}} in a body, so the sample inputs match. */
function countVars(body: string): number {
  const seen = new Set<string>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) seen.add(m[1]);
  return seen.size;
}

export default function SuperAdminTemplateLibraryPage() {
  const [tab, setTab] = useState<Tab>("templates");
  const [categories, setCategories] = useState<StarterCategory[]>([]);
  const [templates, setTemplates] = useState<StarterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeCategory, setActiveCategory] = useState<string>("");
  const [editingTemplate, setEditingTemplate] =
    useState<Partial<StarterTemplate> | null>(null);
  const [editingCategory, setEditingCategory] =
    useState<Partial<StarterCategory> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, tplRes] = await Promise.all([
        fetch("/api/super-admin/template-library/categories"),
        fetch("/api/super-admin/template-library/templates"),
      ]);
      const catData = await catRes.json().catch(() => ({}));
      const tplData = await tplRes.json().catch(() => ({}));

      if (!catRes.ok) throw new Error(catData?.error || "Could not load categories");
      if (!tplRes.ok) throw new Error(tplData?.error || "Could not load templates");

      setCategories(catData.categories ?? []);
      setTemplates(tplData.templates ?? []);
      setActiveCategory((prev) => prev || catData.categories?.[0]?.id || "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTemplates = useMemo(
    () => templates.filter((t) => t.category_id === activeCategory),
    [templates, activeCategory],
  );

  // ── Template actions ───────────────────────────────────────
  async function saveTemplate() {
    if (!editingTemplate) return;
    setSaving(true);
    try {
      const isNew = !editingTemplate.id;
      const res = await fetch("/api/super-admin/template-library/templates", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingTemplate),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      toast.success(isNew ? "Template added" : "Template updated");
      setEditingTemplate(null);
      await load();
    } catch (err) {
      // The validator's message names the exact Meta rule that was broken,
      // so it is surfaced as-is rather than replaced.
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(t: StarterTemplate) {
    if (!window.confirm(`Delete "${t.title}" from the library?`)) return;
    try {
      const res = await fetch(
        `/api/super-admin/template-library/templates?id=${t.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Delete failed");
      }
      toast.success("Template deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // ── Category actions ───────────────────────────────────────
  async function saveCategory() {
    if (!editingCategory) return;
    setSaving(true);
    try {
      const isNew = !editingCategory.id;
      const res = await fetch("/api/super-admin/template-library/categories", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCategory),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      toast.success(isNew ? "Category added" : "Category updated");
      setEditingCategory(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(c: StarterCategory) {
    // Stating the count matters: the delete cascades, and "3 templates" is
    // the difference between a tidy-up and losing work.
    const count = c.template_count ?? 0;
    if (
      !window.confirm(
        `Delete the "${c.name}" category?\n\n${
          count > 0
            ? `Its ${count} template${count === 1 ? "" : "s"} will be deleted too.`
            : "It has no templates."
        }\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/super-admin/template-library/categories?id=${c.id}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      toast.success(
        data.deleted_templates
          ? `Category and ${data.deleted_templates} template(s) deleted`
          : "Category deleted",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Template Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Starter templates every account can browse and copy. These are ours —
            separate from Meta&apos;s own pre-approved library.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "templates" ? (
            <Button
              onClick={() => setEditingTemplate(emptyTemplate(activeCategory))}
              disabled={!activeCategory}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New template
            </Button>
          ) : (
            <Button
              onClick={() =>
                setEditingCategory({
                  slug: "",
                  name: "",
                  emoji: "📄",
                  description: "",
                  position: (categories.at(-1)?.position ?? 0) + 10,
                  is_active: true,
                })
              }
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New category
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      ) : null}

      {/* ---- Tabs ---- */}
      <div className="flex gap-2 border-b border-border">
        {(
          [
            ["templates", `Templates (${templates.length})`],
            ["categories", `Categories (${categories.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "border-[#25D366] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════ TEMPLATES ═══════════════ */}
      {tab === "templates" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  c.id === activeCategory
                    ? "border-[#25D366] bg-[#25D366]/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                  !c.is_active && "opacity-50",
                )}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.name}
                <span className="text-[10px] opacity-70">
                  {c.template_count ?? 0}
                </span>
              </button>
            ))}
          </div>

          {visibleTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <LibraryBig className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-foreground">
                No templates in this category yet.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleTemplates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4",
                    !t.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span aria-hidden>{t.emoji ?? "📄"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold break-words text-foreground">
                        {t.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.slug} · {t.meta_category} · {t.language}
                        {countVars(t.body_text) > 0
                          ? ` · ${countVars(t.body_text)} var`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingTemplate(t)}
                        aria-label={`Edit ${t.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => deleteTemplate(t)}
                        aria-label={`Delete ${t.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">
                    {t.body_text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ═══════════════ CATEGORIES ═══════════════ */
        <div className="space-y-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card p-3",
                !c.is_active && "opacity-60",
              )}
            >
              <span className="text-lg" aria-hidden>
                {c.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.slug} · position {c.position} ·{" "}
                  {c.template_count ?? 0} template
                  {(c.template_count ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  void fetch("/api/super-admin/template-library/categories", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
                  }).then(load)
                }
                aria-label={c.is_active ? "Hide category" : "Show category"}
                title={c.is_active ? "Visible to accounts" : "Hidden from accounts"}
              >
                {c.is_active ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditingCategory(c)}
                aria-label={`Edit ${c.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600"
                onClick={() => deleteCategory(c)}
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════ CATEGORY EDITOR ═══════════════ */}
      {editingCategory ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingCategory.id ? "Edit category" : "New category"}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingCategory(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Emoji
                </label>
                <Input
                  value={editingCategory.emoji ?? ""}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, emoji: e.target.value })
                  }
                  placeholder="🛍️"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <Input
                  value={editingCategory.name ?? ""}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      name: e.target.value,
                      // Only auto-fill the slug for a NEW category: changing an
                      // existing slug would break links already shared.
                      ...(editingCategory.id
                        ? {}
                        : { slug: slugify(e.target.value) }),
                    })
                  }
                  placeholder="E-commerce & D2C Brands"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Slug
              </label>
              <Input
                value={editingCategory.slug ?? ""}
                onChange={(e) =>
                  setEditingCategory({
                    ...editingCategory,
                    slug: slugify(e.target.value),
                  })
                }
                placeholder="ecommerce"
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers and hyphens. Used in links, so avoid
                changing it once shared.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Textarea
                rows={2}
                value={editingCategory.description ?? ""}
                onChange={(e) =>
                  setEditingCategory({
                    ...editingCategory,
                    description: e.target.value,
                  })
                }
                placeholder="Order updates, shipping and promotions for online stores."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Position
              </label>
              <Input
                type="number"
                value={editingCategory.position ?? 0}
                onChange={(e) =>
                  setEditingCategory({
                    ...editingCategory,
                    position: Number(e.target.value) || 0,
                  })
                }
                className="w-28"
              />
              <p className="text-[11px] text-muted-foreground">
                Lower numbers appear first. Existing categories step by 10, so
                use 45 to slot between 40 and 50.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => setEditingCategory(null)}>
                Cancel
              </Button>
              <Button onClick={saveCategory} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══════════════ TEMPLATE EDITOR ═══════════════ */}
      {editingTemplate ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto w-full max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingTemplate.id ? "Edit template" : "New template"}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingTemplate(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[70px_1fr]">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Emoji
                </label>
                <Input
                  value={editingTemplate.emoji ?? ""}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, emoji: e.target.value })
                  }
                  placeholder="✅"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Title
                </label>
                <Input
                  value={editingTemplate.title ?? ""}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      title: e.target.value,
                      ...(editingTemplate.id
                        ? {}
                        : { slug: slugify(e.target.value) }),
                    })
                  }
                  placeholder="Order Confirmation"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Slug
                </label>
                <Input
                  value={editingTemplate.slug ?? ""}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      slug: slugify(e.target.value),
                    })
                  }
                  placeholder="ec-order-confirmation"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Category
                </label>
                <Select
                  value={editingTemplate.category_id ?? ""}
                  onValueChange={(v) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      category_id: v ?? "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Input
                value={editingTemplate.description ?? ""}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    description: e.target.value,
                  })
                }
                placeholder="Instant order confirmation with tracking details."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Meta category
                </label>
                <Select
                  value={editingTemplate.meta_category ?? "UTILITY"}
                  onValueChange={(v) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      meta_category: (v ??
                        "UTILITY") as StarterTemplate["meta_category"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {META_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Language
                </label>
                <Input
                  value={editingTemplate.language ?? "en_US"}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      language: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Header
                </label>
                <Select
                  value={editingTemplate.header_type ?? "none"}
                  onValueChange={(v) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      header_type:
                        !v || v === "none"
                          ? null
                          : (v as StarterTemplate["header_type"]),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEADER_TYPES.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editingTemplate.header_type === "text" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Header text
                </label>
                <Input
                  value={editingTemplate.header_content ?? ""}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      header_content: e.target.value,
                    })
                  }
                  maxLength={60}
                  placeholder="Order Confirmed"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Body
              </label>
              <Textarea
                rows={6}
                value={editingTemplate.body_text ?? ""}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    body_text: e.target.value,
                  })
                }
                placeholder={"Hi {{1}}, your order {{2}} is confirmed."}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Use {"{{1}}"}, {"{{2}}"} — contiguous from 1, or Meta rejects it.
              </p>
            </div>

            {/* Sample values, one per variable. Meta requires an example for
                every variable, and vague ones are a common rejection. */}
            {countVars(editingTemplate.body_text ?? "") > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">
                  Example values ({countVars(editingTemplate.body_text ?? "")}{" "}
                  required)
                </p>
                {Array.from(
                  { length: countVars(editingTemplate.body_text ?? "") },
                  (_, i) => (
                    <Input
                      key={i}
                      value={editingTemplate.sample_values?.body?.[i] ?? ""}
                      onChange={(e) => {
                        const body = [
                          ...(editingTemplate.sample_values?.body ?? []),
                        ];
                        body[i] = e.target.value;
                        setEditingTemplate({
                          ...editingTemplate,
                          sample_values: {
                            ...(editingTemplate.sample_values ?? {}),
                            body,
                          },
                        });
                      }}
                      placeholder={`Realistic example for {{${i + 1}}}`}
                    />
                  ),
                )}
                <p className="text-[11px] text-muted-foreground">
                  Write what a real customer would see — &ldquo;Rahul&rdquo;, not
                  &ldquo;test&rdquo;.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Footer
              </label>
              <Input
                value={editingTemplate.footer_text ?? ""}
                onChange={(e) =>
                  setEditingTemplate({
                    ...editingTemplate,
                    footer_text: e.target.value,
                  })
                }
                maxLength={60}
                placeholder="Questions? Just reply to this message"
              />
              <p className="text-[11px] text-muted-foreground">
                No variables allowed here — Meta rejects a footer containing{" "}
                {"{{n}}"}.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Buttons (JSON)
              </label>
              <Textarea
                rows={4}
                value={
                  editingTemplate.buttons
                    ? JSON.stringify(editingTemplate.buttons, null, 2)
                    : ""
                }
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) {
                    setEditingTemplate({ ...editingTemplate, buttons: null });
                    return;
                  }
                  try {
                    setEditingTemplate({
                      ...editingTemplate,
                      buttons: JSON.parse(raw),
                    });
                  } catch {
                    // Keep the keystroke; invalid JSON is normal mid-typing and
                    // the save-time validator is the real gate.
                  }
                }}
                className="font-mono text-xs"
                placeholder={
                  '[{"type":"QUICK_REPLY","text":"Track Order"}]'
                }
              />
              <p className="text-[11px] text-muted-foreground">
                QUICK_REPLY, URL (needs <code>url</code>), PHONE_NUMBER (needs{" "}
                <code>phone_number</code>) or COPY_CODE (needs{" "}
                <code>example</code>).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Position
                </label>
                <Input
                  type="number"
                  value={editingTemplate.position ?? 0}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      position: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={editingTemplate.is_active !== false}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        is_active: e.target.checked,
                      })
                    }
                    className="rounded border-border"
                  />
                  Visible to accounts
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ChevronDown className="h-3 w-3" />
                Saved templates are checked against Meta&apos;s rules first.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancel
                </Button>
                <Button onClick={saveTemplate} disabled={saving} className="gap-2">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
