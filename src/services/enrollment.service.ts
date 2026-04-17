import type { Enrollment, Prisma, Rombel, Siswa, TahunAjaran } from '@prisma/client'

import { prisma } from '@/lib/db'
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import type {
  EnrollmentBulkAssignInput,
  EnrollmentFilterInput,
} from '@/lib/validators/enrollment.schema'
import type { BulkResult, EnrollmentDTO } from '@/types/domain'

type EnrollmentWithRelations = Enrollment & {
  siswa?: Siswa | null
  rombel?: Rombel | null
  tahunAjaran?: TahunAjaran | null
}

function toDTO(e: EnrollmentWithRelations): EnrollmentDTO {
  return {
    id: e.id,
    siswaId: e.siswaId,
    rombelId: e.rombelId,
    tahunAjaranId: e.tahunAjaranId,
    noAbsen: e.noAbsen,
    createdAt: e.createdAt.toISOString(),
    siswa: e.siswa
      ? {
          id: e.siswa.id,
          nis: e.siswa.nis,
          nama: e.siswa.nama,
          jenisKelamin: e.siswa.jenisKelamin,
          angkatan: e.siswa.angkatan,
          statusSiswa: e.siswa.statusSiswa,
          alamat: e.siswa.alamat,
          kontakOrtu: e.siswa.kontakOrtu,
          catatan: e.siswa.catatan,
          createdAt: e.siswa.createdAt.toISOString(),
          updatedAt: e.siswa.updatedAt.toISOString(),
        }
      : null,
    rombel: e.rombel
      ? {
          id: e.rombel.id,
          tahunAjaranId: e.rombel.tahunAjaranId,
          grade: e.rombel.grade,
          nomor: e.rombel.nomor,
          kode: e.rombel.kode,
          waliKelas: e.rombel.waliKelas,
          createdAt: e.rombel.createdAt.toISOString(),
        }
      : null,
    tahunAjaran: e.tahunAjaran
      ? {
          id: e.tahunAjaran.id,
          kode: e.tahunAjaran.kode,
          tahunMulai: e.tahunAjaran.tahunMulai,
          tahunAkhir: e.tahunAjaran.tahunAkhir,
          tanggalMulai: e.tahunAjaran.tanggalMulai.toISOString(),
          tanggalAkhir: e.tahunAjaran.tanggalAkhir.toISOString(),
          isActive: e.tahunAjaran.isActive,
          nominalSppDefault: Number(e.tahunAjaran.nominalSppDefault),
          createdAt: e.tahunAjaran.createdAt.toISOString(),
        }
      : null,
  }
}

export const enrollmentService = {
  async list(input: EnrollmentFilterInput): Promise<{
    items: EnrollmentDTO[]
    total: number
    page: number
    limit: number
  }> {
    const page = input.page ?? PAGINATION.DEFAULT_PAGE
    const limit = input.limit ?? PAGINATION.DEFAULT_LIMIT
    const where: Prisma.EnrollmentWhereInput = {}
    if (input.tahunAjaranId) where.tahunAjaranId = input.tahunAjaranId
    if (input.rombelId) where.rombelId = input.rombelId
    if (input.siswaId) where.siswaId = input.siswaId

    const [items, total] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        include: { siswa: true, rombel: true, tahunAjaran: true },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.enrollment.count({ where }),
    ])

    return {
      items: items.map(toDTO),
      total,
      page,
      limit,
    }
  },

  async bulkAssign(input: EnrollmentBulkAssignInput): Promise<BulkResult> {
    // Validasi rombel
    const rombel = await prisma.rombel.findUnique({ where: { id: input.rombelId } })
    if (!rombel) throw new NotFoundError('Rombel tidak ditemukan.')
    if (rombel.tahunAjaranId !== input.tahunAjaranId) {
      throw new ValidationError('Rombel tidak berada di tahun ajaran yang dipilih.')
    }

    const result: BulkResult = {
      total: input.items.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }

    await prisma.$transaction(async (tx) => {
      // Batch lookup: satu query untuk semua siswa sekaligus
      const allSiswaIds = input.items.map((item) => item.siswaId)
      const siswaList = await tx.siswa.findMany({ where: { id: { in: allSiswaIds } } })
      const siswaMap = new Map(siswaList.map((s) => [s.id, s]))

      // Batch lookup: satu query untuk semua enrollment yang ada sekaligus
      const enrollmentList = await tx.enrollment.findMany({
        where: {
          siswaId: { in: allSiswaIds },
          tahunAjaranId: input.tahunAjaranId,
        },
      })
      const enrollmentMap = new Map(
        enrollmentList.map((e) => [`${e.siswaId}-${e.tahunAjaranId}`, e]),
      )

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i]
        if (!item) continue
        try {
          // Cek siswa ada
          const siswa = siswaMap.get(item.siswaId)
          if (!siswa) {
            result.errors.push({ row: i + 1, message: 'Siswa tidak ditemukan.', data: item })
            result.skipped += 1
            continue
          }

          const existing = enrollmentMap.get(`${item.siswaId}-${input.tahunAjaranId}`)

          if (existing) {
            if (existing.rombelId === input.rombelId) {
              // Update noAbsen bila berbeda.
              if ((existing.noAbsen ?? null) !== (item.noAbsen ?? null)) {
                await tx.enrollment.update({
                  where: { id: existing.id },
                  data: { noAbsen: item.noAbsen ?? null },
                })
                result.updated += 1
              } else {
                result.skipped += 1
              }
            } else if (input.movePindahKelas) {
              await tx.enrollment.update({
                where: { id: existing.id },
                data: {
                  rombelId: input.rombelId,
                  noAbsen: item.noAbsen ?? null,
                },
              })
              result.updated += 1
            } else {
              result.errors.push({
                row: i + 1,
                message: 'Siswa sudah terdaftar di rombel lain. Aktifkan opsi pindah kelas.',
                data: item,
              })
              result.skipped += 1
            }
            continue
          }

          await tx.enrollment.create({
            data: {
              siswaId: item.siswaId,
              rombelId: input.rombelId,
              tahunAjaranId: input.tahunAjaranId,
              noAbsen: item.noAbsen ?? null,
            },
          })
          result.created += 1
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Kesalahan tidak diketahui.'
          result.errors.push({ row: i + 1, message, data: item })
          result.skipped += 1
        }
      }
    })

    return result
  },

  async pindahRombel(enrollmentId: string, newRombelId: string): Promise<EnrollmentDTO> {
    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) throw new NotFoundError('Enrollment tidak ditemukan.')
    const rombel = await prisma.rombel.findUnique({ where: { id: newRombelId } })
    if (!rombel) throw new NotFoundError('Rombel tujuan tidak ditemukan.')
    if (rombel.tahunAjaranId !== enrollment.tahunAjaranId) {
      throw new ConflictError('Rombel tujuan berada di tahun ajaran berbeda.')
    }
    const updated = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { rombelId: newRombelId },
      include: { siswa: true, rombel: true, tahunAjaran: true },
    })
    return toDTO(updated)
  },

  async remove(id: string): Promise<void> {
    const exists = await prisma.enrollment.findUnique({ where: { id } })
    if (!exists) throw new NotFoundError('Enrollment tidak ditemukan.')
    await prisma.enrollment.delete({ where: { id } })
  },

  toDTO,
}
