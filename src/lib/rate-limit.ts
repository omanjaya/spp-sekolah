import { RATE_LIMITS } from '@/core/constants'

/**
 * Lightweight in-memory rate limiter.
 *
 * Trade-offs:
 *  - Good enough for a single-node VPS MVP with 2 active users.
 *  - State is per-process; behind a load balancer, upgrade to Redis.
 *  - No persistence — restart resets all counters, which is acceptable.
 *
 * Keep a single Map instance per limiter. `check(key)` increments and decides.
 * A lazy sweep inside `check` removes expired buckets so memory does not grow
 * unboundedly even if `cleanup` is never called explicitly.
 */

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Remaining requests in the current window after this call. */
  remaining: number
  /** Epoch millis when the current window resets. */
  resetAt: number
}

interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimiter {
  check(key: string): RateLimitResult
  reset(key: string): void
  clear(): void
}

/** Evict at most this many stale entries per call to keep `check` O(1)-ish. */
const SWEEP_BUDGET = 32

export function rateLimit(opts: RateLimitOptions): RateLimiter {
  if (opts.max <= 0) throw new Error('rateLimit: max must be > 0')
  if (opts.windowMs <= 0) throw new Error('rateLimit: windowMs must be > 0')

  const hits = new Map<string, Bucket>()

  function sweep(now: number): void {
    let budget = SWEEP_BUDGET
    for (const [k, bucket] of hits) {
      if (budget-- <= 0) break
      if (bucket.resetAt <= now) hits.delete(k)
    }
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now()
      sweep(now)

      const existing = hits.get(key)
      if (!existing || existing.resetAt <= now) {
        const bucket: Bucket = { count: 1, resetAt: now + opts.windowMs }
        hits.set(key, bucket)
        return { allowed: true, remaining: opts.max - 1, resetAt: bucket.resetAt }
      }

      if (existing.count >= opts.max) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt }
      }

      existing.count += 1
      return {
        allowed: true,
        remaining: Math.max(0, opts.max - existing.count),
        resetAt: existing.resetAt,
      }
    },

    reset(key: string): void {
      hits.delete(key)
    },

    clear(): void {
      hits.clear()
    },
  }
}

/** Preconfigured: 5 login attempts per minute. */
export const loginLimiter = rateLimit(RATE_LIMITS.LOGIN)

/** Preconfigured: 10 file uploads per minute. */
export const uploadLimiter = rateLimit(RATE_LIMITS.UPLOAD)

/**
 * Extract a stable client identifier for rate-limiting. Prefers the leftmost
 * value in X-Forwarded-For (set by Caddy/Nginx) and falls back to a generic
 * bucket so local dev still works. Never trust this for auth.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
