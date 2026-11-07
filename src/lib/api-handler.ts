import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, type ZodIssue } from 'zod'

import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/core/errors'
import { ERROR_CODES, HTTP_STATUS, type Role } from '@/core/constants'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import logger from '@/lib/logger'
import type { ApiErrorResponse, ApiMeta, ApiSuccess } from '@/types/api'

/**
 * Route handler wrapper for `/api/v1/*`.
 *
 * Responsibilities:
 *  - Invoke the inner handler.
 *  - On success, wrap its return value in `{ success: true, data, meta? }`.
 *  - On `AppError`, map to the standard error envelope with its statusCode.
 *  - On `ZodError`, convert into a ValidationError (400) with field errors.
 *  - On anything else, log + return a safe 500.
 *
 * The handler may either `return data` (most cases) or `return new NextResponse`
 * directly (for streaming, file downloads, etc.) — in the latter case we pass
 * the response through unchanged.
 *
 * Compatible with Next.js 15 route type validator:
 *  - Collection routes: `(req) => Response`
 *  - Dynamic routes: `(req, ctx: { params: Promise<T> }) => Response`
 */

export type RouteContext<P extends Record<string, string | string[]> = Record<string, string>> = {
  params: Promise<P>
}

export type HandlerReturn<T> =
  | T
  | { data: T; meta?: ApiMeta }
  | NextResponse
  | Response

function isEnveloped<T>(value: unknown): value is { data: T; meta?: ApiMeta } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in (value as Record<string, unknown>) &&
    Object.keys(value as Record<string, unknown>).every((k) => k === 'data' || k === 'meta')
  )
}

function successResponse<T>(
  payload: T | { data: T; meta?: ApiMeta },
  status = HTTP_STATUS.OK,
): NextResponse {
  const body: ApiSuccess<T> = isEnveloped<T>(payload)
    ? { success: true, data: payload.data, ...(payload.meta ? { meta: payload.meta } : {}) }
    : { success: true, data: payload as T }
  return NextResponse.json(body, { status })
}

function errorResponse(err: AppError): NextResponse {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
      ...(err instanceof ValidationError && err.fields ? { fields: err.fields } : {}),
    },
  }
  return NextResponse.json(body, { status: err.statusCode })
}

function zodIssuesToFields(issues: ZodIssue[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.join('.') : '_root'
    const bucket = fields[key] ?? []
    bucket.push(issue.message)
    fields[key] = bucket
  }
  return fields
}

async function runHandler<T>(
  handler: (req: NextRequest, ctx?: RouteContext) => Promise<HandlerReturn<T>>,
  req: NextRequest,
  ctx?: RouteContext,
): Promise<Response> {
  try {
    const result = await handler(req, ctx)
    if (result instanceof NextResponse || result instanceof Response) {
      return result
    }
    return successResponse<T>(result as T | { data: T; meta?: ApiMeta })
  } catch (err) {
    if (err instanceof ZodError) {
      const ve = new ValidationError('Input tidak valid.', zodIssuesToFields(err.issues))
      return errorResponse(ve)
    }
    if (err instanceof AppError) {
      logger.warn(
        {
          code: err.code,
          status: err.statusCode,
          message: err.message,
          details: err.details,
          method: req.method,
          path: req.nextUrl?.pathname,
        },
        'apiHandler: AppError',
      )
      return errorResponse(err)
    }
    logger.error(
      {
        err,
        method: req.method,
        path: req.nextUrl?.pathname,
      },
      'apiHandler: unhandled error',
    )
    const generic = new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Terjadi kesalahan pada server. Silakan coba lagi.',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    )
    return errorResponse(generic)
  }
}

/**
 * Collection route wrapper — handler takes `(req)` only.
 *
 *   export const GET = apiHandler(async (req) => { ... })
 */
export function apiHandler<T>(
  handler: (req: NextRequest) => Promise<HandlerReturn<T>>,
): (req: NextRequest) => Promise<Response>

/**
 * Dynamic route wrapper — handler takes `(req, ctx: { params: Promise<P> })`.
 *
 *   export const GET = apiHandler<Data, { id: string }>(async (req, { params }) => {
 *     const { id } = await params
 *     ...
 *   })
 */
export function apiHandler<T, P extends Record<string, string | string[]>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<HandlerReturn<T>>,
): (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiHandler(handler: any): any {
  return (req: NextRequest, ctx?: RouteContext) => runHandler(handler, req, ctx)
}

// Status akun (aktif + role) dibaca ulang dari DB, di-cache singkat. JWT hanya
// menyimpan role saat login, jadi tanpa ini user yang dinonaktifkan / diturunkan
// role-nya tetap punya akses selama cookie masih dipakai.
// Simple TTL cache — lru-cache has Turbopack ESM resolution issues
const ACCOUNT_CACHE_TTL_MS = 30_000
const ACCOUNT_CACHE_MAX = 500
const accountCache = new Map<string, { isActive: boolean; role: Role; expiresAt: number }>()

async function loadAccount(userId: string): Promise<{ isActive: boolean; role: Role } | null> {
  const hit = accountCache.get(userId)
  if (hit && Date.now() <= hit.expiresAt) return hit
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true },
  })
  if (!user) {
    accountCache.delete(userId)
    return null
  }
  if (accountCache.size >= ACCOUNT_CACHE_MAX) {
    const oldest = accountCache.keys().next().value
    if (oldest) accountCache.delete(oldest)
  }
  const entry = { isActive: user.isActive, role: user.role as Role, expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS }
  accountCache.set(userId, entry)
  return entry
}

/**
 * Guard: require an authenticated session. Throws `UnauthorizedError` if none,
 * or if the account was deleted / deactivated after the session was issued.
 */
export async function requireAuth(): Promise<{
  userId: string
  email: string
  nama: string
  role: Role
}> {
  const session = await auth()
  if (!session?.user?.userId) {
    throw new UnauthorizedError()
  }
  const account = await loadAccount(session.user.userId)
  if (!account || !account.isActive) {
    throw new UnauthorizedError()
  }
  return {
    userId: session.user.userId,
    email: session.user.email ?? '',
    nama: session.user.nama,
    // Role terbaru dari DB, bukan yang tersimpan di token saat login.
    role: account.role,
  }
}

/**
 * Guard: require any one of `roles`. Calls `requireAuth` first.
 */
export async function requireRole(roles: ReadonlyArray<Role>): Promise<{
  userId: string
  email: string
  nama: string
  role: Role
}> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) {
    throw new ForbiddenError()
  }
  return user
}
