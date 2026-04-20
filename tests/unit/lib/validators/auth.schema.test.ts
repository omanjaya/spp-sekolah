import { describe, it, expect } from 'vitest'
import { loginSchema } from '@/lib/validators/auth.schema'

describe('loginSchema', () => {
  it('accepts valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'securepass1',
    })
    expect(result.success).toBe(true)
  })

  it('lowercases the email', () => {
    const result = loginSchema.safeParse({
      email: 'ADMIN@EXAMPLE.COM',
      password: 'securepass1',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('admin@example.com')
    }
  })

  it('fails when email is missing', () => {
    const result = loginSchema.safeParse({
      password: 'securepass1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors
      expect(fields.email).toBeDefined()
    }
  })

  it('fails when email is empty string', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'securepass1',
    })
    expect(result.success).toBe(false)
  })

  it('fails when email is not a valid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'securepass1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.flatten().fieldErrors.email?.join(' ')
      expect(msg).toMatch(/email/i)
    }
  })

  it('fails when password is missing', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors
      expect(fields.password).toBeDefined()
    }
  })

  it('fails when password is too short (< 10 chars)', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'short',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.flatten().fieldErrors.password?.join(' ')
      expect(msg).toMatch(/karakter/)
    }
  })

  it('accepts password exactly at min length', () => {
    // PASSWORD_POLICY.MIN_LENGTH = 10
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: '1234567890',
    })
    expect(result.success).toBe(true)
  })
})
