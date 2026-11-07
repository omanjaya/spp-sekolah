import { createHash, timingSafeEqual } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { prisma } from '@/lib/db'
import logger from '@/lib/logger'
import { rateLimit, type RateLimiter } from '@/lib/rate-limit'

/**
 * Autentikasi + pembatasan untuk API integrasi bendahara (antarpeladen).
 *
 * Token disimpan sebagai hash SHA-256 di konfigurasi server (env), tidak di DB:
 *
 *   BENDAHARA_API_TOKENS="<tokenId>:<schoolId>:<sha256hex>[,<tokenId>:<schoolId>:<sha256hex>...]"
 *
 * Token plaintext berbentuk `sppbdh_<tokenId>_<64 hex>` dan hanya ditampilkan
 * sekali saat dibuat (scripts/bendahara-token.sh). Mencabut token = menghapus
 * entrinya dari env lalu me-recreate container app.
 *
 * Setiap token hanya punya akses baca dan terikat ke satu `schoolId`; instance
 * ini melayani satu sekolah (`BENDAHARA_SCHOOL_ID`, fallback Setting
 * `school.npsn`). Token untuk sekolah lain ditolak 403.
 */

export const BENDAHARA_SCOPES = ['payments:read'] as const

const TOKEN_RE = /^sppbdh_([a-z0-9-]{3,32})_([0-9a-f]{64})$/
const DEFAULT_RATE_PER_MINUTE = 120
const AUTH_FAILURE_PER_MINUTE = 20

export class IntegrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export interface IntegrationClient {
  tokenId: string
  schoolId: string
  scopes: ReadonlyArray<string>
}

interface TokenEntry {
  tokenId: string
  schoolId: string
  hash: Buffer
}

function parseTokenConfig(raw: string | undefined): Map<string, TokenEntry> {
  const out = new Map<string, TokenEntry>()
  if (!raw) return out
  for (const part of raw.split(',')) {
    const entry = part.trim()
    if (!entry) continue
    const [tokenId, schoolId, hashHex] = entry.split(':')
    if (!tokenId || !schoolId || !hashHex || !/^[0-9a-f]{64}$/i.test(hashHex)) {
      logger.warn({ entry: entry.slice(0, 40) }, 'integration.bendahara: entri BENDAHARA_API_TOKENS tidak valid, diabaikan')
      continue
    }
    out.set(tokenId, { tokenId, schoolId, hash: Buffer.from(hashHex.toLowerCase(), 'hex') })
  }
  return out
}

let cachedConfig: { raw: string | undefined; tokens: Map<string, TokenEntry> } | null = null

