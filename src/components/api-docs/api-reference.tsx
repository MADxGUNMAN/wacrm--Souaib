'use client';

// ============================================================
// The API reference page body.
//
// ─── Why one client component instead of server-rendered sections ──
//
// Three things are shared across the whole page: the selected language,
// the sidebar search, and the active-section highlight. A language
// dropdown that only changed one panel would be a bug, so the selection
// has to live above every code block. Everything below it is pure
// rendering of the view model, which arrives as plain JSON — no spec
// import crosses the boundary (see view-model.ts for why that matters).
//
// Samples for all six languages are pre-generated on the server, so
// switching language is instant and needs no request.
//
// ─── On the "Try it" playground we did not build ──────────────────
//
// An in-page request runner would need a live API key typed into a
// public web page, and would teach exactly the habit the docs warn
// against two paragraphs earlier. Readers get copy-runnable snippets
// instead, which they execute in their own trusted environment.
// ============================================================

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  KeyRound,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ApiReferenceView } from '@/lib/api-docs/view-model';

import { CodeBlock } from './code-block';
import { CopyButton } from './copy-button';
import { EndpointDoc } from './endpoint-doc';
import { MethodBadge } from './method-badge';

// ─────────────── language preference, as a store ───────────────
//
// The chosen language is persisted, which makes it EXTERNAL state: it
// outlives the component and can change in another tab. Modelling it
// with `useSyncExternalStore` rather than `useState` + a restore effect
// gets three things right at once — no setState-in-effect cascade, no
// hydration mismatch (the server snapshot is "nothing stored"), and
// cross-tab sync for free.

const LANGUAGE_STORAGE_KEY = 'wacrm.api-reference.language';

/** Same-tab subscribers; the `storage` event only fires cross-tab. */
const languageListeners = new Set<() => void>();

/**
 * Fallback when localStorage is unavailable (private mode, blocked
 * storage). Without it a rejected write would leave the dropdown unable
 * to change at all, which is a much worse failure than forgetting the
 * choice on reload.
 */
let inMemoryLanguage: string | null = null;

function subscribeToLanguage(onStoreChange: () => void): () => void {
  languageListeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    languageListeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function readStoredLanguage(): string | null {
  try {
    return (
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? inMemoryLanguage
    );
  } catch {
    return inMemoryLanguage;
  }
}

/** Nothing is stored during SSR, so the server always sees the default. */
function readServerLanguage(): string | null {
  return null;
}

function writeStoredLanguage(id: string): void {
  inMemoryLanguage = id;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, id);
  } catch {
    // Keep the in-memory value; the choice just won't survive a reload.
  }
  for (const listener of languageListeners) listener();
}

const GUIDE_SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'quick-start', title: 'Quick start' },
  { id: 'authentication', title: 'Authentication' },
  { id: 'errors', title: 'Errors' },
  { id: 'rate-limits', title: 'Rate limits' },
  { id: 'pagination', title: 'Pagination' },
] as const;

// ─────────────────────── small pieces ───────────────────────

function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28">
      {eyebrow ? (
        <p className="text-primary text-[11px] font-semibold tracking-wider uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-foreground mt-1 text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {children ? (
        <div className="text-muted-foreground mt-2 space-y-2 text-sm leading-relaxed">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[12.5px]">
      {children}
    </code>
  );
}

