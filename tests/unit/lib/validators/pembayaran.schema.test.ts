import { describe, it, expect } from 'vitest'
import {
  pembayaranManualCreateSchema,
  pembayaranUpdateSchema,
} from '@/lib/validators/pembayaran.schema'

const validCreate = {
  siswaId: 'siswa001',
  periodYear: 2025,
  periodMonth: 7,
  amount: 350000,
  biayaAdm: 0,
  tanggalTransaksi: new Date('2025-07-15'),
}

describe('pembayaranManualCreateSchema', () => {
  it('accepts valid input', () => {
    const result = pembayaranManualCreateSchema.safeParse(validCreate)
    expect(result.success).toBe(true)
  })

  it('accepts valid input with optional fields', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      kodeCabang: 'BPD-01',
      catatan: 'Pembayaran tunai',
    })
    expect(result.success).toBe(true)
  })

  it('fails when periodMonth is 0', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodMonth: 0,
    })
    expect(result.success).toBe(false)
  })

  it('fails when periodMonth is 13', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodMonth: 13,
    })
    expect(result.success).toBe(false)
  })

  it('accepts periodMonth at boundary 1', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodMonth: 1,
    })
    expect(result.success).toBe(true)
  })

  it('accepts periodMonth at boundary 12', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodMonth: 12,
    })
    expect(result.success).toBe(true)
  })

  it('fails when periodYear is below 2000', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodYear: 1999,
    })
    expect(result.success).toBe(false)
  })

  it('fails when periodYear is above 2100', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodYear: 2101,
    })
    expect(result.success).toBe(false)
  })

  it('accepts periodYear at boundary 2000', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      periodYear: 2000,
    })
    expect(result.success).toBe(true)
  })

  it('fails when amount is negative', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      amount: -1,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.flatten().fieldErrors.amount?.join(' ')
      expect(msg).toMatch(/negatif/)
    }
  })

  it('accepts amount of 0 (free/waived)', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      amount: 0,
    })
    expect(result.success).toBe(true)
  })

  it('fails when amount exceeds max', () => {
    const result = pembayaranManualCreateSchema.safeParse({
      ...validCreate,
      amount: 1_000_000_001,
    })
    expect(result.success).toBe(false)
  })
})

describe('pembayaranUpdateSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = pembayaranUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts valid catatan', () => {
    const result = pembayaranUpdateSchema.safeParse({ catatan: 'Sudah dicek' })
    expect(result.success).toBe(true)
  })

  it('accepts null catatan', () => {
    const result = pembayaranUpdateSchema.safeParse({ catatan: null })
    expect(result.success).toBe(true)
  })

  it('fails when catatan exceeds max length', () => {
    const result = pembayaranUpdateSchema.safeParse({
      catatan: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid kodeCabang', () => {
    const result = pembayaranUpdateSchema.safeParse({ kodeCabang: 'BPD-01' })
    expect(result.success).toBe(true)
  })
})
