import { Prisma } from '@prisma/client'

import { ConflictError, NotFoundError, ValidationError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import { prisma } from '@/lib/db'
import { pelunasanRepo } from '@/repositories/pelunasan.repo'
import type {
  PelunasanCreateInput,
  PelunasanFilterInput,
  PelunasanUpdateInput,
} from '@/lib/validators/pelunasan.schema'

export interface PelunasanDto {
  id: string
  siswaId: string
  periodeMulai: string
  periodeAkhir: string
  tanggalLunas: string // ISO date (YYYY-MM-DD)
  nominalTotal: number
  noBukti: string | null
  metodeLabel: string | null
  catatan: string | null
  createdAt: string
  createdBy: string | null
  siswa?: {
    id: string
    nis: string
    nama: string
    angkatan: number
  }
}

type PelunasanRowWithSiswa = Prisma.PelunasanGetPayload<{
  include: { siswa: { select: { id: true; nis: true; nama: true; angkatan: true } } }
}>

function toDto(row: PelunasanRowWithSiswa | Prisma.PelunasanGetPayload<Record<string, never>>): PelunasanDto {
  const base: PelunasanDto = {
    id: row.id,
    siswaId: row.siswaId,
    periodeMulai: row.periodeMulai,
    periodeAkhir: row.periodeAkhir,
    tanggalLunas: row.tanggalLunas.toISOString().slice(0, 10),
    nominalTotal: row.nominalTotal.toNumber(),
    noBukti: row.noBukti,
    metodeLabel: row.metodeLabel,
    catatan: row.catatan,
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

/**
 * Count months (inclusive) between two "YYYY-MM" strings. Assumes akhir >= mulai.
 */
function countMonths(periodeMulai: string, periodeAkhir: string): number {
  const [ym, mm] = periodeMulai.split('-').map(Number)
  const [ya, ma] = periodeAkhir.split('-').map(Number)
  if (
    ym === undefined ||
    mm === undefined ||
    ya === undefined ||
    ma === undefined ||
    Number.isNaN(ym) ||
    Number.isNaN(mm) ||
    Number.isNaN(ya) ||
    Number.isNaN(ma)
  ) {
    return 0
  }
  return (ya - ym) * 12 + (ma - mm) + 1
}

export const pelunasanService = {
  /**
   * Helper — pure calculation. Used by UI to pre-fill nominalTotal.
   * Server bisa pakai untuk validasi kasar.
   */
  calculateTotal(
    periodeMulai: string,
    periodeAkhir: string,
    nominalBulanan: number,
  ): { months: number; total: number } {
    const months = countMonths(periodeMulai, periodeAkhir)
    return { months, total: months * nominalBulanan }
  },

  async list(filter: PelunasanFilterInput): Promise<{
    data: PelunasanDto[]
    meta: { page: number; limit: number; total: number; totalPages: number }
  }> {
    const page = filter.page ?? PAGINATION.DEFAULT_PAGE
    const limit = filter.limit ?? PAGINATION.DEFAULT_LIMIT

    const where: Prisma.PelunasanWhereInput = {}
    if (filter.siswaId) where.siswaId = filter.siswaId
    if (filter.angkatan !== undefined) {
      where.siswa = { angkatan: filter.angkatan }
    }
    if (filter.tahun !== undefined) {
      const y = filter.tahun
      where.tanggalLunas = {
        gte: new Date(Date.UTC(y, 0, 1)),
        lt: new Date(Date.UTC(y + 1, 0, 1)),
      }
    }

    const [rows, total] = await Promise.all([
      prisma.pelunasan.findMany({
        where,
        include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
        orderBy: [{ tanggalLunas: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      pelunasanRepo.count(where),
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

  async getById(id: string): Promise<PelunasanDto> {
    const row = await prisma.pelunasan.findUnique({
      where: { id },
      include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
    })
    if (!row) throw new NotFoundError('Data pelunasan tidak ditemukan.')
    return toDto(row)
  },

  async create(input: PelunasanCreateInput, userId?: string): Promise<PelunasanDto> {
    if (countMonths(input.periodeMulai, input.periodeAkhir) <= 0) {
      throw new ValidationError('Rentang periode tidak valid.')
    }

    const row = await prisma.$transaction(async (tx) => {
      const siswa = await tx.siswa.findUnique({ where: { id: input.siswaId } })
      if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')

      if (input.noBukti) {
        const duplicate = await tx.pelunasan.findUnique({
          where: { noBukti: input.noBukti },
        })
        if (duplicate) {
          throw new ConflictError('Nomor bukti sudah digunakan pada pelunasan lain.')
        }
      }

      return tx.pelunasan.create({
        data: {
          siswa: { connect: { id: input.siswaId } },
          periodeMulai: input.periodeMulai,
          periodeAkhir: input.periodeAkhir,
          tanggalLunas: new Date(`${input.tanggalLunas}T00:00:00.000Z`),
          nominalTotal: new Prisma.Decimal(input.nominalTotal),
          noBukti: input.noBukti ?? null,
          metodeLabel: input.metodeLabel ?? null,
          catatan: input.catatan ?? null,
          createdBy: userId ?? null,
        },
        include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
      })
    })

    return toDto(row)
  },

  async update(id: string, input: PelunasanUpdateInput): Promise<PelunasanDto> {
    const existing = await pelunasanRepo.findById(id)
    if (!existing) throw new NotFoundError('Data pelunasan tidak ditemukan.')

    const data: Prisma.PelunasanUpdateInput = {}
    if (input.catatan !== undefined) data.catatan = input.catatan ?? null

    const row = await prisma.pelunasan.update({
      where: { id },
      data,
      include: { siswa: { select: { id: true, nis: true, nama: true, angkatan: true } } },
    })
    return toDto(row)
  },

  async remove(id: string): Promise<void> {
    const existing = await pelunasanRepo.findById(id)
    if (!existing) throw new NotFoundError('Data pelunasan tidak ditemukan.')
    await pelunasanRepo.delete(id)
  },
}

