import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    periodeLock: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/core/errors', async () => {
  const actual = await vi.importActual('@/core/errors')
  return actual
})

import { prisma } from '@/lib/db'
import { periodeLockService } from '@/services/periode-lock.service'
import { ConflictError, NotFoundError } from '@/core/errors'

const now = new Date('2025-07-15T10:00:00Z')

function makeLockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lock-001',
    periodYear: 2025,
    periodMonth: 7,
    lockedAt: now,
    lockedById: 'user-001',
    catatan: null,
    lockedBy: { nama: 'Admin' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('periodeLockService.isLocked()', () => {
  it('returns true when record found', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce({ id: 'lock-001' } as any)

    const result = await periodeLockService.isLocked(2025, 7)

    expect(result).toBe(true)
    expect(prisma.periodeLock.findUnique).toHaveBeenCalledWith({
      where: { periodYear_periodMonth: { periodYear: 2025, periodMonth: 7 } },
      select: { id: true },
    })
  })

  it('returns false when no record found', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce(null)

    const result = await periodeLockService.isLocked(2025, 8)

    expect(result).toBe(false)
  })
})

describe('periodeLockService.lock()', () => {
  it('creates a lock and returns DTO', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.periodeLock.create).mockResolvedValueOnce(makeLockRecord() as any)

    const result = await periodeLockService.lock(2025, 7, 'user-001')

    expect(prisma.periodeLock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          periodYear: 2025,
          periodMonth: 7,
          lockedById: 'user-001',
        }),
      }),
    )
    expect(result.periodYear).toBe(2025)
    expect(result.periodMonth).toBe(7)
    expect(result.lockedById).toBe('user-001')
    expect(result.lockedByNama).toBe('Admin')
  })

  it('includes catatan when provided', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce(null)
    vi.mocked(prisma.periodeLock.create).mockResolvedValueOnce(
      makeLockRecord({ catatan: 'Audit bulanan' }) as any,
    )

    const result = await periodeLockService.lock(2025, 7, 'user-001', 'Audit bulanan')

    expect(prisma.periodeLock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ catatan: 'Audit bulanan' }),
      }),
    )
    expect(result.catatan).toBe('Audit bulanan')
  })

  it('throws ConflictError when period is already locked', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce({ id: 'lock-001' } as any)

    await expect(
      periodeLockService.lock(2025, 7, 'user-001'),
    ).rejects.toThrow(ConflictError)
  })

  it('ConflictError message contains year/month', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce({ id: 'lock-001' } as any)

    await expect(
      periodeLockService.lock(2025, 7, 'user-001'),
    ).rejects.toThrow('2025/07')
  })
})

describe('periodeLockService.unlock()', () => {
  it('calls delete when record found', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce({ id: 'lock-001' } as any)
    vi.mocked(prisma.periodeLock.delete).mockResolvedValueOnce({} as any)

    await periodeLockService.unlock(2025, 7)

    expect(prisma.periodeLock.delete).toHaveBeenCalledWith({
      where: { periodYear_periodMonth: { periodYear: 2025, periodMonth: 7 } },
    })
  })

  it('throws NotFoundError when period is not locked', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce(null)

    await expect(
      periodeLockService.unlock(2025, 8),
    ).rejects.toThrow(NotFoundError)
  })

  it('NotFoundError message contains year/month', async () => {
    vi.mocked(prisma.periodeLock.findUnique).mockResolvedValueOnce(null)

    await expect(
      periodeLockService.unlock(2025, 9),
    ).rejects.toThrow('2025/09')
  })
})

describe('periodeLockService.list()', () => {
  it('returns sorted list of lock DTOs', async () => {
    const locks = [
      makeLockRecord({ id: 'lock-002', periodYear: 2025, periodMonth: 8 }),
      makeLockRecord({ id: 'lock-001', periodYear: 2025, periodMonth: 7 }),
    ]
    vi.mocked(prisma.periodeLock.findMany).mockResolvedValueOnce(locks as any)

    const result = await periodeLockService.list()

    expect(prisma.periodeLock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      }),
    )
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('lock-002')
    expect(result[1]!.id).toBe('lock-001')
  })

  it('returns empty array when no locks exist', async () => {
    vi.mocked(prisma.periodeLock.findMany).mockResolvedValueOnce([])

    const result = await periodeLockService.list()

    expect(result).toEqual([])
  })
})