function tokenConfig(): Map<string, TokenEntry> {
  const raw = process.env.BENDAHARA_API_TOKENS
  if (!cachedConfig || cachedConfig.raw !== raw) {
    cachedConfig = { raw, tokens: parseTokenConfig(raw) }
  }
  return cachedConfig.tokens
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

let schoolIdCache: { value: string; expiresAt: number } | null = null

/** ID sekolah yang dilayani instance ini. */
export async function instanceSchoolId(): Promise<string> {
  const fromEnv = process.env.BENDAHARA_SCHOOL_ID?.trim()
  if (fromEnv) return fromEnv
  if (schoolIdCache && Date.now() < schoolIdCache.expiresAt) return schoolIdCache.value
  const row = await prisma.setting.findUnique({ where: { key: 'school.npsn' } })
  const value = typeof row?.value === 'string' ? row.value.trim() : ''
  if (!value) {
    throw new IntegrationError(503, 'NOT_CONFIGURED', 'ID sekolah belum dikonfigurasi di server.')
  }
  schoolIdCache = { value, expiresAt: Date.now() + 60_000 }
  return value
}

const limiters: { perToken: RateLimiter | null; perTokenMax: number; authFailure: RateLimiter } = {
  perToken: null,
  perTokenMax: 0,
  authFailure: rateLimit({ max: AUTH_FAILURE_PER_MINUTE, windowMs: 60_000 }),
}

function tokenLimiter(): { limiter: RateLimiter; max: number } {
  const max = Number(process.env.BENDAHARA_API_RATE_PER_MINUTE) || DEFAULT_RATE_PER_MINUTE
  if (!limiters.perToken || limiters.perTokenMax !== max) {
    limiters.perToken = rateLimit({ max, windowMs: 60_000 })
    limiters.perTokenMax = max
  }
  return { limiter: limiters.perToken, max }
}

/** Hanya untuk test. */
export function resetIntegrationLimiters(): void {
  limiters.perToken?.clear()
  limiters.authFailure.clear()
  schoolIdCache = null
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function rateLimitHeaders(max: number, remaining: number, resetAt: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  }
}

async function authenticate(
  req: NextRequest,
): Promise<{ client: IntegrationClient; headers: Record<string, string> }> {
  const ip = clientIp(req)
  const fail = (message: string): never => {
    const r = limiters.authFailure.check(ip)
    if (!r.allowed) {
      throw new IntegrationError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan autentikasi gagal. Coba lagi nanti.', {
        retryAfterSeconds: Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000)),
      })
    }
    throw new IntegrationError(401, 'UNAUTHORIZED', message)
  }

  const header = req.headers.get('authorization') ?? ''
  const bearer = /^Bearer\s+(\S+)$/i.exec(header)?.[1]
  if (!bearer) return fail('Header Authorization: Bearer <token> wajib diisi.')

  const match = TOKEN_RE.exec(bearer)
  const entry = match ? tokenConfig().get(match[1]!) : undefined
  // Bandingkan hash dengan panjang tetap (32 byte) secara constant-time.
  const presented = Buffer.from(hashToken(bearer), 'hex')
  const expected = entry?.hash ?? Buffer.alloc(32)
  if (!entry || !timingSafeEqual(presented, expected)) {
    logger.warn({ ip, tokenId: match?.[1] ?? null }, 'integration.bendahara: token ditolak')
    return fail('Token tidak valid atau sudah dicabut.')
  }

  const { limiter, max } = tokenLimiter()
  const r = limiter.check(entry.tokenId)
  const headers = rateLimitHeaders(max, r.remaining, r.resetAt)
  if (!r.allowed) {
    throw new IntegrationError(429, 'RATE_LIMITED', `Batas ${max} permintaan per menit terlampaui.`, {
      retryAfterSeconds: Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000)),
      headers,
    })
  }

  const schoolId = await instanceSchoolId()
  if (entry.schoolId !== schoolId) {
    logger.warn({ tokenId: entry.tokenId, tokenSchool: entry.schoolId }, 'integration.bendahara: token sekolah lain')
    throw new IntegrationError(403, 'SCHOOL_FORBIDDEN', 'Token ini tidak memiliki akses ke sekolah ini.')
  }
  const requestedSchool = req.nextUrl.searchParams.get('school_id')
  if (requestedSchool !== null && requestedSchool !== schoolId) {
    throw new IntegrationError(403, 'SCHOOL_FORBIDDEN', `Token ini hanya berlaku untuk school_id ${schoolId}.`)
  }

  return { client: { tokenId: entry.tokenId, schoolId, scopes: BENDAHARA_SCOPES }, headers }
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } }
}

/**
 * Wrapper route handler API integrasi. Handler menerima klien yang sudah
 * terautentikasi dan mengembalikan body JSON (tanpa envelope internal `/api/v1`).
 */
export function integrationHandler(
  handler: (req: NextRequest, client: IntegrationClient) => Promise<unknown>,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    let rlHeaders: Record<string, string> = {}
    try {
      const { client, headers } = await authenticate(req)
      rlHeaders = headers
      const body = await handler(req, client)
      return NextResponse.json(body, { headers: { ...BASE_HEADERS, ...rlHeaders } })
    } catch (err) {
      if (err instanceof IntegrationError) {
        const details = err.details as { retryAfterSeconds?: number; headers?: Record<string, string> } | undefined
        const headers: Record<string, string> = { ...BASE_HEADERS, ...rlHeaders, ...(details?.headers ?? {}) }
        if (details?.retryAfterSeconds) headers['Retry-After'] = String(details.retryAfterSeconds)
        if (err.status === 401) headers['WWW-Authenticate'] = 'Bearer'
        const publicDetails = err.status === 429 ? undefined : err.details
        return NextResponse.json(errorBody(err.code, err.message, publicDetails), { status: err.status, headers })
      }
      if (err instanceof ZodError) {
        const fields: Record<string, string[]> = {}
        for (const issue of err.issues) {
          const key = issue.path.join('.') || '_root'
          ;(fields[key] ??= []).push(issue.message)
        }
        return NextResponse.json(errorBody('VALIDATION_ERROR', 'Parameter tidak valid.', { fields }), {
          status: 400,
          headers: { ...BASE_HEADERS, ...rlHeaders },
        })
      }
      logger.error({ err, path: req.nextUrl.pathname }, 'integration.bendahara: unhandled error')
      return NextResponse.json(errorBody('INTERNAL_ERROR', 'Terjadi kesalahan pada server.'), {
        status: 500,
        headers: { ...BASE_HEADERS, ...rlHeaders },
      })
    }
  }
}
