import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Baseline security headers applied to every response.
 *
 * CSP ships as `Content-Security-Policy-Report-Only` so the browser
 * surfaces violations in the console without blocking anything — once
 * we have confidence nothing legit trips it (two deploys, a pass on
 * every route), flip the key to `Content-Security-Policy` to enforce.
 *
 * The rest of the headers are straight blocks, safe to enforce today:
 *   - HSTS: only meaningful on HTTPS (no-op on http://localhost).
 *   - X-Content-Type-Options / X-Frame-Options / Referrer-Policy:
 *     baseline OWASP hardening, no behavioural cost.
 *   - Permissions-Policy: deny every powerful feature except the two the
 *     app actually uses, and allow those for same-origin only. A
 *     supply-chain compromise or a forgotten plugin can't silently opt
 *     back in. Read the note on that entry before tightening it —
 *     denying a feature the UI offers produces a permission error the
 *     user cannot possibly grant.
 */
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Two features are allowed for SAME-ORIGIN only (`self`), because the
    // inbox genuinely uses them:
    //   microphone  — voice notes via MediaRecorder
    //   geolocation — "Use my current location" in the Send Location Pin
    //                 dialog
    //
    // `geolocation=()` denies it for EVERY origin including our own, and
    // the browser then rejects getCurrentPosition with PERMISSION_DENIED
    // *without ever showing a prompt*. That is unfixable from the user's
    // side: no Chrome site setting and no Windows privacy toggle can
    // override a header the site itself sent. It cost a round of "the
    // button is broken" / "check your browser settings" on 20 Aug 2026,
    // because the symptom is identical to a genuinely blocked permission.
    //
    // `(self)` is not the same as removing the entry: an embedded
    // third-party iframe still gets nothing.
    //
    // `payment` is the one exception to "same-origin only". Razorpay
    // Checkout runs in an iframe from api.razorpay.com and may use the
    // Payment Request API inside it (UPI apps, saved wallets). Unlike the
    // CSP below, this header is ENFORCED, so `payment=()` would silently
    // break those methods with no console error on our page. Only
    // Razorpay's two Checkout origins are added; no other frame gets it.
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(self), geolocation=(self), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), usb=()',
  },
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its inline hydration script
      // and 'unsafe-eval' in dev + some production optimisations.
      // Nonce-based CSP is a later project.
      //
      // checkout.razorpay.com serves Razorpay Checkout's loader script,
      // fetched on demand by the payment page only. The loader then adds
      // its risk-detection bundle from cdn.razorpay.com to OUR page
      // (seen as a Report-Only violation in the Phase 2 browser check).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com",
      // Tailwind + inline style attributes on lots of components.
      "style-src 'self' 'unsafe-inline'",
      // Supabase public-bucket avatars, contact avatars (arbitrary
      // https URLs paste-able from the UI), OG images, data URLs for
      // tiny inline assets.
      "img-src 'self' data: blob: https:",
      // Outbound media previews (blob: from MediaRecorder + file picker)
      // and Supabase public-bucket audio/video the inbox renders.
      //
      // `*.amazonaws.com` covers the S3 bucket that serves uploaded
      // landing assets — the hero background video is loaded straight
      // from `getS3PublicUrl()`, whose host is built from the bucket and
      // region env vars, so it cannot be spelled out literally here.
      // Without this the hero video logs a CSP violation on every
      // landing-page load; it still plays only because this header is
      // Report-Only, and would break the moment CSP is enforced.
      "media-src 'self' blob: https://*.supabase.co https://*.amazonaws.com",
      "font-src 'self' data:",
      // Supabase REST + realtime (WSS). All Meta API calls happen
      // server-side, so graph.facebook.com does not belong here.
      //
      // S3 IS needed: every upload goes browser → presigned PUT → S3
      // directly (the bytes deliberately never pass through this server),
      // so the XHR in upload-media.ts and in the support-chat attachment
      // stager are cross-origin requests to *.amazonaws.com. Without this
      // they are violations today — silent, because the header ships as
      // Report-Only — and would become hard failures the moment it is
      // enforced, breaking every attachment and avatar upload.
      //
      // Razorpay: the Checkout loader talks to api.razorpay.com and sends
      // its own telemetry to lumberjack.razorpay.com from our page. The
      // fraud and bot checks Checkout uses (hCaptcha, Sardine, Stripe
      // Radar, Sentry) run INSIDE Razorpay's iframe under Razorpay's own
      // CSP, so they are deliberately not listed here (Phase 0 report §4).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.amazonaws.com https://api.razorpay.com https://lumberjack.razorpay.com",
      // Razorpay Checkout's modal is an iframe. Without this directive
      // frames fall back to default-src 'self'; that stays, plus Razorpay.
      // (The auto-mail preview is a srcdoc iframe, which this does not
      // affect.)
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
] as const;

