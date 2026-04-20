/**
 * Kwitansi Service — CRUD + nomor otomatis.
 *
 * Nomor format: KWT/{YYYY}/{MM}/{seq:04d}
 * Seq di-reset tiap bulan, per-bulan dihitung dari Kwitansi yang sudah ada.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import type { KwitansiCreateInput, KwitansiFilterInput } from '@/lib/validators/kwitansi.schema'

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface KwitansiItemDto {
  id: string
  periodYear: number
  periodMonth: number
  amount: number
  keterangan: string | null
  pembayaranId: string | null
}

export interface KwitansiDto {
  id: string
  nomorKwitansi: string
  siswaId: string
  siswa: {
    id: string
    nis: string
    nama: string
    angkatan: number
  }
  tanggal: string
  totalAmount: number
  biayaAdm: number
  namaOrangTua: string | null
  catatan: string | null
  createdById: string
  createdBy: {
    id: string
    nama: string
  }
  createdAt: string
  updatedAt: string
  items: KwitansiItemDto[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

type KwitansiWithRelations = {
  id: string
  nomorKwitansi: string
  siswaId: string
  tanggal: Date
  totalAmount: { toNumber?: () => number } | number
  biayaAdm: { toNumber?: () => number } | number
  namaOrangTua: string | null
  catatan: string | null
  createdById: string
  createdAt: Date
  updatedAt: Date
  siswa: { id: string; nis: string; nama: string; angkatan: number }
  createdBy: { id: string; nama: string }
  items: Array<{
    id: string
    periodYear: number
    periodMonth: number
    amount: { toNumber?: () => number } | number
    keterangan: string | null
    pembayaranId: string | null
    createdAt: Date
    kwitansiId: string
  }>
}

function asNumber(v: { toNumber?: () => number } | number): number {
  if (typeof v === 'number') return v
  return typeof v.toNumber === 'function' ? v.toNumber() : Number(v)
}

function toDto(k: KwitansiWithRelations): KwitansiDto {
  return {
    id: k.id,
    nomorKwitansi: k.nomorKwitansi,
    siswaId: k.siswaId,
    siswa: {
      id: k.siswa.id,
      nis: k.siswa.nis,
      nama: k.siswa.nama,
      angkatan: k.siswa.angkatan,
    },
    tanggal: k.tanggal.toISOString(),
    totalAmount: asNumber(k.totalAmount),
    biayaAdm: asNumber(k.biayaAdm),
    namaOrangTua: k.namaOrangTua,
    catatan: k.catatan,
    createdById: k.createdById,
    createdBy: {
      id: k.createdBy.id,
      nama: k.createdBy.nama,
    },
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
    items: k.items.map((item) => ({
      id: item.id,
      periodYear: item.periodYear,
      periodMonth: item.periodMonth,
      amount: asNumber(item.amount),
      keterangan: item.keterangan,
      pembayaranId: item.pembayaranId,
    })),
  }
}

const WITH_RELATIONS = {
  siswa: true,
  createdBy: true,
  items: {
    orderBy: [{ periodYear: 'asc' as const }, { periodMonth: 'asc' as const }],
  },
}

/**
 * Generate nomor kwitansi: KWT/{YYYY}/{MM}/{seq:04d}
 * Seq = jumlah kwitansi pada bulan tersebut + 1.
 *
 * Fix A12: Gunakan UTC+8 (WIB) fixed offset agar kalkulasi bulan konsisten
 * di server manapun (UTC, dll).
 *
 * Fix A1: Menerima `tx` (transaction client) agar count berjalan dalam
 * transaction Serializable yang sama dengan insert — mencegah race condition.
 */
async function generateNomor(tanggal: Date, tx: Prisma.TransactionClient): Promise<string> {
  // Offset WIB = UTC+8 = 8 jam
  const wibMs = tanggal.getTime() + 8 * 60 * 60 * 1000
  const wibDate = new Date(wibMs)
  const year  = wibDate.getUTCFullYear()
  const month = wibDate.getUTCMonth() + 1
  const yyyy  = String(year)
  const mm    = String(month).padStart(2, '0')

  // Range bulan dalam UTC (mundur 8 jam dari batas WIB)
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000)
  const endOfMonth   = new Date(Date.UTC(year, month,     1) - 8 * 60 * 60 * 1000 - 1)

  const count = await tx.kwitansi.count({
    where: {
      tanggal: { gte: startOfMonth, lte: endOfMonth },
    },
  })
  const seq = String(count + 1).padStart(4, '0')
  return `KWT/${yyyy}/${mm}/${seq}`
}

// ─── Service ───────────────────────────────────────────────────────────────

