import { prisma } from '@/lib/db'
import { NotFoundError, ConflictError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'

export type CancelRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface CancelRequestDto {
  id: string
  pembayaranId: string
  pembayaran?: {
    id: string
    periodYear: number
    periodMonth: number
    amount: number
    noBukti: string | null
    statusBayar: string
    siswa?: {
      id: string
      nis: string
      nama: string
    } | null
  } | null
  requestedById: string
  requestedBy?: { id: string; nama: string; email: string } | null
  alasan: string
  status: CancelRequestStatus
  reviewedById: string | null
  reviewedBy?: { id: string; nama: string } | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

export interface CancelRequestListResult {
  items: CancelRequestDto[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface CancelRequestFilter {
  status?: CancelRequestStatus
  page?: number
  limit?: number
}

function toDto(r: {
  id: string
  pembayaranId: string
  requestedById: string
  alasan: string
  status: CancelRequestStatus
  reviewedById: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  createdAt: Date
  updatedAt: Date
  pembayaran?: {
    id: string
    periodYear: number
    periodMonth: number
    amount: unknown
    noBukti: string | null
    statusBayar: string
    siswa?: { id: string; nis: string; nama: string } | null
  } | null
  requestedBy?: { id: string; nama: string; email: string } | null
}): CancelRequestDto {
  return {
    id: r.id,
    pembayaranId: r.pembayaranId,
    pembayaran: r.pembayaran
      ? {
          id: r.pembayaran.id,
          periodYear: r.pembayaran.periodYear,
          periodMonth: r.pembayaran.periodMonth,
          amount: Number(r.pembayaran.amount),
          noBukti: r.pembayaran.noBukti,
          statusBayar: r.pembayaran.statusBayar,
          siswa: r.pembayaran.siswa ?? null,
        }
      : null,
    requestedById: r.requestedById,
    requestedBy: r.requestedBy ?? null,
    alasan: r.alasan,
    status: r.status,
    reviewedById: r.reviewedById,
    reviewedBy: null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

const cancelRequestInclude = {
  pembayaran: {
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      amount: true,
      noBukti: true,
      statusBayar: true,
      siswa: { select: { id: true, nis: true, nama: true } },
    },
  },
  requestedBy: { select: { id: true, nama: true, email: true } },
} as const

export const cancelRequestService = {
  async list(filter: CancelRequestFilter): Promise<CancelRequestListResult> {
    const page = filter.page ?? PAGINATION.DEFAULT_PAGE
    const limit = filter.limit ?? PAGINATION.DEFAULT_LIMIT
    const skip = (page - 1) * limit

    const where = filter.status ? { status: filter.status } : {}

    const [items, total] = await Promise.all([
      prisma.pembayaranCancelRequest.findMany({
        where,
        include: cancelRequestInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.pembayaranCancelRequest.count({ where }),
    ])

    return {
      items: items.map(toDto),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  },

  async request(
    pembayaranId: string,
    alasan: string,
    requestedById: string,
  ): Promise<CancelRequestDto> {
    // Check pembayaran exists
    const pembayaran = await prisma.pembayaran.findUnique({ where: { id: pembayaranId } })
    if (!pembayaran) throw new NotFoundError('Pembayaran tidak ditemukan.')
    if (pembayaran.statusBayar === 'DIBATALKAN') {
      throw new ConflictError('Pembayaran ini sudah dibatalkan.')
    }

    // Check no pending request exists
    const existing = await prisma.pembayaranCancelRequest.findFirst({
      where: { pembayaranId, status: 'PENDING' },
    })
    if (existing) {
      throw new ConflictError('Sudah ada permintaan cancel yang masih pending untuk pembayaran ini.')
    }

    const created = await prisma.pembayaranCancelRequest.create({
      data: { pembayaranId, requestedById, alasan },
      include: cancelRequestInclude,
    })

    return toDto(created)
  },

  async approve(
    id: string,
    reviewedById: string,
    reviewNote?: string,
  ): Promise<CancelRequestDto> {
    const req = await prisma.pembayaranCancelRequest.findUnique({ where: { id } })
    if (!req) throw new NotFoundError('Cancel request tidak ditemukan.')
    if (req.status !== 'PENDING') {
      throw new ConflictError('Cancel request ini sudah diproses sebelumnya.')
    }

    // Approve request and cancel the payment atomically
    const [updated] = await prisma.$transaction([
      prisma.pembayaranCancelRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById,
          reviewedAt: new Date(),
          reviewNote: reviewNote ?? null,
        },
        include: cancelRequestInclude,
      }),
      prisma.pembayaran.update({
        where: { id: req.pembayaranId },
        data: { statusBayar: 'DIBATALKAN' },
      }),
    ])

    return toDto(updated)
  },

  async reject(
    id: string,
    reviewedById: string,
    reviewNote: string,
  ): Promise<CancelRequestDto> {
    const req = await prisma.pembayaranCancelRequest.findUnique({ where: { id } })
    if (!req) throw new NotFoundError('Cancel request tidak ditemukan.')
    if (req.status !== 'PENDING') {
      throw new ConflictError('Cancel request ini sudah diproses sebelumnya.')
    }

    const updated = await prisma.pembayaranCancelRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById,
        reviewedAt: new Date(),
        reviewNote,
      },
      include: cancelRequestInclude,
    })

    return toDto(updated)
  },
}
