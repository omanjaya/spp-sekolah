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
import type {
  KwitansiCreateInput,
  KwitansiFilterInput,
  KwitansiItemInput,
  KwitansiUpdateInput,
} from '@/lib/validators/kwitansi.schema'

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface KwitansiItemDto {
  id: string
  periodYear: number
  periodMonth: number
  amount: number
  keterangan: string | null
  pembayaranId: string | null
  kategori: 'REGULER' | 'KERINGANAN'
  jenisKeringanan:
    | 'JUARA'
    | 'OSN'
    | 'JUARA_UMUM'
    | 'BEASISWA'
    | 'KELUARGA_TIDAK_MAMPU'
    | 'PINDAHAN'
    | 'IJAZAH'
    | 'LAINNYA'
    | null
}

/** Status bulan untuk siswa — dipakai UI untuk disable bulan duplikat. */
export interface SiswaMonthStatusDto {
  year: number
  month: number
  hasPembayaran: boolean
  hasKwitansiReguler: boolean
  kwitansiIds: string[]
  kwitansiNomors: string[]
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
    kelas: string | null
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
  siswa: {
    id: string
    nis: string
    nama: string
    angkatan: number
    enrollments?: Array<{
      rombel: { kode: string } | null
      tahunAjaran: { isActive: boolean } | null
    }>
  }
  createdBy: { id: string; nama: string }
  items: Array<{
    id: string
    periodYear: number
    periodMonth: number
    amount: { toNumber?: () => number } | number
    keterangan: string | null
    pembayaranId: string | null
    kategori: 'REGULER' | 'KERINGANAN'
    jenisKeringanan:
      | 'JUARA'
      | 'OSN'
      | 'JUARA_UMUM'
      | 'BEASISWA'
      | 'KELUARGA_TIDAK_MAMPU'
      | 'PINDAHAN'
      | 'IJAZAH'
      | 'LAINNYA'
      | null
    createdAt: Date
    kwitansiId: string
  }>
}

function asNumber(v: { toNumber?: () => number } | number): number {
  if (typeof v === 'number') return v
  return typeof v.toNumber === 'function' ? v.toNumber() : Number(v)
}

function toDto(k: KwitansiWithRelations): KwitansiDto {
  const enrollments = k.siswa.enrollments ?? []
  const activeEnrollment =
    enrollments.find((e) => e.tahunAjaran?.isActive) ?? enrollments[0]
  return {
    id: k.id,
    nomorKwitansi: k.nomorKwitansi,
    siswaId: k.siswaId,
    siswa: {
      id: k.siswa.id,
      nis: k.siswa.nis,
      nama: k.siswa.nama,
      angkatan: k.siswa.angkatan,
      kelas: activeEnrollment?.rombel?.kode ?? null,
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
      kategori: item.kategori,
      jenisKeringanan: item.jenisKeringanan,
    })),
  }
}

