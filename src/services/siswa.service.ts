import type { Prisma, Siswa } from '@prisma/client'

import { prisma } from '@/lib/db'
import { siswaRepo } from '@/repositories/siswa.repo'
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import type {
  SiswaBulkImportInput,
  SiswaCreateInput,
  SiswaFilterInput,
  SiswaUpdateInput,
} from '@/lib/validators/siswa.schema'
import type { BulkResult, EnrollmentDTO, SiswaDTO } from '@/types/domain'

function toSiswaDTO(
  s: Siswa & {
    enrollments?: Array<{
      id: string
      siswaId: string
      rombelId: string
      tahunAjaranId: string
      noAbsen: number | null
      createdAt: Date
      rombel?: {
        id: string
        tahunAjaranId: string
        grade: 'X' | 'XI' | 'XII'
        nomor: number
        kode: string
        waliKelas: string | null
        createdAt: Date
      }
      tahunAjaran?: {
        id: string
        kode: string
        isActive: boolean
      }
    }>
  },
): SiswaDTO {
  let enrollmentAktif: EnrollmentDTO | null = null
  if (s.enrollments && s.enrollments.length > 0) {
    const active = s.enrollments.find((e) => e.tahunAjaran?.isActive) ?? s.enrollments[0]
    if (active) {
      enrollmentAktif = {
        id: active.id,
        siswaId: active.siswaId,
        rombelId: active.rombelId,
        tahunAjaranId: active.tahunAjaranId,
        noAbsen: active.noAbsen,
        createdAt: active.createdAt.toISOString(),
        rombel: active.rombel
          ? {
              id: active.rombel.id,
              tahunAjaranId: active.rombel.tahunAjaranId,
              grade: active.rombel.grade,
              nomor: active.rombel.nomor,
              kode: active.rombel.kode,
              waliKelas: active.rombel.waliKelas,
              createdAt: active.rombel.createdAt.toISOString(),
            }
          : null,
      }
    }
  }

  return {
    id: s.id,
    nis: s.nis,
    nama: s.nama,
    jenisKelamin: s.jenisKelamin,
    angkatan: s.angkatan,
    statusSiswa: s.statusSiswa,
    alamat: s.alamat,
    kontakOrtu: s.kontakOrtu,
    catatan: s.catatan,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    enrollmentAktif,
  }
}

function isUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}

export const siswaService = {
  async list(input: SiswaFilterInput): Promise<{ items: SiswaDTO[]; total: number; page: number; limit: number }> {
    const page = input.page ?? PAGINATION.DEFAULT_PAGE
    const limit = input.limit ?? PAGINATION.DEFAULT_LIMIT
    const where: Prisma.SiswaWhereInput = {}
    if (input.angkatan) where.angkatan = input.angkatan
    if (input.status) where.statusSiswa = input.status
    if (input.search && input.search.trim()) {
      where.OR = [
        { nis: { contains: input.search.trim(), mode: 'insensitive' } },
        { nama: { contains: input.search.trim(), mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.siswa.findMany({
        where,
        orderBy: [{ nama: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          enrollments: {
            include: {
              rombel: true,
              tahunAjaran: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
      }),
      siswaRepo.count(where),
    ])
    return {
      items: items.map((s) => toSiswaDTO(s)),
      total,
      page,
      limit,
    }
  },

  async getById(id: string): Promise<SiswaDTO> {
    const siswa = await prisma.siswa.findUnique({
      where: { id },
      include: {
        enrollments: {
          include: { rombel: true, tahunAjaran: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')
    return toSiswaDTO(siswa)
  },

  async create(input: SiswaCreateInput): Promise<SiswaDTO> {
    try {
      const created = await siswaRepo.create({
        nis: input.nis,
        nama: input.nama,
        angkatan: input.angkatan,
        jenisKelamin: input.jenisKelamin ?? undefined,
        statusSiswa: input.statusSiswa ?? 'AKTIF',
        alamat: input.alamat ?? undefined,
        kontakOrtu: input.kontakOrtu ?? undefined,
        catatan: input.catatan ?? undefined,
      })
      return toSiswaDTO(created)
    } catch (err) {
      if (isUniqueError(err)) throw new ConflictError('NIS sudah terdaftar.')
      throw err
    }
  },

  async update(id: string, input: SiswaUpdateInput): Promise<SiswaDTO> {
    const exists = await siswaRepo.findById(id)
    if (!exists) throw new NotFoundError('Siswa tidak ditemukan.')
    try {
      const data: Prisma.SiswaUpdateInput = {}
      if (input.nis !== undefined) data.nis = input.nis
      if (input.nama !== undefined) data.nama = input.nama
      if (input.angkatan !== undefined) data.angkatan = input.angkatan
      if (input.jenisKelamin !== undefined) data.jenisKelamin = input.jenisKelamin ?? null
      if (input.statusSiswa !== undefined) data.statusSiswa = input.statusSiswa
      if (input.alamat !== undefined) data.alamat = input.alamat ?? null
      if (input.kontakOrtu !== undefined) data.kontakOrtu = input.kontakOrtu ?? null
      if (input.catatan !== undefined) data.catatan = input.catatan ?? null
      const updated = await siswaRepo.update(id, data)
      return toSiswaDTO(updated)
    } catch (err) {
      if (isUniqueError(err)) throw new ConflictError('NIS sudah terdaftar.')
      throw err
    }
  },

  async remove(id: string): Promise<void> {
    const exists = await siswaRepo.findById(id)
    if (!exists) throw new NotFoundError('Siswa tidak ditemukan.')
    try {
      await siswaRepo.delete(id)
    } catch (err) {
      // Restrict constraint fail: siswa masih punya pembayaran/pelunasan.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2003'
      ) {
        throw new ConflictError(
          'Siswa tidak bisa dihapus karena masih memiliki data pembayaran atau pelunasan.',
        )
      }
      throw err
    }
  },

  async bulkImport(input: SiswaBulkImportInput): Promise<BulkResult> {
    const result: BulkResult = {
      total: input.items.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }
    if (input.items.length === 0) {
      throw new ValidationError('Tidak ada data untuk diimpor.')
    }

    // Upsert per row dalam transaksi agar semua berhasil / rollback
    await prisma.$transaction(async (tx) => {
      // Batch lookup: satu query untuk semua NIS sekaligus
      const allNis = input.items.map((item) => item.nis)
      const existingList = await tx.siswa.findMany({ where: { nis: { in: allNis } } })
      const existingMap = new Map(existingList.map((s) => [s.nis, s]))

      for (let i = 0; i < input.items.length; i++) {
        const raw = input.items[i]
        if (!raw) continue
        try {
          const existing = existingMap.get(raw.nis)
          if (existing) {
            await tx.siswa.update({
              where: { id: existing.id },
              data: {
                nama: raw.nama,
                angkatan: raw.angkatan,
                jenisKelamin: raw.jenisKelamin ?? undefined,
                alamat: raw.alamat ?? undefined,
                kontakOrtu: raw.kontakOrtu ?? undefined,
              },
            })
            result.updated += 1
          } else {
            await tx.siswa.create({
              data: {
                nis: raw.nis,
                nama: raw.nama,
                angkatan: raw.angkatan,
                jenisKelamin: raw.jenisKelamin ?? undefined,
                alamat: raw.alamat ?? undefined,
                kontakOrtu: raw.kontakOrtu ?? undefined,
              },
            })
            result.created += 1
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Kesalahan tidak diketahui.'
          result.errors.push({ row: i + 1, message, data: raw })
          result.skipped += 1
        }
      }
    })
    return result
  },

  toDTO: toSiswaDTO,
}
