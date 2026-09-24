/**
 * phone.js — turning whatever is in a spreadsheet cell into E.164.
 * PURE: no Apps Script services. Unit-tested, because a number that
 * normalises wrongly either fails to send or, worse, sends a real
 * message to a stranger.
 *
 * WHY THIS EXISTS AT ALL WHEN THE CRM ALSO VALIDATES
 * The CRM drops a recipient it cannot parse, and it is right to. But it
 * drops it silently from the caller's point of view — the add-on would
 * report "sent" for a row that was never delivered to. Normalising here
 * means a bad number is caught against the row it came from, and the
 * reason lands in that row's status cell where the operator can fix it.
 *
 * WHAT A SPREADSHEET ACTUALLY CONTAINS
 * Phone columns in real sheets are a mess, and every one of these is
 * handled deliberately rather than by accident:
 *   +91 98765 43210   formatted with spaces
 *   (555) 012-3456    formatted with punctuation
 *   6359465987        a NUMBER cell, so any leading zero is already gone
 *   09876543210       a national number with a trunk prefix
 *   0091987654321     the 00 international prefix
 *   919876543210      already international, no plus
 */
const ReplaiPhone = {
  /**
   * E.164 allows at most 15 digits including the country code, and the
   * shortest usable international number is around 8. Anything outside
   * that is a truncated cell, a serial number, or an extension — not a
   * phone number worth spending money on.
   */
  MIN_DIGITS: 8,
  MAX_DIGITS: 15,

  /**
   * @param {*} raw           cell value: string or number
   * @param {string} [countryCode]  the rule's '+91'-style default
   * @returns {{ok: boolean, phone: string, reason: string}}
   */
  normalise: function (raw, countryCode) {
    if (raw === null || raw === undefined) {
      return ReplaiPhone.bad_('no number in this row');
    }

    // A number cell arrives as a JS number. String() is safe here:
    // integers below 2^53 never render in exponential notation, and a
    // phone number is far below that.
    let text = String(raw).trim();
    if (!text) return ReplaiPhone.bad_('no number in this row');

    const hadPlus = text.charAt(0) === '+';

    // Strip everything a human or a locale might have added for
    // readability. Letters are NOT stripped — 'call John' should fail
    // loudly rather than quietly become a number.
    if (/[A-Za-z]/.test(text)) {
      return ReplaiPhone.bad_(
        '"' + ReplaiPhone.truncate_(text) + '" is not a phone number'
      );
    }
    text = text.replace(/[\s()\-.\u00a0]/g, '');
    if (hadPlus) text = text.replace(/^\+/, '');

    if (!/^\d+$/.test(text)) {
      return ReplaiPhone.bad_(
        '"' + ReplaiPhone.truncate_(String(raw)) + '" is not a phone number'
      );
    }

    const cc = ReplaiPhone.digitsOf_(countryCode);

    let digits;
    if (hadPlus) {
      // Already international and explicitly so. Trust it and do not
      // prepend anything — that is how +1… becomes +91 1… and reaches
      // the wrong country.
      digits = text;
    } else if (text.indexOf('00') === 0 && text.length > 4) {
      // 00 is the international access prefix in most of the world.
      digits = text.slice(2);
    } else if (cc) {
      // National number plus a configured country code. A single leading
      // zero is a trunk prefix (UK, India, much of Europe) and must be
      // dropped before the country code, or the number gains a digit and
      // fails at Meta.
      const national = text.replace(/^0+/, '');
      if (!national) {
        return ReplaiPhone.bad_('no number in this row');
      }
      digits =
        text.indexOf(cc) === 0 && text.length > cc.length
          ? // Already carries the country code without a plus, e.g.
            // 919876543210 with a +91 rule. Prefixing again would send
            // to +9191…, a real but wrong number.
            text
          : cc + national;
    } else {
      // No plus, no 00, no configured country code: there is genuinely
      // no way to know which country this belongs to. Guessing is how a
      // paid message reaches a stranger.
      return ReplaiPhone.bad_(
        'no country code — add one to the rule, or store numbers as +' +
          ReplaiPhone.truncate_(text, 6)
      );
    }

    if (digits.length < ReplaiPhone.MIN_DIGITS) {
      return ReplaiPhone.bad_('number is too short to be valid');
    }
    if (digits.length > ReplaiPhone.MAX_DIGITS) {
      return ReplaiPhone.bad_('number is too long to be valid');
    }

    return { ok: true, phone: '+' + digits, reason: '' };
  },

  /** Digits of a '+91'-style code, or '' when absent/unusable. */
  digitsOf_: function (countryCode) {
    const raw = String(
      countryCode === null || countryCode === undefined ? '' : countryCode
    )
      .trim()
      .replace(/[^\d]/g, '');
    return raw;
  },

  bad_: function (reason) {
    return { ok: false, phone: '', reason: reason };
  },

  truncate_: function (text, max) {
    const limit = max || 20;
    const value = String(text);
    return value.length > limit ? value.slice(0, limit) + '…' : value;
  },
};

/* Node/vitest only — see the note at the foot of dates.js. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplaiPhone: ReplaiPhone };
}
