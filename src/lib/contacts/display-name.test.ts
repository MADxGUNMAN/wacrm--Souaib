import { describe, expect, it } from 'vitest';

import {
  contactNameWithProfile,
  primaryContactName,
  resolveContactNameUpdate,
  whatsappNameSuffix,
} from './display-name';

describe('primaryContactName', () => {
  it('prefers the saved name', () => {
    expect(
      primaryContactName({
        name: 'Souaib Ansari',
        wa_profile_name: 'Souaib',
        phone: '917861902341',
      })
    ).toBe('Souaib Ansari');
  });

  it('falls back to the WhatsApp name when nothing is saved', () => {
    // A brand-new contact should read as "Souaib", not as a bare number.
    expect(
      primaryContactName({ wa_profile_name: 'Souaib', phone: '917861902341' })
    ).toBe('Souaib');
  });

  it('falls back to the phone when neither name exists', () => {
    expect(primaryContactName({ phone: '917861902341' })).toBe('917861902341');
  });

  it('treats whitespace-only names as absent', () => {
    expect(primaryContactName({ name: '   ', wa_profile_name: 'Souaib' })).toBe(
      'Souaib'
    );
  });

  it('uses the fallback when there is nothing at all', () => {
    expect(primaryContactName({}, 'Customer')).toBe('Customer');
  });
});

describe('whatsappNameSuffix', () => {
  /** The reported case: saved name edited, profile name still the old one. */
  it('returns the profile name when it differs from the saved name', () => {
    expect(
      whatsappNameSuffix({ name: 'Souaib Ansari', wa_profile_name: 'Souaib' })
    ).toBe('Souaib');
  });

  it('returns null when the two are the same', () => {
    // "Souaib ~Souaib" tells the reader nothing.
    expect(
      whatsappNameSuffix({ name: 'Souaib', wa_profile_name: 'Souaib' })
    ).toBeNull();
  });

  it('ignores case and surrounding space when comparing', () => {
    expect(
      whatsappNameSuffix({
        name: 'souaib ansari',
        wa_profile_name: '  Souaib Ansari ',
      })
    ).toBeNull();
  });

  it('returns null when nothing is saved, since the profile name is already primary', () => {
    expect(
      whatsappNameSuffix({ wa_profile_name: 'Souaib', phone: '917861902341' })
    ).toBeNull();
  });

  it('returns null when there is no profile name', () => {
    expect(whatsappNameSuffix({ name: 'Souaib Ansari' })).toBeNull();
    expect(
      whatsappNameSuffix({ name: 'Souaib Ansari', wa_profile_name: '  ' })
    ).toBeNull();
  });
});

describe('contactNameWithProfile', () => {
  it('joins both with a tilde', () => {
    expect(
      contactNameWithProfile({
        name: 'Souaib Ansari',
        wa_profile_name: 'Souaib',
      })
    ).toBe('Souaib Ansari ~Souaib');
  });

  it('omits the tilde when there is no distinct profile name', () => {
    expect(contactNameWithProfile({ name: 'Souaib Ansari' })).toBe(
      'Souaib Ansari'
    );
  });
});

describe('resolveContactNameUpdate', () => {
  /**
   * THE BUG. The operator renamed 917861902341 to "Souaib Ansari"; the contact
   * replied and the webhook overwrote it with their WhatsApp profile name.
   * The saved name must now survive, while the profile name is recorded
   * separately for the "~Souaib" suffix.
   */
  it('never overwrites an edited name, but does record the profile name', () => {
    expect(
      resolveContactNameUpdate({
        existingName: 'Souaib Ansari',
        existingProfileName: null,
        incomingProfileName: 'Souaib',
      })
    ).toEqual({ wa_profile_name: 'Souaib' });
  });

  it('fills in a name that is still a phone number', () => {
    expect(
      resolveContactNameUpdate({
        existingName: '917861902341',
        existingProfileName: null,
        incomingProfileName: 'Souaib',
      })
    ).toEqual({ name: 'Souaib', wa_profile_name: 'Souaib' });
  });

  it('fills in a blank name', () => {
    expect(
      resolveContactNameUpdate({
        existingName: null,
        existingProfileName: null,
        incomingProfileName: 'Souaib',
      })
    ).toEqual({ name: 'Souaib', wa_profile_name: 'Souaib' });
  });

  /**
   * The flag-free part. The saved name matches the profile name we last
   * recorded, so we auto-filled it and nobody has edited it — following the
   * rename on WhatsApp is correct.
   */
  it('follows a WhatsApp rename when the name was auto-filled', () => {
    expect(
      resolveContactNameUpdate({
        existingName: 'Souaib',
        existingProfileName: 'Souaib',
        incomingProfileName: 'Souaib A',
      })
    ).toEqual({ name: 'Souaib A', wa_profile_name: 'Souaib A' });
  });

  it('stops following once the operator edits the name', () => {
    // Auto-filled as "Souaib", then edited to "Souaib Ansari". A later
    // WhatsApp rename must not touch it.
    expect(
      resolveContactNameUpdate({
        existingName: 'Souaib Ansari',
        existingProfileName: 'Souaib',
        incomingProfileName: 'Souaib B',
      })
    ).toEqual({ wa_profile_name: 'Souaib B' });
  });

  it('returns null when nothing changed, so no write is issued', () => {
    expect(
      resolveContactNameUpdate({
        existingName: 'Souaib',
        existingProfileName: 'Souaib',
        incomingProfileName: 'Souaib',
      })
    ).toBeNull();
  });

  it('returns null when no profile name arrived', () => {
    // Echoes and history backfills carry none.
    for (const missing of [null, undefined, '', '   ']) {
      expect(
        resolveContactNameUpdate({
          existingName: 'Souaib Ansari',
          existingProfileName: 'Souaib',
          incomingProfileName: missing,
        })
      ).toBeNull();
    }
  });

  /**
   * A profile name with no letters must never become the saved name — that is
   * how a contact ends up displaying its own number twice.
   */
  it('records a number-like profile name but never promotes it', () => {
    expect(
      resolveContactNameUpdate({
        existingName: '917861902341',
        existingProfileName: null,
        incomingProfileName: '+91 78619 02341',
      })
    ).toEqual({ wa_profile_name: '+91 78619 02341' });
  });

  it('handles non-Latin scripts as real names', () => {
    expect(
      resolveContactNameUpdate({
        existingName: '919716747472',
        existingProfileName: null,
        incomingProfileName: 'सब्ज़ी वाला',
      })
    ).toEqual({ name: 'सब्ज़ी वाला', wa_profile_name: 'सब्ज़ी वाला' });
  });

  it('trims the values it stores', () => {
    expect(
      resolveContactNameUpdate({
        existingName: null,
        existingProfileName: null,
        incomingProfileName: '  Souaib  ',
      })
    ).toEqual({ name: 'Souaib', wa_profile_name: 'Souaib' });
  });
});
