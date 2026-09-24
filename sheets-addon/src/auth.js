/**
 * auth.js — custody of the user's Replai API key.
 *
 * WHY UserProperties AND NOT DocumentProperties
 * DocumentProperties is readable by every editor of the spreadsheet, so
 * storing the key there would hand an account-wide sending credential to
 * anyone the sheet is shared with — including view-then-copy scenarios.
 * UserProperties is scoped to (script, user), so a collaborator opening
 * the same sheet sees no key and is prompted for their own. The cost is
 * that a rule runs under whoever installed its trigger; the sidebar
 * therefore shows "Runs as <email>" (plan §4.2, §14.5).
 *
 * The key is plaintext at rest here — Apps Script offers no secret store,
 * and encrypting it would only move the problem to where the encryption
 * key lives. It is mitigated on the CRM side instead: keys are scoped
 * (`broadcasts:send` alone is enough for this add-on), hashed server-side
 * with SHA-256, and revocable at any time from Settings → API.
 */
const ReplaiAuth = {
  KEY_PROP: 'replai.apiKey',

  /** @returns {string} the stored key, or '' if none. */
  getKey: function () {
    return (
      PropertiesService.getUserProperties().getProperty(ReplaiAuth.KEY_PROP) ||
      ''
    );
  },

  hasKey: function () {
    return ReplaiAuth.getKey() !== '';
  },

  clearKey: function () {
    PropertiesService.getUserProperties().deleteProperty(ReplaiAuth.KEY_PROP);
  },

  /**
   * Cheap structural check before spending a network call. Mirrors
   * `looksLikeApiKey()` in src/lib/api-keys/keys.ts: the literal prefix
   * plus at least one character of body. Catches the common mistakes —
   * an empty paste, a key prefix copied without the body, a Meta token
   * pasted into the wrong box — with an instant, specific message.
   */
  looksLikeKey: function (candidate) {
    const value = String(candidate || '').trim();
    return (
      value.indexOf(ReplaiConfig.KEY_PREFIX) === 0 &&
      value.length > ReplaiConfig.KEY_PREFIX.length
    );
  },

  /**
   * Display form: keep the identifying prefix, hide the secret body.
   * Matches what the CRM shows in its own key list, so a user can tell
   * at a glance which of their keys this sheet is using.
   */
  maskKey: function (key) {
    const value = String(key || '');
    if (value.length <= ReplaiConfig.KEY_PREFIX.length + 4) return '••••';
    return value.slice(0, ReplaiConfig.KEY_PREFIX.length + 4) + '••••••••';
  },

  /**
   * Ask the CRM who a key belongs to. GET /api/v1/me needs no scope, so
   * it answers for any live key and is the correct probe: it separates
   * "this key is dead" from "this key is alive but cannot send".
   *
   * @param {string} [candidate] Validate this key instead of the stored
   *   one, without saving it.
   */
  validate: function (candidate) {
    const options = candidate ? { apiKey: String(candidate).trim() } : {};
    const result = ReplaiApi.get('/me', options);

    if (!result.ok) return result;

    const data = result.data || {};
    const account = data.account || {};
    const key = data.key || {};
    const scopes = key.scopes || [];

    return {
      ok: true,
      status: result.status,
      accountId: account.id || '',
      accountName: account.name || '',
      keyId: key.id || '',
      scopes: scopes,
      // Not a failure: the key is real and the CRM accepted it. It just
      // cannot send, which is a fixable setup mistake and needs its own
      // message rather than a generic "invalid key".
      hasSendScope: scopes.indexOf(ReplaiConfig.REQUIRED_SCOPE) !== -1,
    };
  },

  /**
   * Validate first, persist only on success. Saving an unverified key
   * would leave the add-on in a state where every later action fails
   * with a 401 and the user has no idea the key was the problem.
   *
   * @returns {{ok: boolean, code: string, message: string,
   *            accountName: string, hasSendScope: boolean}}
   */
  saveKey: function (candidate) {
    const value = String(candidate || '').trim();

    if (!value) {
      return {
        ok: false,
        code: 'missing_key',
        message: 'Paste your API key to continue.',
      };
    }

    if (!ReplaiAuth.looksLikeKey(value)) {
      return {
        ok: false,
        code: 'malformed_key',
        message:
          'That does not look like a Replai API key. Keys start with ' +
          ReplaiConfig.KEY_PREFIX +
          ' — copy the whole value shown when the key was created.',
      };
    }

    const check = ReplaiAuth.validate(value);

    if (!check.ok) {
      return {
        ok: false,
        code: check.code,
        message: ReplaiAuth.explain_(check),
      };
    }

    PropertiesService.getUserProperties().setProperty(
      ReplaiAuth.KEY_PROP,
      value
    );

    return {
      ok: true,
      code: 'connected',
      message: 'Connected to ' + (check.accountName || 'your workspace') + '.',
      accountName: check.accountName,
      hasSendScope: check.hasSendScope,
    };
  },

  /** Email the add-on acts as. Requires the userinfo.email scope. */
  getUserEmail: function () {
    try {
      return Session.getEffectiveUser().getEmail() || '';
    } catch (err) {
      // Not fatal: it is a label, not a capability. Most likely cause is
      // running before the userinfo.email scope has been authorised.
      console.warn('[replai] could not read effective user: ' + err);
      return '';
    }
  },

  /**
   * Turn an API failure into something a non-technical operator can act
   * on. The raw server message is kept for anything we have not
   * special-cased, because a vague "something went wrong" is what makes
   * support tickets.
   */
  explain_: function (result) {
    switch (result.code) {
      case 'unauthorized':
        return 'The CRM rejected this key. It may have been revoked, expired, or copied incompletely — create a fresh key in Replai and paste it again.';
      case 'rate_limited':
        return 'Too many requests for this key right now. Wait a moment and try again.';
      case 'network_error':
        return 'Could not reach Replai. Check your connection and try again.';
      case 'invalid_response':
        return 'Replai returned an unexpected response. If this repeats, the CRM may be mid-deploy or behind a proxy that is blocking API traffic.';
      default:
        return result.message || 'Could not verify the key.';
    }
  },
};
