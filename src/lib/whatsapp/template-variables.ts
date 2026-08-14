/**
 * Placeholder parsing for template text.
 *
 * Split out of `template-validators.ts` for the same reason as the
 * limits: three client forms need this one pure helper, and importing it
 * from the validator module dragged the whole server-side validation
 * layer into the browser graph. Turbopack then failed to instantiate that
 * module on the client at all ("module factory is not available"),
 * despite the source, typecheck and tests being correct.
 *
 * Nothing here touches the network, the database or Node APIs, so it is
 * safe in either graph — which is precisely what makes it shareable.
 */

/**
 * Extract sorted, deduplicated {{N}} indices from a string. Returns
 * `[1, 2, 4]` for `"Hi {{1}} {{2}}, item {{4}}"`.
 *
 * Positional only, by design: Meta's NAMED parameter format uses
 * `{{order_id}}`, which has no index to sort and is handled separately.
 */
export function extractVariableIndices(text: string): number[] {
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  const set = new Set<number>();
  for (const m of matches) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Extract `{{named}}` parameters in the order they first appear.
 *
 * Returns `['first_name', 'order_number']` for
 * `"Thank you {{first_name}}! Order {{order_number}}."`.
 *
 * ORDER OF APPEARANCE, deduplicated — not sorted. Meta lets example and
 * send values arrive in any order (they are matched by `param_name`), but
 * the EDITOR has to show the sample fields in the order the operator
 * reads them, otherwise a two-variable sentence gets its inputs the wrong
 * way round and the mistake is invisible.
 *
 * Deliberately excludes purely numeric names so `{{1}}` is never mistaken
 * for a named parameter: Meta forbids mixing the two formats in one
 * template, and `extractVariableIndices` owns the positional case.
 */
export function extractNamedParams(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const name = m[1];
    if (/^\d+$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Is this a legal named parameter? Meta requires lowercase letters,
 * digits and underscores.
 *
 * Checked locally because the rejection ("The parameter name is
 * required") names neither the parameter nor the rule it broke.
 */
export function isValidNamedParam(name: string): boolean {
  return /^[a-z0-9_]+$/.test(name) && !/^\d+$/.test(name);
}
