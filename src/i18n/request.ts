import { getRequestConfig } from 'next-intl/server';

import messages from '../../messages/en.json';

/**
 * next-intl request config.
 *
 * ─── Why this is hardcoded to English ─────────────────────────────
 *
 * This used to read `process.env.NEXT_PUBLIC_APP_LOCALE` and dynamically
 * import `messages/<locale>.json`, with a try/catch falling back to
 * English. It looked like working multi-locale support. It was not:
 *
 *   1. `NEXT_PUBLIC_*` values are INLINED BY THE BUNDLER at build time,
 *      not read at runtime. The locale was therefore baked into the Docker
 *      image — changing the env var on the server did nothing, and
 *      switching language would have required a rebuild and redeploy.
 *   2. Because the value was a constant by the time bundling happened,
 *      only the English dictionary was ever emitted. Verified against two
 *      builds: `messages_en_json` appeared as a server chunk, `ko` did not
 *      exist in either. The `catch` branch was unreachable and the Korean
 *      file was dead weight.
 *
 * So the previous code promised something it could not do, in the most
 * expensive way: a reader would reasonably assume setting one env var
 * localises the app. `messages/ko.json` has been deleted along with it.
 *
 * ─── Adding a real second language later ──────────────────────────
 *
 * Do NOT reintroduce the env var. Use next-intl's routing properly: a
 * `[locale]` path segment (or a cookie) resolved per REQUEST, which is
 * what makes the dictionary a runtime choice and gets every locale
 * bundled. Static import here is deliberate — it keeps the one dictionary
 * we actually ship in the server bundle rather than traced off disk.
 */
export default getRequestConfig(async () => ({
  locale: 'en',
  messages,
}));
