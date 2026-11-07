import { Prisma } from '@prisma/client'

import { NotFoundError, ValidationError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import { prisma } from '@/lib/db'
import type { RefundCreateInput, RefundFilterInput } from '@/lib/validators/refund.schema'

// ─── DTO ──────────────────────────────────────────────────────────────────────

export interface RefundDto {
  id: string
  siswaId: string
  pembayaranId: string | null
  amount: number
  alasan: string
  tanggal: string   // ISO date YYYY-MM-DD
  noBukti: string | null
  createdById: string
  createdAt: string
  siswa?: {
    id: string
    nis: string
    nama: string
    angkatan: number
  }
  pembayaran?: {
    id: string
    periodYear: number
    periodMonth: number
    amount: number
  } | null
}

type RefundRowFull = Prisma.RefundGetPayload<{
  include: {
    siswa: { select: { id: true; nis: true; nama: true; angkatan: true } }
    pembayaran: { select: { id: true; periodYear: true; periodMonth: true; amount: true } }
  }
}>

function toDto(row: RefundRowFull): RefundDto {
  return {
    id: row.id,
    siswaId: row.siswaId,
    pembayaranId: row.pembayaranId,
    amount: row.amount.toNumber(),
    alasan: row.alasan,
    tanggal: row.tanggal.toISOString().slice(0, 10),
    noBukti: row.noBukti,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    siswa: row.siswa
      ? { id: row.siswa.id, nis: row.siswa.nis, nama: row.siswa.nama, angkatan: row.siswa.angkatan }
      : undefined,
    pembayaran: row.pembayaran
      ? {
          id: row.pembayaran.id,
          periodYear: row.pembayaran.periodYear,
          periodMonth: row.pembayaran.periodMonth,
          amount: row.pembayaran.amount.toNumber(),
        }
      : null,
  }
}

const INCLUDE = {
  siswa: { select: { id: true, nis: true, nama: true, angkatan: true } },
  pembayaran: { select: { id: true, periodYear: true, periodMonth: true, amount: true } },
} as const

// ─── Service ──────────────────────────────────────────────────────────────────

export const refundService = {
  async list(filter: RefundFilterInput): Promise<{
    data: RefundDto[]
    meta: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const page = filter.page ?? PAGINATION.DEFAULT_PAGE
    const limit = filter.limit ?? PAGINATION.DEFAULT_LIMIT

    const where: Prisma.RefundWhereInput = { deletedAt: null }
    if (filter.siswaId) where.siswaId = filter.siswaId
    if (filter.dateFrom ?? filter.dateTo) {
      where.tanggal = {}
      if (filter.dateFrom) (where.tanggal as Prisma.DateTimeFilter).gte = filter.dateFrom
      if (filter.dateTo) (where.tanggal as Prisma.DateTimeFilter).lte = filter.dateTo
    }

    const [rows, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.refund.count({ where }),
    ])

    return {
      data: rows.map(toDto),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }
  },

  async getById(id: string): Promise<RefundDto> {
    const row = await prisma.refund.findFirst({ where: { id, deletedAt: null }, include: INCLUDE })
    if (!row) throw new NotFoundError('Data refund tidak ditemukan.')
    return toDto(row)
  },

  async create(
    input: RefundCreateInput,
    createdById: string,
  ): Promise<RefundDto> {
    if (input.amount <= 0) {
      throw new ValidationError('Jumlah refund harus lebih dari 0.')
    }

    const row = await prisma.$transaction(async (tx) => {
      const siswa = await tx.siswa.findUnique({ where: { id: input.siswaId } })
      if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')

      if (input.pembayaranId) {
        const pembayaran = await tx.pembayaran.findUnique({ where: { id: input.pembayaranId } })
        if (!pembayaran) throw new NotFoundError('Pembayaran tidak ditemukan.')
        if (pembayaran.siswaId !== input.siswaId) {
          throw new ValidationError('Pembayaran tidak milik siswa yang dipilih.')
        }
      }

      // Sentuh updatedAt pembayaran asal supaya sinkronisasi API integrasi
      // bendahara mengirim ulang pembayaran ini beserta refund-nya.
      if (input.pembayaranId) {
        await tx.pembayaran.update({
          where: { id: input.pembayaranId },
          data: { updatedAt: new Date() },
        })
      }

      return tx.refund.create({
        data: {
          siswa: { connect: { id: input.siswaId } },
          ...(input.pembayaranId ? { pembayaran: { connect: { id: input.pembayaranId } } } : {}),
          amount: new Prisma.Decimal(input.amount),
          alasan: input.alasan,
          tanggal: input.tanggal,
          noBukti: input.noBukti ?? null,
          createdBy: { connect: { id: createdById } },
        },
        include: INCLUDE,
      })
    })

    return toDto(row)
  },

  /**
   * Soft delete: baris tetap disimpan dengan `deletedAt` sebagai tombstone,
   * agar aplikasi bendahara yang sudah menyinkronkan refund ini bisa tahu
   * refund tersebut dibatalkan.
   */
  async delete(id: string): Promise<void> {
    const existing = await prisma.refund.findUnique({ where: { id } })
    if (!existing || existing.deletedAt) throw new NotFoundError('Data refund tidak ditemukan.')
    const now = new Date()
    await prisma.$transaction([
      prisma.refund.update({ where: { id }, data: { deletedAt: now } }),
      ...(existing.pembayaranId
        ? [prisma.pembayaran.update({ where: { id: existing.pembayaranId }, data: { updatedAt: now } })]
        : []),
    ])
  },
}
