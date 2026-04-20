import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    pembayaranCancelRequest: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    pembayaran: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/core/errors', async () => {
  const actual = await vi.importActual('@/core/errors')
  return actual
})

import { prisma } from '@/lib/db'
import { cancelRequestService } from '@/services/cancel-request.service'
import { ConflictError, NotFoundError } from '@/core/errors'

const now = new Date('2025-07-15T10:00:00Z')

function makeCancelRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-001',
    pembayaranId: 'pay-001',
    requestedById: 'user-001',
    alasan: 'Salah input',
    status: 'PENDING' as const,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
    pembayaran: {
      id: 'pay-001',
      periodYear: 2025,
      periodMonth: 7,
      amount: 350000,
      noBukti: null,
      statusBayar: 'TERBAYAR',
      siswa: { id: 'sis-001', nis: '001', nama: 'Test Siswa' },
    },
    requestedBy: { id: 'user-001', nama: 'Teller', email: 'teller@school.id' },
    ...overrides,
  }
}

function makePembayaran(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-001',
    siswaId: 'sis-001',
    periodYear: 2025,
    periodMonth: 7,
    amount: 350000,
    statusBayar: 'TERBAYAR',
    noBukti: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cancelRequestService.list()', () => {
  it('calls findMany and count, returns mapped results', async () => {
    const mockReq = makeCancelRequest()
    vi.mocked(prisma.pembayaranCancelRequest.findMany).mockResolvedValueOnce([mockReq] as any)
    vi.mocked(prisma.pembayaranCancelRequest.count).mockResolvedValueOnce(1)

    const result = await cancelRequestService.list({})

    expect(prisma.pembayaranCancelRequest.findMany).toHaveBeenCalledOnce()
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0]!.id).toBe('req-001')
    expect(result.items[0]!.pembayaranId).toBe('pay-001')
  })

  it('filters by status when provided', async () => {
    vi.mocked(prisma.pembayaranCancelRequest.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pembayaranCancelRequest.count).mockResolvedValueOnce(0)

    await cancelRequestService.list({ status: 'PENDING' })

    expect(prisma.pembayaranCancelRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    )
  })

  it('returns correct pagination metadata', async () => {
    vi.mocked(prisma.pembayaranCancelRequest.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pembayaranCancelRequest.count).mockResolvedValueOnce(45)

    const result = await cancelRequestService.list({ page: 2, limit: 10 })

    expect(result.page).toBe(2)
    expect(result.limit).toBe(10)
    expect(result.total).toBe(45)
    expect(result.totalPages).toBe(5)
  })
})

