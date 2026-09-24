/**
 * Config.js — every environment-specific constant in one place.
 *
 * WHY A SINGLE HARD-CODED BASE URL
 * A published add-on can only fetch URLs listed in the manifest's
 * `urlFetchWhitelist`, and that allowlist is REQUIRED for a versioned
 * deployment (it is optional only for untracked test deployments). So a
 * "point this at my own server" setting could not work in the published
 * build — the fetch would be blocked no matter what the user typed. A
 * self-hoster forks this folder and edits two things: BASE_URL here and
 * the allowlist entry in appsscript.json. Shipping a settings field that
 * silently fails would be worse than shipping no field at all.
 *
 * Not a secret: nothing here is a credential. The user's API key lives
 * in UserProperties (see auth.js) and is never written to a source file.
 */

/**
 * Development switch. Apps Script cannot reach localhost, so the add-on
 * is developed against the tunnelled dev CRM instead.
 *
 * MUST BE false IN ANY PUSH THAT BECOMES A VERSION — a version is what
 * the Marketplace publishes, and a published add-on pointed at a laptop
 * tunnel would break for every user the moment that tunnel closes.
 *
 * BOTH HOSTS STAY IN THE MANIFEST ALLOWLIST, on purpose. The allowlist is
 * only a permission to fetch, not a choice of target — this flag is the
 * choice. Keeping the dev host listed means switching environments is a
 * one-line edit here plus `clasp push`, with no manifest churn, and no
 * risk of publishing a version whose allowlist forgot the host it is
 * actually pointed at. Flipping this flag is safe for published users
 * either way: a version is an immutable snapshot, so pushing dev code to
 * the editor cannot reach anyone running the published version.
 *
 * The sidebar footer reads " · dev" when this is true (see IS_DEV), so a
 * spreadsheet never leaves you guessing which CRM it is talking to.
 */
const REPLAI_DEV = false;

const ReplaiConfig = {
  /**
   * Origin of the CRM this add-on talks to. Both values are allowlisted in
   * appsscript.json, so only REPLAI_DEV decides which one is used.
   */
  BASE_URL: REPLAI_DEV
    ? 'https://devcrm.junkiescoder.com'
    : 'https://wacrm.junkiescoder.com',

  /**
   * Exposed so the UI can label a dev build. Reading REPLAI_DEV straight
   * from a template would work, but going through the config object keeps
   * every environment decision answerable from this one file.
   */
  IS_DEV: REPLAI_DEV,

  /** Public API prefix. Every call is BASE_URL + API_PREFIX + path. */
  API_PREFIX: '/api/v1',

  /**
   * The product name, rendered ONCE — by the sidebar's own header in
   * ui/Sidebar.html, next to the logo.
   *
   * Deliberately not also passed to showSidebar's setTitle: Sheets draws
   * that heading outside our iframe where no logo or button can go, and
   * setting it there as well is what printed the name twice.
   */
  PRODUCT_NAME: 'Replai',
  ADDON_NAME: 'WhatsApp Sender & Automation',

  /**
   * Brand mark for the sidebar toolbar.
   *
   * Remote rather than inlined: an HtmlService page is served from Google's
   * sandbox with no way to bundle a binary, and a data-URI PNG would bloat
   * every sidebar open. Loaded by the browser, so it needs no entry in
   * appsscript.json's urlFetchWhitelist — that allowlist governs
   * UrlFetchApp, not <img>. The tile keeps its brand-green background, so a
   * blocked or slow image degrades to a coloured square rather than a gap.
   */
  LOGO_URL:
    'https://replai-jc.s3.us-east-1.amazonaws.com/public-assets/favicon_url/1786429136010-3oni29ed23h.png',

  /**
   * Bumped by hand on every push worth telling apart. Travels on each
   * request as X-Replai-Client AND is shown in the sidebar footer.
   *
   * The footer is the point. Apps Script gives no indication of which
   * version of the code a spreadsheet is running, so "did my push
   * actually land?" is otherwise unanswerable — and it is the first
   * question whenever a rule does not fire. Reading a version off the
   * sidebar settles it in a second.
   */
  VERSION: '1.2.0',

  /**
   * Structural prefix on every CRM API key (src/lib/api-keys/keys.ts).
   * Used only for a cheap client-side reject of an obviously wrong
   * paste — the server is still the only real authority on validity.
   */
  KEY_PREFIX: 'wacrm_live_',

  /** Scope the add-on cannot function without. Checked at setup time. */
  REQUIRED_SCOPE: 'broadcasts:send',

  /**
   * Deep link to the CRM tab that mints keys. Confirmed route:
   * src/app/(dashboard)/settings/page.tsx maps ?tab=api → ApiKeysSettings.
   */
  API_KEYS_PATH: '/settings?tab=api',

  /**
   * Marketing/help page for the add-on, and the Homepage URL on the
   * Marketplace listing. The flag exists so the link can be hidden
   * rather than sending a first-time user to a 404; it is on because
   * the route now ships. Turn it off again only if the page is pulled.
   */
  HOMEPAGE_PATH: '/integrations/google-sheets',
  HOMEPAGE_ENABLED: true,

  /** Absolute URL helper for links rendered in the UI. */
  url: function (path) {
    return ReplaiConfig.BASE_URL + path;
  },
};