const WITH_RELATIONS = {
  siswa: {
    include: {
      enrollments: {
        include: {
          rombel: { select: { kode: true } },
          tahunAjaran: { select: { isActive: true } },
        },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
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

  // Pakai MAX(seq) + 1, bukan count + 1 — supaya gap (akibat delete) tidak
  // menyebabkan tabrakan unique constraint.
  const prefix = `KWT/${yyyy}/${mm}/`
  const latest = await tx.kwitansi.findFirst({
    where: {
      tanggal: { gte: startOfMonth, lte: endOfMonth },
      nomorKwitansi: { startsWith: prefix },
    },
    orderBy: { nomorKwitansi: 'desc' },
    select: { nomorKwitansi: true },
  })
  const lastSeq = latest ? Number(latest.nomorKwitansi.slice(-4)) : 0
  const seq = String(lastSeq + 1).padStart(4, '0')
  return `${prefix}${seq}`
}

/**
 * Validasi overlap: cek apakah ada KwitansiItem lain untuk (siswa, year, month)
 * dengan kategori REGULER. Kategori KERINGANAN boleh duplikat (IJAZAH + Sumbangan Komite OK).
 * `excludeKwitansiId` digunakan saat update — untuk exclude kwitansi yg sedang diedit.
 */
async function assertNoDuplicateRegulerItems(
  tx: Prisma.TransactionClient,
  siswaId: string,
  items: ReadonlyArray<KwitansiItemInput>,
  excludeKwitansiId?: string,
): Promise<void> {
  const reguler = items.filter((i) => (i.kategori ?? 'REGULER') === 'REGULER')
  if (reguler.length === 0) return

  const orClauses = reguler.map((i) => ({
    periodYear: i.periodYear,
    periodMonth: i.periodMonth,
  }))

  const existing = await tx.kwitansiItem.findMany({
    where: {
      kategori: 'REGULER',
      kwitansi: {
        siswaId,
        ...(excludeKwitansiId ? { id: { not: excludeKwitansiId } } : {}),
      },
      OR: orClauses,
    },
    select: {
      periodYear: true,
      periodMonth: true,
      kwitansi: { select: { nomorKwitansi: true } },
    },
  })

  if (existing.length > 0) {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
    ]
    const labels = existing
      .map((e) => `${monthNames[e.periodMonth - 1]} ${e.periodYear} (${e.kwitansi.nomorKwitansi})`)
      .join(', ')
    throw new ConflictError(
      `Bulan berikut sudah ada pada kwitansi reguler siswa ini: ${labels}.`,
    )
  }
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

      // Cegah overlap bulan REGULER dengan kwitansi lain milik siswa yg sama.
      // Kategori KERINGANAN (mis. IJAZAH) boleh duplikat di bulan yg sama.
      await assertNoDuplicateRegulerItems(tx, input.siswaId, input.items)

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
              periodYear:      item.periodYear,
              periodMonth:     item.periodMonth,
              amount:          item.amount,
              keterangan:      item.keterangan ?? null,
              pembayaranId:    item.pembayaranId ?? null,
              kategori:        item.kategori ?? 'REGULER',
              jenisKeringanan: item.kategori === 'KERINGANAN' ? (item.jenisKeringanan ?? null) : null,
            })),
          },
        },
        include: WITH_RELATIONS,
      })

      return toDto(k)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  },

  /**
   * Update kwitansi. nomorKwitansi, siswaId, createdById tidak bisa diubah.
   * Items di-recreate (delete all, insert all) dalam satu transaction.
   */
  async update(id: string, input: KwitansiUpdateInput): Promise<KwitansiDto> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.kwitansi.findUnique({
        where: { id },
        select: { id: true, siswaId: true, tanggal: true },
      })
      if (!existing) throw new NotFoundError(`Kwitansi ${id} tidak ditemukan.`)

      const tanggal = input.tanggal ?? existing.tanggal
      const totalAmount = input.items.reduce((s, i) => s + i.amount, 0)

      // Cross-siswa guard untuk pembayaranId.
      const pembayaranIds = input.items
        .map((i) => i.pembayaranId)
        .filter((pid): pid is string => pid != null)
      if (pembayaranIds.length > 0) {
        const validCount = await tx.pembayaran.count({
          where: { id: { in: pembayaranIds }, siswaId: existing.siswaId },
        })
        if (validCount !== pembayaranIds.length) {
          throw new ValidationError('Beberapa pembayaranId tidak valid atau bukan milik siswa ini.')
        }
      }

      // Cek duplicate — exclude self supaya edit di kwitansi yg sama tidak gagal.
      await assertNoDuplicateRegulerItems(tx, existing.siswaId, input.items, id)

      // Ganti items: delete semua lalu insert baru.
      await tx.kwitansiItem.deleteMany({ where: { kwitansiId: id } })

      const k = await tx.kwitansi.update({
        where: { id },
        data: {
          tanggal,
          totalAmount,
          biayaAdm: input.biayaAdm,
          namaOrangTua: input.namaOrangTua ?? null,
          catatan: input.catatan ?? null,
          items: {
            create: input.items.map((item) => ({
              periodYear:      item.periodYear,
              periodMonth:     item.periodMonth,
              amount:          item.amount,
              keterangan:      item.keterangan ?? null,
              pembayaranId:    item.pembayaranId ?? null,
              kategori:        item.kategori ?? 'REGULER',
              jenisKeringanan: item.kategori === 'KERINGANAN' ? (item.jenisKeringanan ?? null) : null,
            })),
          },
        },
        include: WITH_RELATIONS,
      })

      return toDto(k)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  },

  /**
   * Status bulan untuk siswa — return semua (year, month) unik yg sudah terdata
   * baik via Pembayaran maupun via KwitansiItem (REGULER).
   * UI pakai ini untuk disable bulan yg sudah kwitansi-ed + mark yg sudah bayar.
   */
  async getMonthsBySiswa(siswaId: string): Promise<SiswaMonthStatusDto[]> {
    const siswa = await prisma.siswa.findUnique({ where: { id: siswaId }, select: { id: true } })
    if (!siswa) throw new NotFoundError(`Siswa ${siswaId} tidak ditemukan.`)

    const [pembayaran, kwitansiItems] = await Promise.all([
      prisma.pembayaran.findMany({
        where: { siswaId, statusBayar: 'TERBAYAR' },
        select: { periodYear: true, periodMonth: true },
      }),
      prisma.kwitansiItem.findMany({
        where: { kategori: 'REGULER', kwitansi: { siswaId } },
        select: {
          periodYear: true,
          periodMonth: true,
          kwitansi: { select: { id: true, nomorKwitansi: true } },
        },
      }),
    ])

    const map = new Map<string, SiswaMonthStatusDto>()
    const keyOf = (y: number, m: number) => `${y}-${m}`

    for (const p of pembayaran) {
      const k = keyOf(p.periodYear, p.periodMonth)
      const row = map.get(k) ?? {
        year: p.periodYear,
        month: p.periodMonth,
        hasPembayaran: false,
        hasKwitansiReguler: false,
        kwitansiIds: [],
        kwitansiNomors: [],
      }
      row.hasPembayaran = true
      map.set(k, row)
    }

    for (const ki of kwitansiItems) {
      const k = keyOf(ki.periodYear, ki.periodMonth)
      const row = map.get(k) ?? {
        year: ki.periodYear,
        month: ki.periodMonth,
        hasPembayaran: false,
        hasKwitansiReguler: false,
        kwitansiIds: [],
        kwitansiNomors: [],
      }
      row.hasKwitansiReguler = true
      if (!row.kwitansiIds.includes(ki.kwitansi.id)) {
        row.kwitansiIds.push(ki.kwitansi.id)
        row.kwitansiNomors.push(ki.kwitansi.nomorKwitansi)
      }
      map.set(k, row)
    }

    return Array.from(map.values()).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    )
  },

  async delete(id: string): Promise<void> {
    const k = await prisma.kwitansi.findUnique({ where: { id } })
    if (!k) throw new NotFoundError(`Kwitansi ${id} tidak ditemukan.`)
    await prisma.kwitansi.delete({ where: { id } })
  },
}
