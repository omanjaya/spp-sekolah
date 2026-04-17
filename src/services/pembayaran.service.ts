import type { Prisma, Pembayaran } from '@prisma/client'

import { prisma } from '@/lib/db'
import { pembayaranRepo } from '@/repositories/pembayaran.repo'
import { siswaRepo } from '@/repositories/siswa.repo'
import { auditLogRepo } from '@/repositories/audit-log.repo'
import { ConflictError, NotFoundError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import type {
  PembayaranFilterInput,
  PembayaranManualCreateInput,
  PembayaranUpdateInput,
} from '@/lib/validators/pembayaran.schema'
import logger from '@/lib/logger'
import { performance } from 'perf_hooks'

export interface PembayaranSiswaSummary {
  id: string
  nis: string
  nama: string
  angkatan: number | null
  alamat: string | null
}

export interface PembayaranRombelSummary {
  id: string
  kode: string
  grade: 'X' | 'XI' | 'XII'
  nomor: number
  tahunAjaranKode: string | null
}

export interface PembayaranDto {
  id: string
  siswaId: string
  siswa?: PembayaranSiswaSummary | null
  rombel?: PembayaranRombelSummary | null
  periodYear: number
  periodMonth: number
  amount: number
  biayaAdm: number
  tanggalTransaksi: string
  noBukti: string | null
  kodeCabang: string | null
  tellerUser: string | null
  statusBayar: 'TERBAYAR' | 'DIBATALKAN'
  source: 'IMPORT_EXCEL' | 'PASTE_SPREADSHEET' | 'MANUAL'
  importBatchId: string | null
  catatan: string | null
  createdAt: string
  updatedAt: string
}

type PembayaranWithRelations = Pembayaran & {
  siswa?:
    | {
        id: string
        nis: string
        nama: string
        angkatan?: number | null
        alamat?: string | null
        enrollments?: Array<{
          rombel: {
            id: string
            kode: string
            grade: 'X' | 'XI' | 'XII'
            nomor: number
            tahunAjaran: { kode: string }
          }
        }>
      }
    | null
}

/**
 * Given the siswa's enrollments and a target periode (year+month),
 * pick the enrollment whose tahunAjaran covers that periode.
 * Periode Jul-Jun: tahunAjaran 2023/2024 covers Jul 2023 – Jun 2024.
 */
function pickRombelForPeriode(
  enrollments: NonNullable<PembayaranWithRelations['siswa']>['enrollments'],
  periodYear: number,
  periodMonth: number,
): PembayaranRombelSummary | null {
  if (!enrollments || enrollments.length === 0) return null
  const taStartYear = periodMonth >= 7 ? periodYear : periodYear - 1
  const taKode = `${taStartYear}/${taStartYear + 1}`
  const match =
    enrollments.find((e) => e.rombel.tahunAjaran.kode === taKode) ?? enrollments[0]
  if (!match) return null
  return {
    id: match.rombel.id,
    kode: match.rombel.kode,
    grade: match.rombel.grade,
    nomor: match.rombel.nomor,
    tahunAjaranKode: match.rombel.tahunAjaran.kode,
  }
}

export function toDto(p: PembayaranWithRelations): PembayaranDto {
  const siswa = p.siswa
    ? {
        id: p.siswa.id,
        nis: p.siswa.nis,
        nama: p.siswa.nama,
        angkatan: p.siswa.angkatan ?? null,
        alamat: p.siswa.alamat ?? null,
      }
    : null
  const rombel = p.siswa?.enrollments
    ? pickRombelForPeriode(p.siswa.enrollments, p.periodYear, p.periodMonth)
    : null

  return {
    id: p.id,
    siswaId: p.siswaId,
    siswa,
    rombel,
    periodYear: p.periodYear,
    periodMonth: p.periodMonth,
    amount: Number(p.amount),
    biayaAdm: Number(p.biayaAdm),
    tanggalTransaksi: p.tanggalTransaksi.toISOString(),
    noBukti: p.noBukti,
    kodeCabang: p.kodeCabang,
    tellerUser: p.tellerUser,
    statusBayar: p.statusBayar,
    source: p.source,
    importBatchId: p.importBatchId,
    catatan: p.catatan,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export interface PembayaranListResult {
  items: PembayaranDto[]
  page: number
  limit: number
  total: number
  totalPages: number
  totals: { amount: number; biayaAdm: number }
}

export interface PaymentMatrixCell {
  month: number
  year: number
  status: 'TERBAYAR' | 'DIBATALKAN' | 'BELUM'
  amount: number | null
  tanggal: string | null
  noBukti: string | null
  pembayaranId: string | null
}

export interface PaymentMatrix {
  siswaId: string
  rows: Array<{
    year: number
    months: PaymentMatrixCell[]
  }>
}

function buildWhere(filter: PembayaranFilterInput): Prisma.PembayaranWhereInput {
  const where: Prisma.PembayaranWhereInput = {}
  if (filter.siswaId) where.siswaId = filter.siswaId
  if (filter.year) where.periodYear = filter.year
  if (filter.month) where.periodMonth = filter.month
  if (filter.yearFrom || filter.yearTo) {
    where.periodYear = {
      ...(filter.yearFrom ? { gte: filter.yearFrom } : {}),
      ...(filter.yearTo ? { lte: filter.yearTo } : {}),
    }
  }
  if (filter.monthFrom || filter.monthTo) {
    where.periodMonth = {
      ...(filter.monthFrom ? { gte: filter.monthFrom } : {}),
      ...(filter.monthTo ? { lte: filter.monthTo } : {}),
    }
  }
  if (filter.kodeCabang) where.kodeCabang = filter.kodeCabang
  if (filter.tellerUser) where.tellerUser = filter.tellerUser
  if (filter.status) where.statusBayar = filter.status
  if (filter.source) where.source = filter.source
  const andClauses: Prisma.PembayaranWhereInput[] = []
  if (filter.duplikat === 'true') {
    andClauses.push({
      OR: [
        { catatan: { startsWith: 'Duplikat bayar', mode: 'insensitive' } },
        { catatan: { startsWith: 'Roll-forward', mode: 'insensitive' } },
      ],
    })
  }
  if (andClauses.length > 0) where.AND = andClauses
  if (filter.angkatan) {
    where.siswa = { ...(where.siswa as object | undefined), angkatan: filter.angkatan }
  }
  if (filter.rombelId) {
    where.siswa = {
      ...(where.siswa as object | undefined),
      enrollments: { some: { rombelId: filter.rombelId } },
    }
  }
  if (filter.tahunAjaranId) {
    where.siswa = {
      ...(where.siswa as object | undefined),
      enrollments: {
        some: {
          ...(filter.rombelId ? { rombelId: filter.rombelId } : {}),
          tahunAjaranId: filter.tahunAjaranId,
        },
      },
    }
  }
  if (filter.q) {
    where.OR = [
      { noBukti: { contains: filter.q, mode: 'insensitive' } },
      { siswa: { nis: { contains: filter.q, mode: 'insensitive' } } },
      { siswa: { nama: { contains: filter.q, mode: 'insensitive' } } },
    ]
  }
  return where
}

type OrderByArg =
  | Prisma.PembayaranOrderByWithRelationInput
  | Prisma.PembayaranOrderByWithRelationInput[]

/**
 * Map UI column keys to Prisma orderBy shapes.
 * Relation fields (nis, nama, angkatan) need nested syntax.
 * Unknown/unsortable keys fall back to `tanggalTransaksi` desc.
 */
function resolveOrderBy(sortBy?: string | null, sortOrder?: 'asc' | 'desc' | null): OrderByArg {
  const order: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : sortOrder === 'desc' ? 'desc' : 'desc'
  // Always add `id` as last tie-breaker so pagination is stable when the
  // primary sort column has duplicate values (e.g. many rows with same
  // tanggalTransaksi from bulk teller input).
  const tieBreaker: Prisma.PembayaranOrderByWithRelationInput = { id: order }
  switch (sortBy) {
    case 'nis':
      return [{ siswa: { nis: order } }, { tanggalTransaksi: 'desc' }, tieBreaker]
    case 'nama':
      return [{ siswa: { nama: order } }, { tanggalTransaksi: 'desc' }, tieBreaker]
    case 'angkatan':
      return [{ siswa: { angkatan: order } }, { tanggalTransaksi: 'desc' }, tieBreaker]
    case 'periode':
      return [{ periodYear: order }, { periodMonth: order }, { tanggalTransaksi: 'desc' }, tieBreaker]
    case 'periodYear':
    case 'periodMonth':
    case 'amount':
    case 'biayaAdm':
    case 'noBukti':
    case 'kodeCabang':
    case 'tellerUser':
    case 'statusBayar':
    case 'source':
    case 'createdAt':
      return [
        { [sortBy]: order } as Prisma.PembayaranOrderByWithRelationInput,
        { tanggalTransaksi: 'desc' },
        tieBreaker,
      ]
    case 'tanggalTransaksi':
    default:
      // Primary: tanggalTransaksi (includes time). Secondary: id for stability.
      return [{ tanggalTransaksi: order }, tieBreaker]
  }
}

const listInclude = {
  siswa: {
    select: {
      id: true,
      nis: true,
      nama: true,
      angkatan: true,
      alamat: true,
      enrollments: {
        select: {
          rombel: {
            select: {
              id: true,
              kode: true,
              grade: true,
              nomor: true,
              tahunAjaran: { select: { kode: true } },
            },
          },
        },
      },
    },
  },
} as const

export const pembayaranService = {
  async list(filter: PembayaranFilterInput): Promise<PembayaranListResult> {
    const start = performance.now()
    const page = filter.page ?? PAGINATION.DEFAULT_PAGE
    const limit = filter.limit ?? PAGINATION.DEFAULT_LIMIT
    const skip = (page - 1) * limit
    const where = buildWhere(filter)

    const orderBy = resolveOrderBy(filter.sortBy, filter.sortOrder)

    const [items, total, sumAgg] = await Promise.all([
      prisma.pembayaran.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: listInclude,
      }),
      prisma.pembayaran.count({ where }),
      prisma.pembayaran.aggregate({ where, _sum: { amount: true, biayaAdm: true } }),
    ])

    const duration = performance.now() - start
    logger.info({ duration, operation: 'list', page, limit, total }, 'pembayaran.list')

    if (duration > 2000) {
      logger.warn({ duration, operation: 'list', page, limit, total }, 'pembayaran.list: slow')
    }

    return {
      items: items.map(toDto),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totals: {
        amount: Number(sumAgg._sum.amount ?? 0),
        biayaAdm: Number(sumAgg._sum.biayaAdm ?? 0),
      },
    }
  },

  async listAll(filter: PembayaranFilterInput): Promise<PembayaranDto[]> {
    const where = buildWhere(filter)
    const orderBy = resolveOrderBy(filter.sortBy, filter.sortOrder)
    const items = await prisma.pembayaran.findMany({
      where,
      orderBy,
      include: listInclude,
    })
    return items.map(toDto)
  },

  async getById(id: string): Promise<PembayaranDto> {
    const row = await prisma.pembayaran.findUnique({
      where: { id },
      include: listInclude,
    })
    if (!row) throw new NotFoundError('Pembayaran tidak ditemukan.')
    return toDto(row)
  },

  async createManual(
    input: PembayaranManualCreateInput,
    actor: { userId: string },
  ): Promise<PembayaranDto> {
    const siswa = await siswaRepo.findById(input.siswaId)
    if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')

    const existing = await pembayaranRepo.findByPeriod(
      input.siswaId,
      input.periodYear,
      input.periodMonth,
    )
    if (existing) {
      throw new ConflictError(
        `Sudah ada pembayaran untuk periode ${input.periodYear}-${String(input.periodMonth).padStart(
          2,
          '0',
        )}.`,
      )
    }

    const created = await prisma.pembayaran.create({
      data: {
        siswaId: input.siswaId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        amount: input.amount,
        biayaAdm: input.biayaAdm ?? 0,
        tanggalTransaksi: input.tanggalTransaksi,
        kodeCabang: input.kodeCabang ?? null,
        catatan: input.catatan ?? null,
        statusBayar: 'TERBAYAR',
        source: 'MANUAL',
      },
      include: { siswa: { select: { id: true, nis: true, nama: true } } },
    })

    await auditLogRepo.create({
      user: { connect: { id: actor.userId } },
      action: 'PEMBAYARAN_CREATE_MANUAL',
      entity: 'Pembayaran',
      entityId: created.id,
      metadata: {
        siswaId: created.siswaId,
        periode: `${created.periodYear}-${created.periodMonth}`,
        amount: Number(created.amount),
      },
    })

    return toDto(created)
  },

  async update(
    id: string,
    input: PembayaranUpdateInput,
    actor: { userId: string },
  ): Promise<PembayaranDto> {
    const current = await pembayaranRepo.findById(id)
    if (!current) throw new NotFoundError('Pembayaran tidak ditemukan.')

    const updated = await prisma.pembayaran.update({
      where: { id },
      data: {
        catatan: input.catatan === undefined ? current.catatan : input.catatan,
        kodeCabang: input.kodeCabang === undefined ? current.kodeCabang : input.kodeCabang,
      },
      include: { siswa: { select: { id: true, nis: true, nama: true } } },
    })

    await auditLogRepo.create({
      user: { connect: { id: actor.userId } },
      action: 'PEMBAYARAN_UPDATE',
      entity: 'Pembayaran',
      entityId: id,
    })

    return toDto(updated)
  },

  async cancel(
    id: string,
    catatan: string,
    actor: { userId: string },
  ): Promise<PembayaranDto> {
    const current = await pembayaranRepo.findById(id)
    if (!current) throw new NotFoundError('Pembayaran tidak ditemukan.')
    if (current.statusBayar === 'DIBATALKAN') {
      throw new ConflictError('Pembayaran ini sudah dibatalkan sebelumnya.')
    }

    const updated = await prisma.pembayaran.update({
      where: { id },
      data: { statusBayar: 'DIBATALKAN', catatan },
      include: { siswa: { select: { id: true, nis: true, nama: true } } },
    })

    await auditLogRepo.create({
      user: { connect: { id: actor.userId } },
      action: 'PEMBAYARAN_CANCEL',
      entity: 'Pembayaran',
      entityId: id,
      metadata: { catatan },
    })

    return toDto(updated)
  },

  /**
   * Build 3-year matrix (grade X, XI, XII) of payment status per month per year.
   * Simpler approach: return all payments for the siswa grouped by year.
   * UI layer will render 12-month strip per year.
   */
  async findMatrix(siswaId: string): Promise<PaymentMatrix> {
    const payments = await prisma.pembayaran.findMany({
      where: { siswaId },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    })

    const byYear = new Map<number, Map<number, Pembayaran>>()
    for (const p of payments) {
      const y = byYear.get(p.periodYear) ?? new Map<number, Pembayaran>()
      y.set(p.periodMonth, p)
      byYear.set(p.periodYear, y)
    }

    // Determine year range: use enrollments / angkatan if available, else observed years.
    const years = Array.from(byYear.keys()).sort((a, b) => a - b)
    const rows = years.map((year) => {
      const byMonth = byYear.get(year) ?? new Map<number, Pembayaran>()
      const months: PaymentMatrixCell[] = []
      for (let m = 1; m <= 12; m += 1) {
        const p = byMonth.get(m)
        if (!p) {
          months.push({
            month: m,
            year,
            status: 'BELUM',
            amount: null,
            tanggal: null,
            noBukti: null,
            pembayaranId: null,
          })
        } else {
          months.push({
            month: m,
            year,
            status: p.statusBayar,
            amount: Number(p.amount),
            tanggal: p.tanggalTransaksi.toISOString(),
            noBukti: p.noBukti,
            pembayaranId: p.id,
          })
        }
      }
      return { year, months }
    })

    return { siswaId, rows }
  },
}
