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

  // Auth pages - redirect to dashboard if already logged in
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    // Check if vendor — redirect to inbox instead of dashboard
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, permissions, is_active')
      .eq('user_id', user.id)
      .maybeSingle()

    // If vendor is suspended, sign them out
    if (profile?.role === 'vendor' && profile?.is_active === false) {
      // Clear auth cookies and redirect to login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'account_suspended')
      return NextResponse.redirect(url)
    }

    const url = request.nextUrl.clone()
    url.pathname = profile?.role === 'vendor' ? '/inbox' : '/dashboard'
    return NextResponse.redirect(url)
  }

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Role-based route protection for vendors
  if (user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, permissions, is_active')
      .eq('user_id', user.id)
      .maybeSingle()

    // Suspended vendor check
    if (profile?.role === 'vendor' && profile?.is_active === false) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Vendor route restrictions
    if (profile?.role === 'vendor') {
      const permissions = profile.permissions as Record<string, boolean> | null
      const currentPath = request.nextUrl.pathname

      // Map paths to permission keys
      const pathPermissionMap: Record<string, string> = {
        '/dashboard': 'dashboard',
        '/inbox': 'inbox',
        '/contacts': 'contacts',
        '/pipelines': 'pipelines',
        '/broadcasts': 'broadcasts',
        '/automations': 'automations',
        '/settings': 'settings',
      }

      const matchedPath = Object.keys(pathPermissionMap).find(path =>
        currentPath.startsWith(path)
      )

      if (matchedPath) {
        const permKey = pathPermissionMap[matchedPath]
        const hasAccess = permissions?.[permKey] === true

        if (!hasAccess) {
          // Redirect to inbox (always accessible for vendors)
          const url = request.nextUrl.clone()
          url.pathname = '/inbox'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  // API routes that need auth (not webhooks, not vendor API)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
