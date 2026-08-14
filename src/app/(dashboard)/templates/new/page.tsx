import type { Metadata } from 'next';

import { TemplateWizard } from '@/components/templates/template-wizard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  resolveStarterTemplateType,
  toAppCategory,
  type StarterTemplate,
} from '@/lib/templates/starter-library';
import {
  starterTemplateToDraft,
  type StarterWizardSeed,
} from '@/components/templates/wizard-draft';

export const metadata: Metadata = {
  title: 'Create template',
};

/**
 * Create a template, optionally pre-filled from the starter library.
 *
 * `?library=<slug>` is resolved HERE, on the server, rather than by the
 * browser after mount. Two reasons: the wizard already accepts an initial
 * draft (that is how edit mode works, so there is nothing new to build),
 * and resolving it client-side would show an empty form for a moment and
 * then replace what the operator had started typing.
 *
 * ─── Why the SERVICE-ROLE client and not the cookie client ────────
 *
 * This read used to go through `@/lib/supabase/server`, which is the anon
 * key elevated to `authenticated` only if the request's Supabase auth
 * cookie is readable at render time. The library's RLS policy grants
 * SELECT to `authenticated` and nothing to `anon`, so the instant that
 * cookie was missing, chunked oddly, or mid-refresh, PostgREST ran as
 * `anon`, returned zero rows, and `.maybeSingle()` handed back
 * `{ data: null, error: null }` — indistinguishable from a bad slug. The
 * operator clicked "Use template" and got a blank Marketing/Default form
 * with no clue why.
 *
 * The starter library is curated platform content, identical for every
 * account, and this route already sits behind the auth check in
 * `src/proxy.ts` — so reading it with the service role widens nothing and
 * removes a whole class of silent failure.
 *
 * In Next 16 `searchParams` is a Promise, so it is awaited.
 */
export default async function NewTemplatePage({
  searchParams,
}: PageProps<'/templates/new'>) {
  const params = await searchParams;
  // A repeated param (?library=a&library=b) arrives as an array, so the
  // first value is taken rather than passed to `.eq()`, which would send
  // PostgREST an array and fail. Typed via Next's generated PageProps,
  // which is what forces this case to be handled at all.
  const raw = params.library;
  const library = Array.isArray(raw) ? raw[0] : raw;

  // TEMPORARY DIAGNOSTIC — remove once the prefill is confirmed working.
  // Prints on every render so a blank wizard can be told apart from a
  // missing query string without guessing.
  console.log(
    `[templates/new] library param = ${library === undefined ? 'UNDEFINED (no ?library= reached the server)' : `"${library}"`}`,
  );

  let initial: StarterWizardSeed | undefined = undefined;

  if (library) {
    // Wrapped because supabaseAdmin() throws when the service-role key is
    // missing. Creating a template from scratch does not need the library,
    // so a misconfigured server should cost the prefill — not the page.
    try {
      const { data, error } = await supabaseAdmin()
        .from('template_library_templates')
        .select('*')
        .eq('slug', library)
        .eq('is_active', true)
        .maybeSingle<StarterTemplate>();

      // A query failure and a missing row look identical to the operator,
      // so the failure at least gets logged. Neither blocks them: falling
      // through to a blank wizard means a stale link still lets them work.
      if (error) {
        console.error(
          `[templates/new] could not load starter template "${library}":`,
          error.message,
        );
      }

      // TEMPORARY DIAGNOSTIC — remove with the one above.
      console.log(
        `[templates/new] row for "${library}" = ${data ? `FOUND (${data.meta_category}/${data.template_type})` : 'NOT FOUND'}`,
      );

      if (data) {
        const category = toAppCategory(data.meta_category);
        initial = {
          draft: starterTemplateToDraft(data),
          category,
          // template_type is a free-text column, so it is checked against
          // the catalogue rather than trusted. An unknown or unbuildable
          // value would drop step 2 into the wrong editor.
          templateType: resolveStarterTemplateType(
            category,
            data.template_type,
          ),
        };
      }
    } catch (err) {
      console.error(
        `[templates/new] starter library unavailable for "${library}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return (
    // Keyed on the slug so picking a DIFFERENT starter template remounts
    // the wizard. The seed is only read by useState initialisers, so
    // without this a client-side navigation from one library template to
    // another would keep the first one's draft on screen.
    <TemplateWizard
      key={library ?? 'blank'}
      initialDraft={initial}
      libraryMissing={Boolean(library) && !initial}
    />
  );
}
