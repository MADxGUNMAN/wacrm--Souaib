import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTACT_SOURCES,
  contactSourceConfig,
  getContactSource,
  type ContactSource,
} from './contact-source';

describe('getContactSource', () => {
  it('resolves every known source to its own entry', () => {
    for (const source of CONTACT_SOURCES) {
      expect(getContactSource(source)).toBe(contactSourceConfig[source]);
    }
  });

  /*
    The whole point of the tolerant lookup: a value written by a newer
    deploy, or by hand in SQL, must not blank the contacts table for
    everyone still on the older build.
  */
  it('falls back to unknown for an unrecognised, null or empty value', () => {
    expect(getContactSource('zapier')).toBe(contactSourceConfig.unknown);
    expect(getContactSource(null)).toBe(contactSourceConfig.unknown);
    expect(getContactSource(undefined)).toBe(contactSourceConfig.unknown);
    expect(getContactSource('')).toBe(contactSourceConfig.unknown);
  });
});

describe('config integrity', () => {
  it('lists every configured source exactly once, in CONTACT_SOURCES', () => {
    const configured = Object.keys(contactSourceConfig).sort();
    const ordered = [...CONTACT_SOURCES].sort();
    expect(ordered).toEqual(configured);
    expect(new Set(CONTACT_SOURCES).size).toBe(CONTACT_SOURCES.length);
  });

  /*
    THE DRIFT THIS GUARDS is silent and permanent: add a value to the
    database CHECK, forget this file, and every contact carrying it renders
    as "Unknown" forever with nothing to indicate a bug. Parsing the
    migration is worth the ugliness — the alternative is trusting two lists
    in different languages to be edited together.
  */
  it('matches the CHECK constraint on contacts.source', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/20260916120000_contact_source.sql'
      ),
      'utf8'
    );

    const check = sql.slice(sql.indexOf('contacts_source_check CHECK'));
    const inList = check.slice(check.indexOf('('), check.indexOf(')'));

    const fromSql = [...inList.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1] as ContactSource)
      .sort();

    expect(fromSql.length).toBeGreaterThan(0);
    expect(fromSql).toEqual([...CONTACT_SOURCES].sort());
  });
});
