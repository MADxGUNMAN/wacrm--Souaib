"use client";

// ============================================================
// Browse Meta's Template Library and create from it.
//
// ─── Why this exists next to the wizard, not inside it ────────
//
// Picking a library template is a different decision from writing one, not
// an extra step. The wording is FIXED and cannot be edited; all you supply
// is your own name, the language, and your button details. In exchange the
// category is already settled by Meta, so a delivery update stays Utility
// instead of being reclassified as Marketing by Meta's classifier — which
// changes what it costs to send.
//
// Everything the operator can and cannot change is stated on screen, since
// "why can't I edit this text?" is the obvious first question.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  LibraryBig,
  Loader2,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WhatsAppPreview } from "@/components/templates/whatsapp-preview";
import { positionalValues } from "@/lib/whatsapp/template-preview-text";
import type {
  TemplateComponent,
  TemplateDefinition,
} from "@/lib/whatsapp/template-definition";

interface LibraryButton {
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
}

interface LibraryTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  topic?: string;
  usecase?: string;
  industry?: string[];
  body?: string;
  body_params?: string[];
  body_param_types?: string[];
  header?: string;
  footer?: string;
  buttons?: LibraryButton[];
}

/** Meta's filter enums, as documented. */
const TOPICS = [
  "ACCOUNT_UPDATE",
  "CUSTOMER_FEEDBACK",
  "ORDER_MANAGEMENT",
  "PAYMENTS",
] as const;

const INDUSTRIES = ["E_COMMERCE", "FINANCIAL_SERVICES"] as const;

function humanise(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Render a library template through the SAME preview component the wizard
 * uses, by projecting it onto the canonical definition shape.
 *
 * Worth the small translation: a second, bespoke preview for library
 * templates would be a second thing that can disagree with what Meta
 * actually sends.
 */
function definitionFromLibrary(t: LibraryTemplate): TemplateDefinition {
  const components: TemplateComponent[] = [];
  if (t.header?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: t.header });
  }
  components.push({ type: "BODY", text: t.body ?? "" });
  if (t.footer?.trim()) {
    components.push({ type: "FOOTER", text: t.footer });
  }
  if ((t.buttons ?? []).length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: (t.buttons ?? []).map((b) => {
        if (b.type === "URL") {
          return {
            type: "URL" as const,
            text: b.text ?? "Open",
            url: b.url ?? "https://example.com",
          };
        }
        if (b.type === "PHONE_NUMBER") {
          return {
            type: "PHONE_NUMBER" as const,
            text: b.text ?? "Call",
            phone_number: b.phone_number ?? "",
          };
        }
        if (b.type === "FLOW" || b.type === "FORMS") {
          return { type: "FLOW" as const, text: b.text ?? "Open form" };
        }
        return { type: "QUICK_REPLY" as const, text: b.text ?? "Reply" };
      }),
    });
  }

  return {
    name: t.name,
    category: t.category === "AUTHENTICATION" ? "Authentication" : "Utility",
    language: t.language || "en_US",
    template_type: "default",
    parameter_format: "POSITIONAL",
    components,
  };
}