const nextConfig: NextConfig = {
  /**
   * Standalone output mode.
   *
   * Produces a self-contained `.next/standalone/server.js` that bundles
   * only the node_modules actually imported — no need to ship the full
   * `node_modules/` tree into the Docker image. The Dockerfile copies
   * `standalone/`, `.next/static/`, and `public/` into the final layer.
   */
  output: 'standalone',

  /**
   * Build output directory, overridable per invocation.
   *
   * `next build` and `next dev` share `.next` by default, and a build run
   * while a dev server is live overwrites the manifests that server is
   * using. The dev server then keeps answering page requests from memory
   * while its route table goes stale — API route handlers start coming
   * back as 404 "Server action not found." even though the files are
   * present and compile fine. Nothing in the code looks wrong, which is
   * what makes it expensive to diagnose (see the Turbopack cache note on
   * the headers() block below for the sibling version of this problem).
   *
   * So: verification builds pass NEXT_DIST_DIR and land somewhere else,
   * leaving a running dev server untouched. Default is unchanged, so
   * CI, Docker and `npm run build` on a clean tree behave exactly as
   * before.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * Cross-origin dev access (Next.js 16).
   *
   * Next 16 blocks requests to dev-only resources (`/_next/*` internals,
   * the HMR websocket, the dev overlay) unless the browser's Origin is
   * the host the dev server booted on — `localhost` by default. Tunnels
   * like ngrok serve the app from a public HTTPS host, so without
   * allow-listing that host those dev requests come back 403: HMR stops
   * working and the dev session degrades over the tunnel (issue #365).
   *
   * Wildcards match subdomains only (Next's CSRF matcher), so the
   * randomised tunnel subdomain is covered. Add any other host via
   * `ALLOWED_DEV_ORIGINS` (comma-separated). This key is dev-only and
   * has no effect on a production build.
   */
  allowedDevOrigins: [
    '*.ngrok-free.app',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.ngrok.io',
    '*.trycloudflare.com',
    '*.junkiescoder.com',
    '*.loca.lt',
    ...(process.env.ALLOWED_DEV_ORIGINS
      ? process.env.ALLOWED_DEV_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : []),
  ],

  /**
   * Cache-Control policy.
   *
   * Why this exists:
   *   Hostinger's CDN was applying `s-maxage=31536000` (1 year) to
   *   prerendered HTML pages by default. When a new deploy shipped
   *   fresh Turbopack chunk hashes, the edge kept serving year-old
   *   HTML referencing chunk filenames that no longer existed on
   *   disk — result: HTML 200, every /_next/static/*.js and .css
   *   came back 404, the page rendered unstyled. Private/incognito
   *   did nothing because the cache is server-side.
   *
   * Strategy:
   *   - /_next/static/* — leave to Next. Turbopack dev chunks can go
   *     stale if we force immutable caching here; Next already emits
   *     the correct production headers for hashed assets.
   *   - /api/*          — no-store. API responses are per-user and
   *     must never be shared across requests at the edge.
   *   - Everything else — public, brief s-maxage + generous
   *     stale-while-revalidate. The edge serves instantly from cache
   *     for the first 5 min, then returns cached content while
   *     refreshing in the background for up to 24 h. A deploy's
   *     chunk-hash drift self-heals within ~5 min with no user-
   *     visible latency.
   *
   *   Note: dynamic dashboard routes (/inbox, /contacts, /pipelines,
   *   /broadcasts, etc.) are server-rendered per request — Next.js
   *   and Supabase auth already prevent them from being served
   *   from a shared cache. The s-maxage here is a ceiling; Next.js
   *   and auth middleware still set `private` / `no-store` for
   *   per-user responses.
   *
   * Security headers are appended via a separate catch-all rule
   * below — Next.js merges headers from every matching rule, so
   * they apply to every response regardless of which cache rule
   * matched.
   */
  /** Short links for the AI connector page (07 §2.1). */
  async redirects() {
    return [
      {
        source: '/integrations/claude',
        destination: '/integrations/ai',
        permanent: true,
      },
      {
        source: '/integrations/chatgpt',
        destination: '/integrations/ai',
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      /**
       * ── Why there is NO rule for /_next/static here ────────────────
       *
       * There used to be a dev-only `no-store` override, added to stop the
       * browser reusing stale Turbopack chunks (dev chunk filenames are
       * hashed from the module GROUP, not the contents, so a filename
       * keeps its name while its contents move on).
       *
       * It was removed because Next already does this, better. From
       * `next/dist/server/lib/router-server.js`:
       *
       *   if (!res.getHeader('cache-control') && type === 'nextStaticFolder') {
       *     if (opts.dev && !isNextFont(pathname)) {
       *       res.setHeader('Cache-Control', 'no-cache, must-revalidate')
       *     } else {
       *       res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
       *     }
       *   }
       *
       * Two things follow. First, dev chunks are already
       * `no-cache, must-revalidate` with no help from us. Second — note
       * the `!res.getHeader('cache-control')` guard — a custom header set
       * earlier in the pipeline SUPPRESSES that logic entirely, including
       * the `isNextFont` exemption Next deliberately keeps cacheable in
       * dev. So the override made things slightly worse while appearing
       * to help, and Next warns about it on boot:
       * "Setting a custom Cache-Control header can break Next.js
       * development behavior."
       *
       * Production is untouched either way: chunk names there ARE
       * content-hashed and Next emits the immutable header itself.
       */
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        // AI connector: the OAuth endpoints, the consent page and /mcp
        // carry codes, tokens and per-user content — never cacheable.
        // (The .well-known metadata routes set their own short public
        // cache in the handler.)
        source: '/oauth/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/mcp',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source:
          '/:path((?!_next/static|_next/image|api|oauth/|mcp$|\\.well-known/).*)',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: '/:path*',
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