describe('cancelRequestService.request()', () => {
  it('creates a new cancel request', async () => {
    const mockPay = makePembayaran()
    const mockReq = makeCancelRequest()

    vi.mocked(prisma.pembayaran.findUnique).mockResolvedValueOnce(mockPay as any)
    vi.mocked(prisma.pembayaranCancelRequest.findFirst).mockResolvedValueOnce(null)
    vi.mocked(prisma.pembayaranCancelRequest.create).mockResolvedValueOnce(mockReq as any)

    const result = await cancelRequestService.request('pay-001', 'Salah input', 'user-001')

    expect(prisma.pembayaranCancelRequest.create).toHaveBeenCalledOnce()
    expect(result.id).toBe('req-001')
    expect(result.alasan).toBe('Salah input')
  })

  it('throws NotFoundError when pembayaran does not exist', async () => {
    vi.mocked(prisma.pembayaran.findUnique).mockResolvedValueOnce(null)

    await expect(
      cancelRequestService.request('pay-999', 'Alasan', 'user-001'),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when pembayaran is already DIBATALKAN', async () => {
    const mockPay = makePembayaran({ statusBayar: 'DIBATALKAN' })
    vi.mocked(prisma.pembayaran.findUnique).mockResolvedValueOnce(mockPay as any)

    await expect(
      cancelRequestService.request('pay-001', 'Alasan', 'user-001'),
    ).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError if there is already a PENDING request for the same pembayaran', async () => {
    const mockPay = makePembayaran()
    const existingReq = makeCancelRequest()

    vi.mocked(prisma.pembayaran.findUnique).mockResolvedValueOnce(mockPay as any)
    vi.mocked(prisma.pembayaranCancelRequest.findFirst).mockResolvedValueOnce(existingReq as any)

    await expect(
      cancelRequestService.request('pay-001', 'Alasan lagi', 'user-002'),
    ).rejects.toThrow(ConflictError)
  })
})

describe('cancelRequestService.reject()', () => {
  it('rejects a pending request with a review note', async () => {
    const mockReq = makeCancelRequest()
    const rejectedReq = makeCancelRequest({
      status: 'REJECTED' as const,
      reviewedById: 'admin-001',
      reviewedAt: now,
      reviewNote: 'Tidak valid',
    })

    vi.mocked(prisma.pembayaranCancelRequest.findUnique).mockResolvedValueOnce(mockReq as any)
    vi.mocked(prisma.pembayaranCancelRequest.update).mockResolvedValueOnce(rejectedReq as any)

    const result = await cancelRequestService.reject('req-001', 'admin-001', 'Tidak valid')

    expect(prisma.pembayaranCancelRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', reviewNote: 'Tidak valid' }),
      }),
    )
    expect(result.status).toBe('REJECTED')
  })

  it('throws NotFoundError when request does not exist', async () => {
    vi.mocked(prisma.pembayaranCancelRequest.findUnique).mockResolvedValueOnce(null)

    await expect(
      cancelRequestService.reject('req-999', 'admin-001', 'Alasan'),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when request is already processed', async () => {
    const approvedReq = makeCancelRequest({ status: 'APPROVED' as const })
    vi.mocked(prisma.pembayaranCancelRequest.findUnique).mockResolvedValueOnce(approvedReq as any)

    await expect(
      cancelRequestService.reject('req-001', 'admin-001', 'Alasan'),
    ).rejects.toThrow(ConflictError)
  })
})

describe('cancelRequestService.approve()', () => {
  it('calls $transaction with 2 operations (update request + cancel payment)', async () => {
    const mockReq = makeCancelRequest()
    const approvedReq = makeCancelRequest({
      status: 'APPROVED' as const,
      reviewedById: 'admin-001',
      reviewedAt: now,
    })

    vi.mocked(prisma.pembayaranCancelRequest.findUnique).mockResolvedValueOnce(mockReq as any)
    vi.mocked(prisma.pembayaranCancelRequest.update).mockResolvedValueOnce(approvedReq as any)
    vi.mocked(prisma.pembayaran.update).mockResolvedValueOnce(makePembayaran({ statusBayar: 'DIBATALKAN' }) as any)

    const mockTransaction = vi.fn().mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      if (typeof ops === 'function') return ops({ ...prisma })
      return ops
    })
    ;(prisma as unknown as { $transaction: typeof mockTransaction }).$transaction = mockTransaction

    await cancelRequestService.approve('req-001', 'admin-001')

    expect(mockTransaction).toHaveBeenCalledOnce()
    // The transaction is called with an array of 2 operations
    const [transactionArg] = mockTransaction.mock.calls[0]!
    expect(Array.isArray(transactionArg)).toBe(true)
    expect(transactionArg).toHaveLength(2)
  })

  it('throws NotFoundError when request does not exist', async () => {
    vi.mocked(prisma.pembayaranCancelRequest.findUnique).mockResolvedValueOnce(null)

    await expect(
      cancelRequestService.approve('req-999', 'admin-001'),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when request is not PENDING', async () => {
    const rejectedReq = makeCancelRequest({ status: 'REJECTED' as const })
    vi.mocked(prisma.pembayaranCancelRequest.findUnique).mockResolvedValueOnce(rejectedReq as any)

    await expect(
      cancelRequestService.approve('req-001', 'admin-001'),
    ).rejects.toThrow(ConflictError)
  })
})
