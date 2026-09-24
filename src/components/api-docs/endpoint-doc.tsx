'use client';

// ============================================================
// One endpoint's reference entry.
//
// Layout: prose and tables on the left, the runnable snippet and the
// example response on the right (stacked on narrow screens). The snippet
// sits at the top right because it answers the reader's first question —
// "what does the call look like?" — before they read a single table.
//
// The right column is deliberately NOT sticky. A sticky panel taller
// than the viewport clips its own bottom, and several of these snippets
// plus a response example comfortably exceed a laptop viewport. A
// top-aligned column always shows everything.
// ============================================================

import { Link2 } from 'lucide-react';

import type { EndpointView, LanguageView } from '@/lib/api-docs/view-model';

import { BodyTable, ParamTable } from './param-table';
import { CodeBlock } from './code-block';
import { MethodBadge } from './method-badge';

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
      {children}
    </h4>
  );
}

/**
 * Colour a status by class: 2xx settled, 4xx the caller's problem, 5xx
 * ours. Mid-500 hues because this app has no `.dark` class for
 * Tailwind's `dark:` variant to hook — see method-badge.tsx.
 */
function statusTone(status: number): string {
  if (status < 300) return 'text-emerald-500';
  if (status < 500) return 'text-amber-500';
  return 'text-rose-500';
}

export function EndpointDoc({
  endpoint,
  language,
}: {
  endpoint: EndpointView;
  language: LanguageView;
}) {
  const sample = endpoint.samples[language.id];
  const exampleResponse = endpoint.responses.find((r) => r.exampleJson);

  return (
    <section id={endpoint.id} className="scroll-mt-28">
      {/* ---- Heading ---- */}
      <div className="group flex flex-wrap items-center gap-2">
        <MethodBadge method={endpoint.method} />
        <code className="text-foreground font-mono text-[13px] font-semibold break-all">
          {endpoint.path}
        </code>
        <a
          href={`#${endpoint.id}`}
          aria-label={`Link to ${endpoint.method} ${endpoint.path}`}
          className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Link2 className="size-3.5" aria-hidden />
        </a>
      </div>

      <h3 className="text-foreground mt-2 text-lg font-semibold tracking-tight">
        {endpoint.title}
      </h3>
      <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
        {endpoint.summary}
      </p>

      {/* ---- Scope + pagination facts ---- */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Scope</span>
        {endpoint.scope ? (
          <code className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-[11.5px] font-medium">
            {endpoint.scope}
          </code>
        ) : (
          <span className="text-muted-foreground rounded bg-slate-500/10 px-1.5 py-0.5 text-[11.5px]">
            none — any valid key
          </span>
        )}
        {endpoint.paginated ? (
          <span className="text-muted-foreground rounded bg-slate-500/10 px-1.5 py-0.5 text-[11.5px]">
            paginated
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        {/* ---- Left: contract ---- */}
        <div className="min-w-0 space-y-5">
          {endpoint.pathParams.length > 0 ? (
            <div>
              <SubHeading>Path parameters</SubHeading>
              <ParamTable rows={endpoint.pathParams} />
            </div>
          ) : null}

          {endpoint.queryParams.length > 0 ? (
            <div>
              <SubHeading>Query parameters</SubHeading>
              <ParamTable rows={endpoint.queryParams} />
            </div>
          ) : null}

          {endpoint.bodyFields.length > 0 ? (
            <div>
              <SubHeading>Request body</SubHeading>
              <BodyTable rows={endpoint.bodyFields} />
            </div>
          ) : null}

          <div>
            <SubHeading>Responses</SubHeading>
            <ul className="space-y-1.5">
              {endpoint.responses.map((response) => (
                <li
                  key={response.status}
                  className="flex gap-2.5 text-[13px] leading-relaxed"
                >
                  <code
                    className={`shrink-0 font-mono font-semibold ${statusTone(response.status)}`}
                  >
                    {response.status}
                  </code>
                  <span className="text-muted-foreground">
                    {response.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {endpoint.errors.length > 0 ? (
            <div>
              <SubHeading>Errors specific to this endpoint</SubHeading>
              <ul className="space-y-1.5">
                {endpoint.errors.map((error) => (
                  <li
                    key={error.code}
                    className="flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] leading-relaxed"
                  >
                    <code className="text-foreground font-mono font-semibold">
                      {error.code}
                    </code>
                    <code
                      className={`font-mono text-xs ${statusTone(error.status)}`}
                    >
                      {error.status}
                    </code>
                    <span className="text-muted-foreground w-full">
                      {error.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {endpoint.notes.length > 0 ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <SubHeading>Worth knowing</SubHeading>
              <ul className="space-y-1.5">
                {endpoint.notes.map((note) => (
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
          ) : null}
        </div>

        {/* ---- Right: runnable call ---- */}
        <div className="min-w-0 space-y-4">
          <CodeBlock
            code={sample}
            grammar={language.highlight}
            title={`Request — ${language.label}`}
            copyLabel={`${endpoint.title} (${language.label})`}
          />
          {exampleResponse ? (
            <CodeBlock
              code={exampleResponse.exampleJson!}
              grammar="json"
              title={`Response — ${exampleResponse.status}`}
              copyLabel="Example response"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
