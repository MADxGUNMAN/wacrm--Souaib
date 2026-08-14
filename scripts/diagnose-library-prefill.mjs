// Diagnostic: run EXACTLY the query /templates/new performs, with the same
// env files Next loads, and print what the page would have received.
//
// Answers one question: when the wizard opens blank, is it the database, the
// env, or the running process? Delete once the prefill is confirmed working.
//
//   node scripts/diagnose-library-prefill.mjs ec-order-confirmation

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const slug = process.argv[2] ?? 'ec-order-confirmation';

// Next's precedence, lowest first, so later files overwrite earlier ones —
// the same order `next dev` applies.
const ORDER = ['.env', '.env.development', '.env.local', '.env.development.local'];
const env = {};
const seen = [];

for (const file of ORDER) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  seen.push(file);
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

console.log(`env files present: ${seen.join(', ') || 'none'}`);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

// Print the project ref, never the key itself — enough to spot a wrong
// project without putting a secret in the terminal history.
console.log(`NEXT_PUBLIC_SUPABASE_URL   = ${url ?? '(missing)'}`);
console.log(
  `SUPABASE_SERVICE_ROLE_KEY  = ${key ? `set, ${key.length} chars, starts "${key.slice(0, 7)}…"` : '(MISSING — supabaseAdmin() would throw)'}`,
);

if (!url || !key) process.exit(1);

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from('template_library_templates')
  .select('*')
  .eq('slug', slug)
  .eq('is_active', true)
  .maybeSingle();

console.log('\n--- the exact query the page runs ---');
console.log(`slug = "${slug}"`);
if (error) console.log(`ERROR: ${error.message} (${error.code ?? 'no code'})`);
console.log(`row found: ${data ? 'YES' : 'NO'}`);

if (data) {
  console.log(`  meta_category  = ${data.meta_category}`);
  console.log(`  template_type  = ${data.template_type}`);
  console.log(`  header_type    = ${data.header_type}`);
  console.log(`  body_text      = ${JSON.stringify(data.body_text.slice(0, 50))}…`);
  console.log('\n=> the page WOULD prefill. A blank wizard is the running process, not the data.');
} else {
  // Narrow it down: is the table readable at all, or is it just this slug?
  const { count, error: countError } = await supabase
    .from('template_library_templates')
    .select('*', { count: 'exact', head: true });
  console.log(
    `\ntable readable? ${countError ? `NO — ${countError.message}` : `YES, ${count} rows total`}`,
  );
  const { data: near } = await supabase
    .from('template_library_templates')
    .select('slug')
    .ilike('slug', `%${slug.split('-').pop()}%`)
    .limit(5);
  console.log(`similar slugs: ${(near ?? []).map((r) => r.slug).join(', ') || 'none'}`);
}
