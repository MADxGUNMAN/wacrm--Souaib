/**
 * The single Graph API version this app talks to.
 *
 * This exists because the version used to be re-declared in four places
 * and had already drifted — `meta-api.ts`, `account-info` and the
 * template `sync` route were pinned to v21.0 while `embedded-signup`
 * used v23.0. A split like that is quiet but expensive: a payload shape
 * verified against one version gets sent to another, and the failure
 * shows up as a Meta rejection with no obvious cause.
 *
 * Newer template types (carousel, limited-time offer, authentication)
 * are only accepted on recent versions, so the whole app moves together.
 *
 * When bumping: check Meta's changelog for breaking changes to
 * /message_templates, /messages and the Resumable Upload API, then run
 * the template lifecycle tests — they assert the exact URLs.
 * https://developers.facebook.com/docs/graph-api/changelog
 */
export const META_API_VERSION = 'v23.0';

export const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
