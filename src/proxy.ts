// ============================================================
// Proxy — runs before every matched request.
//
// This was `middleware.ts` until Next.js 16 renamed the convention to
// `proxy` (the old name invited confusion with Express middleware). The
// file must export a function named `proxy` (or a default export); the
// `config.matcher` below is unchanged.
//
// Responsibilities, in order:
//   1. Refresh the Supabase session and — critically — carry the rotated
//      auth cookies onto every response we return (see issue #288).
//   2. Bounce signed-in users off the landing/auth pages.
//   3. Require auth on protected pages.
//   4. Keep super admins and CRM users in their own halves of the app.
//   5. Enforce account bans and the subscription gate, for pages AND
//      API routes.
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getCachedGateConfig } from '@/lib/subscription/gate-cache'
import { resolveSubscriptionState } from '@/lib/subscription/status'

// ============================================================
// Subscription gate — API allowlist
//
// When an account's trial/subscription has lapsed we block its API
// surface as well as its pages. A redirect is meaningless to a fetch()
// call, so without this a lapsed account could still drive the whole
// CRM from the browser console with a valid session cookie.
//
// These prefixes stay reachable while blocked:
//   /api/billing      — MUST work, or the account could never pay to
//                       recover. This is the escape hatch.
//   /api/super-admin  — platform operators are never gated.
//   /api/invitations  — accepting an invite is how a user LEAVES a dead
//                       workspace for a live one.
//   /api/contact      — public marketing form, no account context.
//   /api/health       — uptime monitoring must not depend on billing.
//   /api/v1           — authenticated by API key, not cookies, so it
//                       never reaches this gate anyway (no `user`).
//                       Listed explicitly so the omission reads as a
//                       decision rather than an oversight.
//   /api/whatsapp/webhook — Meta's callbacks carry no session. Inbound
//                       messages keep landing while an account is
//                       blocked; only outbound is cut off.
//
// Everything else under /api (account, ai, automations, contacts,
// flows, quick-replies, the rest of whatsapp) is gated.
// ============================================================
const UNGATED_API_PREFIXES = [
  '/api/billing',
  '/api/super-admin',
  '/api/invitations',
  '/api/contact',
  '/api/health',
  '/api/v1',
  '/api/whatsapp/webhook',
] as const

function isUngatedApiPath(pathname: string): boolean {
  return UNGATED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Request cookies carry no options — only the outgoing response
          // cookies below need them.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Landing page — logged-in users should never see it.
  // Super admins go to /super-admin, CRM users go to /dashboard.
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .maybeSingle()

      url.pathname = profile?.is_super_admin ? '/super-admin' : '/dashboard'
    } catch {
      url.pathname = '/dashboard'
    }
    url.search = ''
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      // Check if this user is a super admin — if so, redirect to /super-admin
      const { data: saCheck } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .maybeSingle()

      url.pathname = saCheck?.is_super_admin ? '/super-admin' : '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated.
  // `/upgrade-plan` and `/subscription-required` are included so a
  // signed-out visitor gets bounced to login, but they are deliberately
  // NOT in `crmPaths` below — they are the destinations of the
  // subscription gate, so gating them would loop forever.
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/templates', '/automations', '/settings', '/super-admin', '/upgrade-plan', '/subscription-required']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // ── Super Admin access control ──────────────────────────────────────
  // Super admins are platform operators. They must NOT access the normal
  // CRM dashboard. Conversely, normal users must NOT access /super-admin.
  const crmPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/templates', '/automations', '/settings']
  const isSuperAdminPath = request.nextUrl.pathname.startsWith('/super-admin')
  const isCrmPath = crmPaths.some(path => request.nextUrl.pathname.startsWith(path))
  // API requests that the subscription gate applies to. Separated from
  // the page paths because an API caller needs a JSON 403, not a 307 to
  // an HTML page it cannot render.
  const isGatedApiPath =
    request.nextUrl.pathname.startsWith('/api/') &&
    !isUngatedApiPath(request.nextUrl.pathname)

  if (user && (isSuperAdminPath || isCrmPath || isGatedApiPath)) {
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        // account_role decides WHERE a blocked user lands: only the owner
        // can pay, so members go to their own screen rather than a
        // pricing page with a button they're not allowed to use.
        .select('account_id, is_super_admin, account_role')
        .eq('user_id', user.id)
        .maybeSingle()

      const isSuperAdmin = profileRow?.is_super_admin === true

      // Super admin trying to access CRM → redirect to /super-admin
      if (isSuperAdmin && isCrmPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/super-admin'
        url.search = ''
        return withRefreshedCookies(NextResponse.redirect(url))
      }

      // Non-super-admin trying to access /super-admin → redirect to /dashboard
      if (!isSuperAdmin && isSuperAdminPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        url.search = ''
        return withRefreshedCookies(NextResponse.redirect(url))
      }

      // Ban + subscription checks — non-super-admins only.
      //
      // Both read the same `accounts` row, so they share one query. The
      // subscription columns come along for free here, which is why the
      // gate costs no extra round trip on top of the ban check that was
      // already happening.
      if (!isSuperAdmin && profileRow?.account_id) {
        const { data: accountRow } = await supabase
          .from('accounts')
          .select('is_banned, subscription_status, trial_ends_at, subscription_ends_at')
          .eq('id', profileRow.account_id)
          .maybeSingle()

        // A platform-level ban outranks billing: don't send a banned
        // account to a payment page, since paying wouldn't help.
        if (accountRow?.is_banned) {
          if (isGatedApiPath) {
            return withRefreshedCookies(
              NextResponse.json(
                { error: 'This workspace has been suspended', code: 'account_banned' },
                { status: 403 },
              ),
            )
          }
          const url = request.nextUrl.clone()
          url.pathname = '/banned'
          url.search = ''
          return withRefreshedCookies(NextResponse.redirect(url))
        }

        // Subscription gate. `resolveSubscriptionState` derives the live
        // verdict from the timestamps rather than trusting
        // `subscription_status`, which goes stale because nothing flips
        // it when a date passes.
        const gate = await getCachedGateConfig()
        const state = resolveSubscriptionState(accountRow, gate)

        if (state.isBlocked) {
          if (isGatedApiPath) {
            return withRefreshedCookies(
              NextResponse.json(
                {
                  error: 'This workspace needs an active subscription to continue',
                  code: 'subscription_required',
                },
                { status: 403 },
              ),
            )
          }

          if (isCrmPath) {
            const url = request.nextUrl.clone()
            url.pathname =
              profileRow.account_role === 'owner'
                ? '/upgrade-plan'
                : '/subscription-required'
            url.search = ''
            return withRefreshedCookies(NextResponse.redirect(url))
          }
        }
      }
    } catch {
      // If the check fails, let the user through — the client-side
      // shell has a fallback that will catch it too.
    }
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
