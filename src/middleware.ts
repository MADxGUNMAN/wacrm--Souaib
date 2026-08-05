import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings', '/super-admin']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // ── Super Admin access control ──────────────────────────────────────
  // Super admins are platform operators. They must NOT access the normal
  // CRM dashboard. Conversely, normal users must NOT access /super-admin.
  const crmPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings']
  const isSuperAdminPath = request.nextUrl.pathname.startsWith('/super-admin')
  const isCrmPath = crmPaths.some(path => request.nextUrl.pathname.startsWith(path))

  if (user && (isSuperAdminPath || isCrmPath)) {
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('account_id, is_super_admin')
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

      // Ban check — only for non-super-admin users on CRM paths
      if (!isSuperAdmin && isCrmPath && profileRow?.account_id) {
        const { data: accountRow } = await supabase
          .from('accounts')
          .select('is_banned')
          .eq('id', profileRow.account_id)
          .maybeSingle()

        if (accountRow?.is_banned) {
          const url = request.nextUrl.clone()
          url.pathname = '/banned'
          url.search = ''
          return withRefreshedCookies(NextResponse.redirect(url))
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