export function TemplateLibraryBrowser() {
  const router = useRouter();

  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [industry, setIndustry] = useState("");

  const [selected, setSelected] = useState<LibraryTemplate | null>(null);
  const [name, setName] = useState("");
  const [urlBase, setUrlBase] = useState("");
  const [urlExample, setUrlExample] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (topic) params.set("topic", topic);
      if (industry) params.set("industry", industry);
      const res = await fetch(`/api/whatsapp/template-library?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data?.error || `Could not load the library (${res.status}).`);
        setTemplates([]);
        return;
      }
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the library.");
    } finally {
      setLoading(false);
    }
  }, [search, topic, industry]);

  useEffect(() => {
    void load();
    // Filters are applied on submit / change rather than per keystroke —
    // each call is a round trip to Meta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, industry]);

  // Which button details Meta requires from us for the chosen template.
  const needsUrl = (selected?.buttons ?? []).some((b) => b.type === "URL");
  const needsPhone = (selected?.buttons ?? []).some(
    (b) => b.type === "PHONE_NUMBER",
  );
  const hasForm = (selected?.buttons ?? []).some(
    (b) => b.type === "FLOW" || b.type === "FORMS",
  );

  const nameValid = /^[a-z0-9_]{1,512}$/.test(name);
  const canCreate =
    !!selected &&
    nameValid &&
    (!needsUrl || (urlBase.trim() !== "" && urlExample.trim() !== "")) &&
    (!needsPhone || phone.trim() !== "");

  function pick(t: LibraryTemplate) {
    setSelected(t);
    // Seed from the library name so the common case needs no typing, but
    // keep it editable — the name is ours, and Meta enforces uniqueness
    // per (name, language) on the account.
    setName(t.name);
    setUrlBase(t.buttons?.find((b) => b.type === "URL")?.url ?? "");
    setUrlExample("");
    setPhone(t.buttons?.find((b) => b.type === "PHONE_NUMBER")?.phone_number ?? "");
  }

  async function create() {
    if (!selected) return;
    setCreating(true);
    try {
      const buttonInputs: unknown[] = [];
      if (needsUrl) {
        buttonInputs.push({
          type: "URL",
          url: {
            base_url: urlBase.trim(),
            url_suffix_example: urlExample.trim(),
          },
        });
      }
      if (needsPhone) {
        buttonInputs.push({ type: "PHONE_NUMBER", phone_number: phone.trim() });
      }

      const res = await fetch("/api/whatsapp/template-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          language: selected.language || "en_US",
          library_template_name: selected.name,
          category: selected.category,
          library_template_button_inputs: buttonInputs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Create failed (HTTP ${res.status})`);
      }
      toast.success("Created from Meta's library.");
      router.push("/templates");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  // ---- Detail / create view ----
  if (selected) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Button variant="ghost" onClick={() => setSelected(null)}>
            <ArrowLeft className="size-4" />
            Back to the library
          </Button>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">
              {humanise(selected.usecase ?? selected.name)}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Meta wrote this one and has already categorised it as{" "}
              {selected.category.toLowerCase()}. The wording cannot be changed —
              if you need different text, write a template instead.
            </p>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="lib-name">Name your template</Label>
              <Input
                id="lib-name"
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "_")
                      .slice(0, 512),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and underscores. This is your name for
                it, not Meta&apos;s.
              </p>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label>Language</Label>
              <Input value={selected.language || "en_US"} disabled />
              <p className="text-xs text-muted-foreground">
                Fixed by the library template you picked.
              </p>
            </div>
          </section>

          {needsUrl || needsPhone ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold text-foreground">
                Your button details
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The buttons come with the template; only the destinations are
                yours to fill in.
              </p>

              {needsUrl ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="lib-url">Website URL</Label>
                    <Input
                      id="lib-url"
                      value={urlBase}
                      onChange={(e) => setUrlBase(e.target.value)}
                      placeholder="https://example.com/orders/{{1}}"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lib-url-example">Example of a full link</Label>
                    <Input
                      id="lib-url-example"
                      value={urlExample}
                      onChange={(e) => setUrlExample(e.target.value)}
                      placeholder="https://example.com/orders/12345"
                    />
                    <p className="text-xs text-muted-foreground">
                      Meta needs a filled-in example to review the link.
                    </p>
                  </div>
                </div>
              ) : null}

              {needsPhone ? (
                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="lib-phone">Phone number</Label>
                  <Input
                    id="lib-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+911234567890"
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {hasForm ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This one is a form, powered by a WhatsApp Flow. Meta only makes
                these available to accounts whose messaging limits have been
                raised, so the create may be refused until yours are.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {nameValid
                ? "Meta reviews library templates too, but usually approves them immediately."
                : "Give the template a name to continue."}
            </p>
            <Button
              onClick={create}
              disabled={!canCreate || creating}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              Create this template
            </Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Preview</h3>
            <WhatsAppPreview
              definition={definitionFromLibrary(selected)}
              values={positionalValues(selected.body_params ?? [])}
              className="mt-3"
            />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The values shown are Meta&apos;s samples. You supply the real ones
              when you send.
            </p>
          </div>
        </aside>
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="lib-search">Search</Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="lib-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="delivery, payment, feedback…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lib-topic">Topic</Label>
          <select
            id="lib-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">Any topic</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lib-industry">Industry</Label>
          <select
            id="lib-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">Any industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {humanise(i)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Search
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading Meta&apos;s template library…
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-700 dark:text-amber-400">
            <p>{loadError}</p>
            <p className="mt-1 text-xs">
              The library needs the{" "}
              <code>whatsapp_business_management</code> permission on your access
              token, and is only offered to some accounts.
            </p>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <LibraryBig className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-foreground">
            Nothing matched those filters.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Meta&apos;s library covers a fixed set of common cases — try a
            broader search, or write your own template.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={`${t.id}-${t.language}`}
              type="button"
              onClick={() => pick(t)}
              className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {humanise(t.usecase ?? t.name)}
                </p>
                <Badge className="border border-primary/30 bg-primary/10 text-[10px] text-primary">
                  {t.category}
                </Badge>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {t.language}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">
                {t.body}
              </p>
              {(t.buttons ?? []).length > 0 ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Buttons: {(t.buttons ?? []).map((b) => b.text || b.type).join(", ")}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
