import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

import { ROLES, type Role } from '@/core/constants'

/**
 * Edge-safe auth + RBAC middleware.
 *
 * We use `getToken` from `next-auth/jwt` rather than the `auth()` helper
 * exported by `@/lib/auth` because the latter transitively imports Prisma
 * and bcryptjs (Node-only). `getToken` only verifies the JWT signature,
 * which works in the edge runtime.
 *
 * Protection model:
 *  - All paths are protected by default.
 *  - Paths listed in `PUBLIC_PATHS` bypass auth.
 *  - RBAC rules in `ROLE_GUARDS` are evaluated after auth.
 */

interface RoleGuard {
  /** URL path prefix to guard. */
  prefix: string
  /** Roles permitted to access. */
  allow: ReadonlyArray<Role>
}

const ROLE_GUARDS: ReadonlyArray<RoleGuard> = [
  { prefix: '/pengaturan/pengguna', allow: [ROLES.SUPER_ADMIN] },
]

/** Paths that do not require auth. */
const PUBLIC_PATH_PREFIXES: ReadonlyArray<string> = [
  '/login',
  '/api/v1/auth',
  '/api/health',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
]

function isPublic(pathname: string): boolean {
  for (const p of PUBLIC_PATH_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + '/')) return true
  }
  return false
}

function findGuard(pathname: string): RoleGuard | undefined {
  for (const g of ROLE_GUARDS) {
    if (pathname === g.prefix || pathname.startsWith(g.prefix + '/')) return g
  }
  return undefined
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone()
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search
  url.pathname = '/login'
  url.search = ''
  if (callbackUrl && callbackUrl !== '/login') {
    url.searchParams.set('callbackUrl', callbackUrl)
  }
  return NextResponse.redirect(url)
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  const token = await getToken({
    req,
    secret,
    // Match `cookies.sessionToken.name` from auth.ts for prod cookie prefix.
    secureCookie: process.env.NODE_ENV === 'production',
    cookieName:
      process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
  })

  if (!token) {
    // API requests should get 401, not an HTML redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Anda harus masuk untuk mengakses sumber daya ini.' },
        },
        { status: 401 },
      )
    }
    return redirectToLogin(req)
  }

  const role = (token as { role?: Role }).role
  const guard = findGuard(pathname)
  if (guard && (!role || !guard.allow.includes(role))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki izin untuk mengakses halaman ini.' },
        },
        { status: 403 },
      )
    }
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

/**
 * Matcher excludes:
 *  - `_next/static` and `_next/image` (Next static assets)
 *  - Common public files at the root
 * Everything else hits the middleware, where `isPublic` decides.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff|woff2|ttf|otf)$).*)',
  ],
}
