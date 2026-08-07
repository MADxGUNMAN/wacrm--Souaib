"use client";

// ============================================================
// Super Admin → CMS → Docs & Resources
//
// Edits everything on the public /docs page: the page copy, the
// categories, and the links inside them.
//
// SAVE MODEL: one action, one API call.
//   * Text edits stage locally and reveal a Save button on that row.
//   * Add, delete, reorder and show/hide persist immediately.
//
// Chosen over a single "save everything" button because that needs a
// diffing engine across three tables, and a bug there silently writes
// the wrong rows. Here every button maps to exactly one request, so a
// failure is attributable and nothing half-saves.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCS_ICON_NAMES,
  resolveDocsIcon,
} from "@/components/docs/docs-icons";
import type {
  DocsCategory,
  DocsPageSettings,
  DocsResource,
} from "@/types/super-admin";

const API = "/api/super-admin/cms/docs";

export default function CmsDocsPage() {
  const [settings, setSettings] = useState<DocsPageSettings | null>(null);
  const [categories, setCategories] = useState<DocsCategory[]>([]);
  const [resources, setResources] = useState<DocsResource[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("Could not load the docs content");
      const data = await res.json();
      setSettings(data.settings);
      setCategories(data.categories ?? []);
      setResources(data.resources ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (key: string) => {
    setSavedFlash(key);
    setTimeout(() => setSavedFlash((k) => (k === key ? null : k)), 2000);
  };

  /** Shared request helper: sets the busy key and surfaces server errors. */
  const send = useCallback(
    async (
      key: string,
      url: string,
      init: RequestInit,
    ): Promise<Record<string, unknown> | null> => {
      setBusy(key);
      setError(null);
      try {
        const res = await fetch(url, {
          ...init,
          headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(payload?.error ?? "That change could not be saved");
          return null;
        }
        return payload;
      } catch {
        setError("Could not reach the server. Check your connection.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  // ---- Page copy ----
  const patchSettings = (patch: Partial<DocsPageSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  const saveSettings = async () => {
    if (!settings) return;
    const ok = await send("settings", API, {
      method: "PUT",
      body: JSON.stringify({
        eyebrow: settings.eyebrow,
        heading: settings.heading,
        subheading: settings.subheading,
        show_search: settings.show_search,
        search_placeholder: settings.search_placeholder,
        show_legal_section: settings.show_legal_section,
        legal_heading: settings.legal_heading,
        legal_subheading: settings.legal_subheading,
        show_support_section: settings.show_support_section,
        support_heading: settings.support_heading,
        support_body: settings.support_body,
        support_cta_text: settings.support_cta_text,
        support_cta_link: settings.support_cta_link,
      }),
    });
    if (ok) flash("settings");
  };

  // ---- Categories ----
  const patchCategory = (id: string, patch: Partial<DocsCategory>) =>
    setCategories((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const saveCategory = async (category: DocsCategory) => {
    const ok = await send(`cat-${category.id}`, `${API}/categories`, {
      method: "PUT",
      body: JSON.stringify({
        id: category.id,
        title: category.title,
        description: category.description,
        icon_name: category.icon_name,
        position: category.position,
        is_visible: category.is_visible,
      }),
    });
    if (ok) flash(`cat-${category.id}`);
  };

  const addCategory = async () => {
    const payload = await send("add-cat", `${API}/categories`, {
      method: "POST",
      body: JSON.stringify({
        title: "New section",
        description: "",
        icon_name: "BookOpen",
      }),
    });
    if (payload?.category) {
      setCategories((list) => [...list, payload.category as DocsCategory]);
    }
  };

  const deleteCategory = async (category: DocsCategory) => {
    const count = resources.filter((r) => r.category_id === category.id).length;
    const warning =
      count > 0
        ? `Delete “${category.title}” and its ${count} link${count === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete “${category.title}”?`;
    if (!window.confirm(warning)) return;

    const ok = await send(
      `del-cat-${category.id}`,
      `${API}/categories?id=${encodeURIComponent(category.id)}`,
      { method: "DELETE" },
    );
    if (ok) {
      setCategories((list) => list.filter((c) => c.id !== category.id));
      // Mirror the FK cascade locally so the UI matches the database
      // without a full reload.
      setResources((list) => list.filter((r) => r.category_id !== category.id));
    }
  };

  /**
   * Swap two categories' `position` values.
   *
   * Both rows are written because position is absolute, not a linked
   * list — moving one without the other would leave a duplicate and the
   * order would depend on how Postgres broke the tie.
   */
  const moveCategory = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const a = categories[index];
    const b = categories[target];

    const next = [...categories];
    next[index] = { ...b, position: a.position };
    next[target] = { ...a, position: b.position };
    setCategories(next);

    await send(`move-cat-${a.id}`, `${API}/categories`, {
      method: "PUT",
      body: JSON.stringify({ id: a.id, position: b.position }),
    });
    await send(`move-cat-${b.id}`, `${API}/categories`, {
      method: "PUT",
      body: JSON.stringify({ id: b.id, position: a.position }),
    });
    await load();
  };

  // ---- Resources ----
  const patchResource = (id: string, patch: Partial<DocsResource>) =>
    setResources((list) =>
      list.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );

  const saveResource = async (resource: DocsResource) => {
    const payload = await send(`res-${resource.id}`, `${API}/resources`, {
      method: "PUT",
      body: JSON.stringify({
        id: resource.id,
        title: resource.title,
        description: resource.description,
        href: resource.href,
        icon_name: resource.icon_name,
        badge_label: resource.badge_label,
        position: resource.position,
        is_visible: resource.is_visible,
      }),
    });
    // The server derives is_external from the href, so take its answer
    // rather than keeping a stale local value.
    if (payload?.resource) {
      patchResource(resource.id, payload.resource as DocsResource);
      flash(`res-${resource.id}`);
    }
  };

  const addResource = async (categoryId: string) => {
    const payload = await send(`add-res-${categoryId}`, `${API}/resources`, {
      method: "POST",
      body: JSON.stringify({
        category_id: categoryId,
        title: "New link",
        description: "",
        href: "/",
        icon_name: "FileText",
      }),
    });
    if (payload?.resource) {
      setResources((list) => [...list, payload.resource as DocsResource]);
    }
  };

  const deleteResource = async (resource: DocsResource) => {
    if (!window.confirm(`Delete “${resource.title}”?`)) return;
    const ok = await send(
      `del-res-${resource.id}`,
      `${API}/resources?id=${encodeURIComponent(resource.id)}`,
      { method: "DELETE" },
    );
    if (ok) setResources((list) => list.filter((r) => r.id !== resource.id));
  };

  const moveResource = async (
    categoryId: string,
    index: number,
    direction: -1 | 1,
  ) => {
    const group = resources
      .filter((r) => r.category_id === categoryId)
      .sort((x, y) => x.position - y.position);

    const target = index + direction;
    if (target < 0 || target >= group.length) return;

    const a = group[index];
    const b = group[target];

    patchResource(a.id, { position: b.position });
    patchResource(b.id, { position: a.position });

    await send(`move-res-${a.id}`, `${API}/resources`, {
      method: "PUT",
      body: JSON.stringify({ id: a.id, position: b.position }),
    });
    await send(`move-res-${b.id}`, `${API}/resources`, {
      method: "PUT",
      body: JSON.stringify({ id: b.id, position: a.position }),
    });
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading docs content…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/super-admin/cms"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link
              href="/super-admin/cms"
              className="transition-colors hover:text-primary"
            >
              CMS &amp; Landing
            </Link>
            <span>/</span>
            <span className="font-medium text-slate-900">Docs &amp; Resources</span>
          </div>
        </div>

        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-primary"
        >
          View live page
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Docs &amp; Resources</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything on the public <code className="text-xs">/docs</code> page.
          Legal documents are pulled in automatically from Legal Pages, so edit
          those there.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      {/* ---- Page copy ---- */}
      {settings ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Page copy</h2>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            The heading, intro and the wording of each block.
          </p>

          <div className="space-y-4">
            <Field label="Eyebrow (small pill above the heading)">
              <Input
                value={settings.eyebrow ?? ""}
                onChange={(e) => patchSettings({ eyebrow: e.target.value })}
                placeholder="Resource centre"
              />
            </Field>

            <Field label="Heading" hint="Required">
              <Input
                value={settings.heading}
                onChange={(e) => patchSettings({ heading: e.target.value })}
              />
            </Field>

            <Field label="Intro paragraph">
              <Textarea
                rows={2}
                value={settings.subheading ?? ""}
                onChange={(e) => patchSettings({ subheading: e.target.value })}
              />
            </Field>

            <ToggleRow
              label="Show the search box"
              checked={settings.show_search}
              onChange={(v) => patchSettings({ show_search: v })}
            />
            {settings.show_search ? (
              <Field label="Search placeholder">
                <Input
                  value={settings.search_placeholder ?? ""}
                  onChange={(e) =>
                    patchSettings({ search_placeholder: e.target.value })
                  }
                />
              </Field>
            ) : null}

            <hr className="border-slate-100" />

            <ToggleRow
              label="Show the policies section"
              hint="Lists your published Legal Pages"
              checked={settings.show_legal_section}
              onChange={(v) => patchSettings({ show_legal_section: v })}
            />
            {settings.show_legal_section ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Policies heading">
                  <Input
                    value={settings.legal_heading ?? ""}
                    onChange={(e) =>
                      patchSettings({ legal_heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Policies subheading">
                  <Input
                    value={settings.legal_subheading ?? ""}
                    onChange={(e) =>
                      patchSettings({ legal_subheading: e.target.value })
                    }
                  />
                </Field>
              </div>
            ) : null}

            <hr className="border-slate-100" />

            <ToggleRow
              label="Show the support block"
              checked={settings.show_support_section}
              onChange={(v) => patchSettings({ show_support_section: v })}
            />
            {settings.show_support_section ? (
              <>
                <Field label="Support heading">
                  <Input
                    value={settings.support_heading ?? ""}
                    onChange={(e) =>
                      patchSettings({ support_heading: e.target.value })
                    }
                  />
                </Field>
                <Field label="Support text">
                  <Textarea
                    rows={2}
                    value={settings.support_body ?? ""}
                    onChange={(e) =>
                      patchSettings({ support_body: e.target.value })
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Button text">
                    <Input
                      value={settings.support_cta_text ?? ""}
                      onChange={(e) =>
                        patchSettings({ support_cta_text: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Button link">
                    <Input
                      value={settings.support_cta_link ?? ""}
                      onChange={(e) =>
                        patchSettings({ support_cta_link: e.target.value })
                      }
                      placeholder="/contact"
                    />
                  </Field>
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => void saveSettings()} disabled={busy === "settings"}>
              {busy === "settings" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save page copy
            </Button>
            {savedFlash === "settings" ? (
              <span className="text-sm font-medium text-emerald-600">Saved</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---- Categories ---- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Sections &amp; links
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Grouped cards on the page. Hidden sections, and sections with no
              visible links, are left off the page entirely.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void addCategory()}
            disabled={busy === "add-cat"}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add section
          </Button>
        </div>

        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No sections yet. Add one to start building the page.
          </p>
        ) : null}

        {categories.map((category, index) => {
          const CategoryIcon = resolveDocsIcon(category.icon_name);
          const group = resources
            .filter((r) => r.category_id === category.id)
            .sort((a, b) => a.position - b.position);

          return (
            <div
              key={category.id}
              className={`rounded-xl border bg-white p-5 shadow-sm transition-opacity ${
                category.is_visible
                  ? "border-slate-200"
                  : "border-slate-200 opacity-60"
              }`}
            >
              {/* Category header */}
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CategoryIcon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <Input
                      value={category.title}
                      onChange={(e) =>
                        patchCategory(category.id, { title: e.target.value })
                      }
                      placeholder="Section title"
                    />
                    <IconSelect
                      value={category.icon_name}
                      onChange={(v) =>
                        patchCategory(category.id, { icon_name: v })
                      }
                    />
                  </div>
                  <Input
                    value={category.description ?? ""}
                    onChange={(e) =>
                      patchCategory(category.id, { description: e.target.value })
                    }
                    placeholder="Short description (optional)"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label="Move up"
                    disabled={index === 0}
                    onClick={() => void moveCategory(index, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={index === categories.length - 1}
                    onClick={() => void moveCategory(index, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={category.is_visible ? "Hide section" : "Show section"}
                    onClick={() => {
                      const next = !category.is_visible;
                      patchCategory(category.id, { is_visible: next });
                      void send(`vis-cat-${category.id}`, `${API}/categories`, {
                        method: "PUT",
                        body: JSON.stringify({
                          id: category.id,
                          is_visible: next,
                        }),
                      });
                    }}
                  >
                    {category.is_visible ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </IconButton>
                  <IconButton
                    label="Delete section"
                    onClick={() => void deleteCategory(category)}
                    danger
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 pl-13">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void saveCategory(category)}
                  disabled={busy === `cat-${category.id}`}
                >
                  {busy === `cat-${category.id}` ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-3.5 w-3.5" />
                  )}
                  Save section
                </Button>
                {savedFlash === `cat-${category.id}` ? (
                  <span className="text-xs font-medium text-emerald-600">
                    Saved
                  </span>
                ) : null}
              </div>

              {/* Resources */}
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                {group.map((resource, rIndex) => (
                  <ResourceRow
                    key={resource.id}
                    resource={resource}
                    isFirst={rIndex === 0}
                    isLast={rIndex === group.length - 1}
                    busyKey={busy}
                    savedFlash={savedFlash}
                    onPatch={(patch) => patchResource(resource.id, patch)}
                    onSave={() => void saveResource(resource)}
                    onDelete={() => void deleteResource(resource)}
                    onMove={(d) => void moveResource(category.id, rIndex, d)}
                    onToggle={() => {
                      const next = !resource.is_visible;
                      patchResource(resource.id, { is_visible: next });
                      void send(`vis-res-${resource.id}`, `${API}/resources`, {
                        method: "PUT",
                        body: JSON.stringify({
                          id: resource.id,
                          is_visible: next,
                        }),
                      });
                    }}
                  />
                ))}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void addResource(category.id)}
                  disabled={busy === `add-res-${category.id}`}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add link
                </Button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ------------------------------------------------------------
// Row + field helpers
// ------------------------------------------------------------

function ResourceRow({
  resource,
  isFirst,
  isLast,
  busyKey,
  savedFlash,
  onPatch,
  onSave,
  onDelete,
  onMove,
  onToggle,
}: {
  resource: DocsResource;
  isFirst: boolean;
  isLast: boolean;
  busyKey: string | null;
  savedFlash: string | null;
  onPatch: (patch: Partial<DocsResource>) => void;
  onSave: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggle: () => void;
}) {
  const ResourceIcon = resolveDocsIcon(resource.icon_name);

  return (
    <div
      className={`rounded-lg border bg-slate-50/60 p-3 ${
        resource.is_visible ? "border-slate-200" : "border-slate-200 opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200">
          <ResourceIcon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_150px_130px]">
            <Input
              value={resource.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              placeholder="Link title"
              className="bg-white"
            />
            <IconSelect
              value={resource.icon_name ?? ""}
              onChange={(v) => onPatch({ icon_name: v })}
            />
            <Input
              value={resource.badge_label ?? ""}
              onChange={(e) => onPatch({ badge_label: e.target.value })}
              placeholder="Badge (optional)"
              className="bg-white"
            />
          </div>
          <Input
            value={resource.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="One-line description"
            className="bg-white"
          />
          <div className="flex items-center gap-2">
            <Input
              value={resource.href}
              onChange={(e) => onPatch({ href: e.target.value })}
              placeholder="/settings?tab=billing  or  https://example.com"
              className="bg-white font-mono text-xs"
            />
            {/* Derived server-side from the href, shown so the operator can
                see how the link will behave before saving. */}
            {resource.is_external ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">
                <ExternalLink className="h-2.5 w-2.5" />
                External
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>
            <ChevronUp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Move down" disabled={isLast} onClick={() => onMove(1)}>
            <ChevronDown className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={resource.is_visible ? "Hide link" : "Show link"}
            onClick={onToggle}
          >
            {resource.is_visible ? (
              <Eye className="h-4 w-4 text-primary" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton label="Delete link" onClick={onDelete} danger>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 pl-11">
        <Button
          size="sm"
          variant="ghost"
          onClick={onSave}
          disabled={busyKey === `res-${resource.id}`}
        >
          {busyKey === `res-${resource.id}` ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-2 h-3.5 w-3.5" />
          )}
          Save link
        </Button>
        {savedFlash === `res-${resource.id}` ? (
          <span className="text-xs font-medium text-emerald-600">Saved</span>
        ) : null}
      </div>
    </div>
  );
}

function IconSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full bg-white text-slate-900">
        <SelectValue placeholder="Icon" />
      </SelectTrigger>
      <SelectContent className="max-h-72 border-slate-200 bg-white text-slate-900">
        {DOCS_ICON_NAMES.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        {hint ? <span className="text-[10px] text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "hover:bg-red-50 hover:text-red-600"
          : "hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