export const kwitansiService = {
  async list(filter: Partial<KwitansiFilterInput>) {
    const page  = filter.page  ?? PAGINATION.DEFAULT_PAGE
    const limit = filter.limit ?? PAGINATION.DEFAULT_LIMIT

    type WhereInput = NonNullable<NonNullable<Parameters<typeof prisma.kwitansi.findMany>[0]>['where']>
    const where: WhereInput = {}

    if (filter.siswaId) where.siswaId = filter.siswaId
    if (filter.createdById) where.createdById = filter.createdById
    if (filter.dateFrom ?? filter.dateTo) {
      where.tanggal = {}
      if (filter.dateFrom) where.tanggal.gte = filter.dateFrom
      if (filter.dateTo)   where.tanggal.lte = filter.dateTo
    }
    if (filter.q) {
      const q = filter.q.trim()
      where.OR = [
        { nomorKwitansi: { contains: q, mode: 'insensitive' } },
        { siswa: { nama: { contains: q, mode: 'insensitive' } } },
        { siswa: { nis:  { startsWith: q } } },
        { namaOrangTua: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.kwitansi.findMany({
        where,
        include: WITH_RELATIONS,
        orderBy: { tanggal: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.kwitansi.count({ where }),
    ])

    return {
      items: items.map(toDto),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  },

  async getById(id: string): Promise<KwitansiDto> {
    const k = await prisma.kwitansi.findUnique({
      where: { id },
      include: WITH_RELATIONS,
    })
    if (!k) throw new NotFoundError(`Kwitansi ${id} tidak ditemukan.`)
    return toDto(k)
  },

  async getByNomor(nomor: string): Promise<KwitansiDto> {
    const k = await prisma.kwitansi.findUnique({
      where: { nomorKwitansi: nomor },
      include: WITH_RELATIONS,
    })
    if (!k) throw new NotFoundError(`Kwitansi ${nomor} tidak ditemukan.`)
    return toDto(k)
  },

  async create(input: KwitansiCreateInput, createdById: string): Promise<KwitansiDto> {
    // Fix A1: Bungkus seluruh create dalam transaction Serializable
    // agar generateNomor (count + 1) dan insert tidak bisa terjadi secara bersamaan
    // dari dua request — mencegah race condition pada nomor kwitansi.
    return prisma.$transaction(async (tx) => {
      // Validasi siswa di dalam transaction
      const siswa = await tx.siswa.findUnique({ where: { id: input.siswaId } })
      if (!siswa) throw new NotFoundError(`Siswa ${input.siswaId} tidak ditemukan.`)

      const tanggal = input.tanggal ?? new Date()
      const totalAmount = input.items.reduce((s, i) => s + i.amount, 0)

      // Fix A4: Validasi semua pembayaranId milik siswa yang sama
      // untuk mencegah cross-siswa link pembayaran.
      const pembayaranIds = input.items
        .map((i) => i.pembayaranId)
        .filter((id): id is string => id != null)

      if (pembayaranIds.length > 0) {
        const validCount = await tx.pembayaran.count({
          where: { id: { in: pembayaranIds }, siswaId: input.siswaId },
        })
        if (validCount !== pembayaranIds.length) {
          throw new ValidationError('Beberapa pembayaranId tidak valid atau bukan milik siswa ini.')
        }
      }

      // Pastikan tidak ada duplikat kwitansi per bulan untuk siswa yg sama di hari yg sama
      // (boleh buat kwitansi berbeda hari untuk bulan yang sama)

      // Generate nomor dalam transaction agar sequence aman dari race condition
      const nomorKwitansi = await generateNomor(tanggal, tx)

      const k = await tx.kwitansi.create({
        data: {
          nomorKwitansi,
          siswaId: input.siswaId,
          tanggal,
          totalAmount,
          biayaAdm: input.biayaAdm,
          namaOrangTua: input.namaOrangTua ?? null,
          catatan: input.catatan ?? null,
          createdById,
          items: {
            create: input.items.map((item) => ({
              periodYear:   item.periodYear,
              periodMonth:  item.periodMonth,
              amount:       item.amount,
              keterangan:   item.keterangan ?? null,
              pembayaranId: item.pembayaranId ?? null,
            })),
          },
        },
        include: WITH_RELATIONS,
      })

      return toDto(k)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  },

  async delete(id: string): Promise<void> {
    const k = await prisma.kwitansi.findUnique({ where: { id } })
    if (!k) throw new NotFoundError(`Kwitansi ${id} tidak ditemukan.`)
    await prisma.kwitansi.delete({ where: { id } })
  },
}