/** Tracks which section is in view, for the sidebar highlight. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState('');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Ignore the sticky header band, and only count a section once it
      // reaches the upper third — otherwise the highlight jumps ahead to
      // whatever is barely peeking in from the bottom.
      { rootMargin: '-104px 0px -68% 0px' }
    );

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

// ─────────────────────────── page ───────────────────────────

export function ApiReference({ view }: { view: ApiReferenceView }) {
  const [query, setQuery] = useState('');

  const storedLanguageId = useSyncExternalStore(
    subscribeToLanguage,
    readStoredLanguage,
    readServerLanguage
  );

  // An unknown stored id (a language we dropped since it was saved)
  // falls back rather than blanking every code panel.
  const language =
    view.languages.find((l) => l.id === storedLanguageId) ?? view.languages[0];

  const sectionIds = useMemo(
    () => [
      ...GUIDE_SECTIONS.map((s) => s.id),
      ...view.groups.flatMap((g) => [g.id, ...g.endpoints.map((e) => e.id)]),
      'webhooks',
    ],
    [view.groups]
  );
  const active = useActiveSection(sectionIds);

  // Search filters the NAVIGATION, not the content: deep links have to
  // keep working, and hiding sections would strand a reader who searched
  // for something adjacent to what they actually need.
  const needle = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!needle) return view.groups;
    return view.groups
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) =>
          `${endpoint.method} ${endpoint.path} ${endpoint.title} ${endpoint.scope ?? ''}`
            .toLowerCase()
            .includes(needle)
        ),
      }))
      .filter(
        (group) =>
          group.endpoints.length > 0 ||
          group.title.toLowerCase().includes(needle)
      );
  }, [view.groups, needle]);

  const filteredGuides = needle
    ? GUIDE_SECTIONS.filter((s) => s.title.toLowerCase().includes(needle))
    : GUIDE_SECTIONS;

  const nothingMatched =
    needle.length > 0 &&
    filteredGuides.length === 0 &&
    filteredGroups.length === 0;

  const navLinkClass = (id: string) =>
    cn(
      'block truncate rounded-md px-2 py-1 text-[13px] transition-colors',
      active === id
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );

  return (
    <div className="bg-background min-h-screen">
      {/* ================= Sticky header ================= */}
      <header className="bg-background/85 border-border sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-foreground flex items-center gap-2 text-base font-semibold tracking-tight">
              <Terminal className="text-primary size-4" aria-hidden />
              API reference
              <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[11px] font-normal">
                v1
              </span>
            </h1>
            <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11.5px]">
              {view.baseUrl}/api/v1
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={language.id}
              onValueChange={(value) =>
                value && writeStoredLanguage(String(value))
              }
            >
              <SelectTrigger
                aria-label="Code sample language"
                className="w-[132px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {view.languages.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <CopyButton
              value={view.agentPrompt}
              label="AI agent prompt"
              showLabel
              tone="accent"
              className="rounded-lg"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-8 px-4 lg:px-8">
        {/* ================= Sidebar ================= */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-[76px] max-h-[calc(100vh-92px)] overflow-y-auto py-8 pr-2">
            <div className="relative mb-4">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search endpoints"
                aria-label="Search endpoints"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 h-8 w-full rounded-lg border pl-8 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>

            {nothingMatched ? (
              <p className="text-muted-foreground px-2 text-[13px]">
                Nothing matches “{query.trim()}”.
              </p>
            ) : null}

            {filteredGuides.length > 0 ? (
              <nav aria-label="Guides" className="mb-5">
                <p className="text-muted-foreground mb-1.5 px-2 text-[10.5px] font-semibold tracking-wider uppercase">
                  Guides
                </p>
                {filteredGuides.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={navLinkClass(section.id)}
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            ) : null}

            <nav aria-label="Endpoints" className="space-y-5">
              {filteredGroups.map((group) => (
                <div key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="text-muted-foreground hover:text-foreground mb-1.5 block px-2 text-[10.5px] font-semibold tracking-wider uppercase"
                  >
                    {group.title}
                  </a>
                  {group.endpoints.map((endpoint) => (
                    <a
                      key={endpoint.id}
                      href={`#${endpoint.id}`}
                      className={cn(
                        navLinkClass(endpoint.id),
                        'flex items-center gap-1.5'
                      )}
                    >
                      <MethodBadge
                        method={endpoint.method}
                        className="scale-90"
                      />
                      <span className="truncate">{endpoint.title}</span>
                    </a>
                  ))}
                </div>
              ))}
            </nav>

            {!needle ? (
              <nav aria-label="Events" className="mt-5">
                <p className="text-muted-foreground mb-1.5 px-2 text-[10.5px] font-semibold tracking-wider uppercase">
                  Events
                </p>
                <a href="#webhooks" className={navLinkClass('webhooks')}>
                  Webhooks
                </a>
              </nav>
            ) : null}
          </div>
        </aside>

        {/* ================= Content ================= */}
        <main className="min-w-0 flex-1 space-y-16 py-8 pb-32">
          {/* ---- Mobile nav ---- */}
          <details className="border-border bg-card rounded-lg border p-3 lg:hidden">
            <summary className="text-foreground cursor-pointer text-sm font-medium">
              Jump to section
            </summary>
            <div className="mt-3 space-y-3">
              {GUIDE_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="text-muted-foreground block text-[13px]"
                >
                  {section.title}
                </a>
              ))}
              {view.groups.map((group) => (
                <a
                  key={group.id}
                  href={`#${group.id}`}
                  className="text-muted-foreground block text-[13px]"
                >
                  {group.title}
                </a>
              ))}
              <a
                href="#webhooks"
                className="text-muted-foreground block text-[13px]"
              >
                Webhooks
              </a>
            </div>
          </details>

          {/* ================= Overview ================= */}
          <section className="space-y-5">
            <SectionHeading
              id="overview"
              eyebrow="Public REST API"
              title="Overview"
            >
              <p>
                Everything your integration can do lives under{' '}
                <InlineCode>{view.baseUrl}/api/v1</InlineCode>. Authenticate
                with an API key, send and receive JSON, and subscribe to
                webhooks instead of polling.
              </p>
              <p>
                Every response uses the same envelope, so one parser handles the
                whole API. Success carries <InlineCode>data</InlineCode>;
                failure carries <InlineCode>error.code</InlineCode> and{' '}
                <InlineCode>error.message</InlineCode>.
              </p>
            </SectionHeading>

            <div className="grid gap-4 md:grid-cols-3">
              <CodeBlock
                title="Success"
                grammar="json"
                code={'{\n  "data": { "id": "…" }\n}'}
                copyLabel="Success envelope"
              />
              <CodeBlock
                title="List"
                grammar="json"
                code={'{\n  "data": [],\n  "meta": { "next_cursor": null }\n}'}
                copyLabel="List envelope"
              />
              <CodeBlock
                title="Failure"
                grammar="json"
                code={
                  '{\n  "error": {\n    "code": "bad_request",\n    "message": "…"\n  }\n}'
                }
                copyLabel="Error envelope"
              />
            </div>

            {/* ---- AI prompt callout ---- */}
            <div className="border-primary/30 bg-primary/[0.06] rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="text-primary size-4" aria-hidden />
                    Building with an AI coding agent?
                  </h3>
                  <p className="text-muted-foreground mt-1 max-w-2xl text-[13px] leading-relaxed">
                    Copy a self-contained brief covering every endpoint, scope,
                    error code, the rate limit, the pagination loop, and webhook
                    signature verification. Paste it into ChatGPT, Claude,
                    Cursor, or Copilot and it has everything it needs to write
                    working integration code without guessing or asking
                    follow-up questions.
                  </p>
                </div>
                <CopyButton
                  value={view.agentPrompt}
                  label="AI agent prompt"
                  showLabel
                  tone="accent"
                  className="rounded-lg"
                />
              </div>
            </div>
          </section>

          {/* ================= Quick start ================= */}
          <section className="space-y-4">
            <SectionHeading id="quick-start" title="Quick start">
              <p>
                Three steps to a first successful call. Start with{' '}
                <InlineCode>GET /api/v1/me</InlineCode> — it needs no scope, so
                a green response proves your key and the whole auth path work
                before you touch real data.
              </p>
            </SectionHeading>

            <ol className="space-y-3">
              <li className="border-border bg-card flex gap-3 rounded-lg border p-3">
                <span className="bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  1
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-foreground font-medium">
                    Create an API key
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
                    In the dashboard, go to{' '}
                    <Link
                      href="/settings?tab=api"
                      className="text-primary font-medium underline underline-offset-2"
                    >
                      Settings → API keys
                    </Link>{' '}
                    and grant only the scopes you need. The full key is shown
                    once, at creation — store it in a secret manager straight
                    away.
                  </p>
                </div>
              </li>
              <li className="border-border bg-card flex gap-3 rounded-lg border p-3">
                <span className="bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  2
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-foreground font-medium">Verify it works</p>
                  <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
                    Replace <InlineCode>{view.sampleApiKey}</InlineCode> with
                    your key and run the snippet below.
                  </p>
                </div>
              </li>
              <li className="border-border bg-card flex gap-3 rounded-lg border p-3">
                <span className="bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  3
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-foreground font-medium">
                    Build the real thing
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
                    The response lists the scopes your key carries. Every
                    endpoint below states the one it needs.
                  </p>
                </div>
              </li>
            </ol>

            {view.quickStart[language.id] ? (
              <CodeBlock
                code={view.quickStart[language.id]}
                grammar={language.highlight}
                title={`Verify your key — ${language.label}`}
                copyLabel={`Quick start (${language.label})`}
              />
            ) : null}
          </section>

          {/* ================= Authentication ================= */}
          <section className="space-y-4">
            <SectionHeading id="authentication" title="Authentication">
              <p>
                Send your key as a bearer token on every request. Keys are bound
                to a single account and are prefixed{' '}
                <InlineCode>{view.keyPrefix}</InlineCode>, so they are easy to
                spot in a config file.
              </p>
              <p>
                Scopes are fixed when a key is created. To add a capability,
                mint a new key rather than editing an existing one. Never ship a
                key in browser or mobile code — call the API from a server you
                control.
              </p>
            </SectionHeading>

            <CodeBlock
              title="Request headers"
              grammar="bash"
              code={`Authorization: Bearer ${view.sampleApiKey}\nContent-Type: application/json`}
              copyLabel="Auth headers"
            />

            <div>
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                Scopes
              </h3>
              <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                {view.scopes.map((scope) => (
                  <div key={scope.name} className="bg-card px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <code className="text-primary font-mono text-[12.5px] font-semibold">
                        {scope.name}
                      </code>
                      <span className="text-muted-foreground text-[11px]">
                        {scope.endpointIds.length} endpoint
                        {scope.endpointIds.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[13px]">
                      {scope.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ================= Errors ================= */}
          <section className="space-y-4">
            <SectionHeading id="errors" title="Errors">
              <p>
                Branch on the HTTP status first, then on{' '}
                <InlineCode>error.code</InlineCode>. The code is stable and safe
                to match in code; the message is for humans and may be reworded.
              </p>
              <p>
                Retry <InlineCode>internal</InlineCode> and{' '}
                <InlineCode>rate_limited</InlineCode> with backoff. Do not
                blind-retry a 4xx — the request itself is wrong and will fail
                identically.
              </p>
            </SectionHeading>

            <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
              {view.errorCodes.map((error) => (
                <div key={error.code} className="bg-card px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="text-foreground font-mono text-[12.5px] font-semibold">
                      {error.code}
                    </code>
                    <code className="text-muted-foreground font-mono text-[11px]">
                      HTTP {error.status}
                    </code>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
                    {error.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ================= Rate limits ================= */}
          <section className="space-y-4">
            <SectionHeading id="rate-limits" title="Rate limits">
              <p>
                {view.rateLimit.limit} requests per{' '}
                {view.rateLimit.windowSeconds} seconds, counted per API key.
                Going over returns <InlineCode>429</InlineCode> with code{' '}
                <InlineCode>rate_limited</InlineCode>.
              </p>
              <p>
                Honour <InlineCode>Retry-After</InlineCode> and back off
                exponentially with jitter rather than retrying in a tight loop.
              </p>
            </SectionHeading>

            <div className="flex flex-wrap gap-2">
              {view.rateLimit.headers.map((header) => (
                <code
                  key={header}
                  className="border-border bg-card text-muted-foreground rounded-md border px-2 py-1 font-mono text-[11.5px]"
                >
                  {header}
                </code>
              ))}
            </div>
          </section>

          {/* ================= Pagination ================= */}
          <section className="space-y-4">
            <SectionHeading id="pagination" title="Pagination">
              <p>
                List endpoints are keyset-paginated, newest first. Pass{' '}
                <InlineCode>limit</InlineCode> (1–{view.pagination.maxLimit},
                default {view.pagination.defaultLimit}) and follow{' '}
                <InlineCode>meta.next_cursor</InlineCode> until it comes back{' '}
                <InlineCode>null</InlineCode>.
              </p>
              <p>
                Cursors are opaque — pass them back verbatim, never parse or
                build one. Keyset paging stays stable while rows are being
                inserted, so a full scan will not skip or repeat records the way
                an offset would.
              </p>
            </SectionHeading>

            <CodeBlock
              title="Walk every page"
              grammar="bash"
              code={[
                `# First page`,
                `curl '${view.baseUrl}/api/v1/contacts?limit=${view.pagination.maxLimit}' \\`,
                `  -H 'Authorization: Bearer ${view.sampleApiKey}'`,
                ``,
                `# Then repeat with the cursor from meta.next_cursor,`,
                `# stopping when it is null.`,
                `curl '${view.baseUrl}/api/v1/contacts?limit=${view.pagination.maxLimit}&cursor=CURSOR_FROM_LAST_RESPONSE' \\`,
                `  -H 'Authorization: Bearer ${view.sampleApiKey}'`,
              ].join('\n')}
              copyLabel="Pagination example"
            />
          </section>

          {/* ================= Endpoints ================= */}
          {view.groups.map((group) => (
            <section key={group.id} className="space-y-8">
              <SectionHeading
                id={group.id}
                eyebrow="Endpoints"
                title={group.title}
              >
                <p>{group.description}</p>
              </SectionHeading>

              <div className="space-y-12">
                {group.endpoints.map((endpoint) => (
                  <EndpointDoc
                    key={endpoint.id}
                    endpoint={endpoint}
                    language={language}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* ================= Webhooks ================= */}
          <section className="space-y-5">
            <SectionHeading id="webhooks" eyebrow="Events" title="Webhooks">
              <p>
                Register an HTTPS endpoint to receive events instead of polling.
                Manage endpoints through{' '}
                <InlineCode>POST /api/v1/webhooks</InlineCode>, which returns
                the signing secret exactly once.
              </p>
            </SectionHeading>

            <div>
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                Events
              </h3>
              <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                {view.webhooks.events.map((event) => (
                  <div key={event.name} className="bg-card px-3 py-2.5">
                    <code className="text-foreground font-mono text-[12.5px] font-semibold">
                      {event.name}
                    </code>
                    <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
                      {event.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-foreground text-sm font-semibold">
                  Verifying a delivery
                </h3>
                <ol className="text-muted-foreground space-y-2 text-[13px] leading-relaxed">
                  <li>
                    1. Read <InlineCode>t</InlineCode> and{' '}
                    <InlineCode>v1</InlineCode> from the{' '}
                    <InlineCode>{view.webhooks.signatureHeader}</InlineCode>{' '}
                    header.
                  </li>
                  <li>
                    2. Reject the request if <InlineCode>t</InlineCode> is more
                    than {view.webhooks.toleranceSeconds} seconds from now. That
                    is the replay guard.
                  </li>
                  <li>
                    3. Compute {view.webhooks.algorithm} over{' '}
                    <InlineCode>{view.webhooks.signedPayload}</InlineCode>,
                    keyed with the endpoint&rsquo;s signing secret, and
                    hex-encode it.
                  </li>
                  <li>
                    4. Compare your digest to <InlineCode>v1</InlineCode> with a
                    constant-time comparison.
                  </li>
                </ol>
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
                  <ul className="space-y-1.5">
                    {view.webhooks.notes.map((note) => (
                      <li
                        key={note}
                        className="text-muted-foreground flex gap-2 text-[13px] leading-relaxed"
                      >
                        <span aria-hidden className="text-amber-500">
                          •
                        </span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-3">
                <CodeBlock
                  title="Delivery headers"
                  grammar="bash"
                  code={[
                    `${view.webhooks.eventHeader}: message.received`,
                    `${view.webhooks.idHeader}: aa11bb22-cc33-dd44-ee55-ff6677889900`,
                    `${view.webhooks.signatureHeader}: ${view.webhooks.signatureFormat}`,
                  ].join('\n')}
                  copyLabel="Delivery headers"
                />
                <CodeBlock
                  title="Payload"
                  grammar="json"
                  code={view.webhooks.examplePayloadJson}
                  copyLabel="Webhook payload"
                />
              </div>
            </div>
          </section>

          {/* ================= Footer ================= */}
          <footer className="border-border text-muted-foreground border-t pt-6 text-[13px]">
            <p>
              This reference is generated from the live route handlers, so it
              describes exactly what the API does today.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <Link
                href="/settings?tab=api"
                className="text-primary inline-flex items-center gap-1.5 font-medium hover:underline"
              >
                <KeyRound className="size-3.5" aria-hidden />
                Manage API keys
              </Link>
              <Link
                href="/docs"
                className="text-primary inline-flex items-center gap-1.5 font-medium hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Product guides
              </Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
