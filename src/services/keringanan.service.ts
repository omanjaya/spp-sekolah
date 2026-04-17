import { Prisma } from '@prisma/client'

import { ConflictError, NotFoundError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import { prisma } from '@/lib/db'
import { keringananRepo } from '@/repositories/keringanan.repo'
import { siswaRepo } from '@/repositories/siswa.repo'
import type {
  KeringananBulkAssignInput,
  KeringananCreateInput,
  KeringananFilterInput,
  KeringananUpdateInput,
} from '@/lib/validators/keringanan.schema'

/**
 * DTO — Decimal not involved here, but Date → ISO for consistency.
 */
export interface KeringananDto {
  id: string
  siswaId: string
  periodYear: number
  periodMonth: number
  jenis: string
  persentase: number
  alasan: string | null
  buktiUrl: string | null
  createdAt: string
  createdBy: string | null
  siswa?: {
    id: string
    nis: string
    nama: string
    angkatan: number
  }
}

type KeringananRow = Prisma.KeringananGetPayload<{
  include: { siswa: { select: { id: true; nis: true; nama: true; angkatan: true } } }
}>

function toDto(row: KeringananRow | Prisma.KeringananGetPayload<Record<string, never>>): KeringananDto {
  const base: KeringananDto = {
    id: row.id,
    siswaId: row.siswaId,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    jenis: row.jenis,
    persentase: row.persentase,
    alasan: row.alasan,
    buktiUrl: row.buktiUrl,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  }
  if ('siswa' in row && row.siswa) {
    base.siswa = {
      id: row.siswa.id,
      nis: row.siswa.nis,
      nama: row.siswa.nama,
      angkatan: row.siswa.angkatan,
    }
  }
  return base
}

export const keringananService = {
  async list(filter: KeringananFilterInput): Promise<{
    data: KeringananDto[]
    meta: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const page = filter.page ?? PAGINATION.DEFAULT_PAGE
    const limit = filter.limit ?? PAGINATION.DEFAULT_LIMIT

    const where: Prisma.KeringananWhereInput = {}
    if (filter.siswaId) where.siswaId = filter.siswaId
    if (filter.jenis) where.jenis = filter.jenis
    if (filter.year !== undefined) where.periodYear = filter.year
    if (filter.month !== undefined) where.periodMonth = filter.month
    if (filter.angkatan !== undefined) {
      where.siswa = { angkatan: filter.angkatan }
    }

    const [rows, total] = await Promise.all([
      prisma.keringanan.findMany({
        where,
        include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      keringananRepo.count(where),
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

  async getById(id: string): Promise<KeringananDto> {
    const row = await prisma.keringanan.findUnique({
      where: { id },
      include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
    })
    if (!row) throw new NotFoundError('Data keringanan tidak ditemukan.')
    return toDto(row)
  },

  async create(input: KeringananCreateInput, userId?: string): Promise<KeringananDto> {
    const siswa = await siswaRepo.findById(input.siswaId)
    if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')

    const existing = await keringananRepo.findByPeriod(
      input.siswaId,
      input.periodYear,
      input.periodMonth,
    )
    if (existing) {
      throw new ConflictError('Keringanan untuk periode ini sudah ada.')
    }

    const row = await prisma.keringanan.create({
      data: {
        siswa: { connect: { id: input.siswaId } },
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        jenis: input.jenis,
        persentase: input.persentase,
        alasan: input.alasan ?? null,
        buktiUrl: input.buktiUrl ?? null,
        createdBy: userId ?? null,
      },
      include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
    })
    return toDto(row)
  },

  async update(id: string, input: KeringananUpdateInput): Promise<KeringananDto> {
    const existing = await keringananRepo.findById(id)
    if (!existing) throw new NotFoundError('Data keringanan tidak ditemukan.')

    const data: Prisma.KeringananUpdateInput = {}
    if (input.jenis !== undefined) data.jenis = input.jenis
    if (input.persentase !== undefined) data.persentase = input.persentase
    if (input.alasan !== undefined) data.alasan = input.alasan ?? null
    if (input.buktiUrl !== undefined) data.buktiUrl = input.buktiUrl ?? null

    const row = await prisma.keringanan.update({
      where: { id },
      data,
      include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
    })
    return toDto(row)
  },

  async remove(id: string): Promise<void> {
    const existing = await keringananRepo.findById(id)
    if (!existing) throw new NotFoundError('Data keringanan tidak ditemukan.')
    await keringananRepo.delete(id)
  },

  /**
   * Bulk assign: cross product siswaIds × periods. `createMany` with
   * `skipDuplicates` for idempotency (re-running with same inputs is safe).
   */
  async bulkAssign(
    input: KeringananBulkAssignInput,
    userId?: string,
  ): Promise<{
    attempted: number
    created: number
    skipped: number
  }> {
    const { siswaIds, periods, jenis, persentase, alasan, buktiUrl } = input

    // Verify all siswa exist in a single query.
    const foundSiswa = await prisma.siswa.findMany({
      where: { id: { in: siswaIds } },
      select: { id: true },
    })
    if (foundSiswa.length !== siswaIds.length) {
      const foundSet = new Set(foundSiswa.map((s) => s.id))
      const missing = siswaIds.filter((id) => !foundSet.has(id))
      throw new NotFoundError('Sebagian siswa tidak ditemukan.', { missingSiswaIds: missing })
    }

    const rows: Prisma.KeringananCreateManyInput[] = []
    for (const siswaId of siswaIds) {
      for (const period of periods) {
        rows.push({
          siswaId,
          periodYear: period.year,
          periodMonth: period.month,
          jenis,
          persentase,
          alasan: alasan ?? null,
          buktiUrl: buktiUrl ?? null,
          createdBy: userId ?? null,
        })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      return tx.keringanan.createMany({ data: rows, skipDuplicates: true })
    })

    return {
      attempted: rows.length,
      created: result.count,
      skipped: rows.length - result.count,
    }
  },
}
