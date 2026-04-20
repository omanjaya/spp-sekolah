import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { rateLimit } from '@/lib/rate-limit'

describe('rateLimit', () => {
  describe('constructor validation', () => {
    it('throws when max <= 0', () => {
      expect(() => rateLimit({ max: 0, windowMs: 1000 })).toThrow('max must be > 0')
    })

    it('throws when max is negative', () => {
      expect(() => rateLimit({ max: -1, windowMs: 1000 })).toThrow('max must be > 0')
    })

    it('throws when windowMs <= 0', () => {
      expect(() => rateLimit({ max: 5, windowMs: 0 })).toThrow('windowMs must be > 0')
    })

    it('throws when windowMs is negative', () => {
      expect(() => rateLimit({ max: 5, windowMs: -100 })).toThrow('windowMs must be > 0')
    })

    it('does not throw with valid options', () => {
      expect(() => rateLimit({ max: 5, windowMs: 1000 })).not.toThrow()
    })
  })

  describe('check()', () => {
    let limiter: ReturnType<typeof rateLimit>

    beforeEach(() => {
      limiter = rateLimit({ max: 3, windowMs: 60_000 })
    })

    it('allows first request and returns remaining = max - 1', () => {
      const result = limiter.check('user1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('allows requests under the limit', () => {
      limiter.check('user1') // 1st
      const result = limiter.check('user1') // 2nd
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })

    it('allows request at max - 1 with 0 remaining', () => {
      limiter.check('user1') // 1
      limiter.check('user1') // 2
      const result = limiter.check('user1') // 3 (at max)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(0)
    })

    it('blocks request at limit (count >= max)', () => {
      limiter.check('user1') // 1
      limiter.check('user1') // 2
      limiter.check('user1') // 3 — at limit
      const result = limiter.check('user1') // 4 — over limit
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('different keys are independent', () => {
      limiter.check('user1')
      limiter.check('user1')
      limiter.check('user1')
      const blocked = limiter.check('user1')
      expect(blocked.allowed).toBe(false)

      const fresh = limiter.check('user2')
      expect(fresh.allowed).toBe(true)
    })

    it('remaining decrements correctly across multiple calls', () => {
      const r1 = limiter.check('key')
      const r2 = limiter.check('key')
      const r3 = limiter.check('key')
      expect(r1.remaining).toBe(2)
      expect(r2.remaining).toBe(1)
      expect(r3.remaining).toBe(0)
    })

    it('returns a resetAt in the future', () => {
      const before = Date.now()
      const result = limiter.check('key')
      expect(result.resetAt).toBeGreaterThan(before)
    })
  })

  describe('check() with fake timers', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('resets after window expires', () => {
      vi.useFakeTimers()
      const limiter = rateLimit({ max: 2, windowMs: 5_000 })

      limiter.check('key') // 1
      limiter.check('key') // 2 — at max
      const blocked = limiter.check('key')
      expect(blocked.allowed).toBe(false)

      // Advance past the window
      vi.advanceTimersByTime(5_001)

      const afterReset = limiter.check('key')
      expect(afterReset.allowed).toBe(true)
      expect(afterReset.remaining).toBe(1)
    })
  })

  describe('reset()', () => {
    it('clears a specific key allowing requests again', () => {
      const limiter = rateLimit({ max: 2, windowMs: 60_000 })
      limiter.check('user1')
      limiter.check('user1')
      const blocked = limiter.check('user1')
      expect(blocked.allowed).toBe(false)

      limiter.reset('user1')

      const afterReset = limiter.check('user1')
      expect(afterReset.allowed).toBe(true)
    })

    it('does not affect other keys', () => {
      const limiter = rateLimit({ max: 1, windowMs: 60_000 })
      limiter.check('user1')
      limiter.check('user2')

      limiter.reset('user1')

      const user2Blocked = limiter.check('user2')
      expect(user2Blocked.allowed).toBe(false)

      const user1Fresh = limiter.check('user1')
      expect(user1Fresh.allowed).toBe(true)
    })
  })

  describe('clear()', () => {
    it('resets all keys', () => {
      const limiter = rateLimit({ max: 1, windowMs: 60_000 })
      limiter.check('user1')
      limiter.check('user2')
      limiter.check('user3')

      limiter.clear()

      expect(limiter.check('user1').allowed).toBe(true)
      expect(limiter.check('user2').allowed).toBe(true)
      expect(limiter.check('user3').allowed).toBe(true)
    })
  })
})
