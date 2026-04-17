import type { Prisma, Rombel, TahunAjaran } from '@prisma/client'

import { prisma } from '@/lib/db'
import { rombelRepo } from '@/repositories/rombel.repo'
import { ConflictError, NotFoundError } from '@/core/errors'
import { PAGINATION } from '@/core/constants'
import type { RombelCreateInput, RombelFilterInput, RombelUpdateInput } from '@/lib/validators/rombel.schema'
import type { RombelDTO, TahunAjaranDTO } from '@/types/domain'

function toTahunAjaranDTO(t: TahunAjaran): TahunAjaranDTO {
  return {
    id: t.id,
    kode: t.kode,
    tahunMulai: t.tahunMulai,
    tahunAkhir: t.tahunAkhir,
    tanggalMulai: t.tanggalMulai.toISOString(),
    tanggalAkhir: t.tanggalAkhir.toISOString(),
    isActive: t.isActive,
    nominalSppDefault: Number(t.nominalSppDefault),
    createdAt: t.createdAt.toISOString(),
  }
}

function toDTO(
  r: Rombel & { tahunAjaran?: TahunAjaran | null; _count?: { enrollments: number } },
): RombelDTO {
  return {
    id: r.id,
    tahunAjaranId: r.tahunAjaranId,
    tahunAjaran: r.tahunAjaran ? toTahunAjaranDTO(r.tahunAjaran) : null,
    grade: r.grade,
    nomor: r.nomor,
    kode: r.kode,
    waliKelas: r.waliKelas,
    createdAt: r.createdAt.toISOString(),
    jumlahSiswa: r._count?.enrollments ?? undefined,
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

export const rombelService = {
  async list(input: RombelFilterInput): Promise<{
    items: RombelDTO[]
    total: number
    page: number
    limit: number
  }> {
    const page = input.page ?? PAGINATION.DEFAULT_PAGE
    const limit = input.limit ?? PAGINATION.DEFAULT_LIMIT
    const where: Prisma.RombelWhereInput = {}
    if (input.tahunAjaranId) where.tahunAjaranId = input.tahunAjaranId
    if (input.grade) where.grade = input.grade
    if (input.search && input.search.trim()) {
      where.OR = [
        { kode: { contains: input.search.trim(), mode: 'insensitive' } },
        { waliKelas: { contains: input.search.trim(), mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.rombel.findMany({
        where,
        include: {
          tahunAjaran: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: [{ grade: 'asc' }, { nomor: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      rombelRepo.count(where),
    ])

    return {
      items: items.map(toDTO),
      total,
      page,
      limit,
    }
  },

  async getById(id: string): Promise<RombelDTO> {
    const row = await prisma.rombel.findUnique({
      where: { id },
      include: {
        tahunAjaran: true,
        _count: { select: { enrollments: true } },
      },
    })
    if (!row) throw new NotFoundError('Rombel tidak ditemukan.')
    return toDTO(row)
  },

  async create(input: RombelCreateInput): Promise<RombelDTO> {
    const ta = await prisma.tahunAjaran.findUnique({ where: { id: input.tahunAjaranId } })
    if (!ta) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
    try {
      const created = await prisma.rombel.create({
        data: {
          tahunAjaranId: input.tahunAjaranId,
          grade: input.grade,
          nomor: input.nomor,
          kode: input.kode,
          waliKelas: input.waliKelas ?? undefined,
        },
        include: { tahunAjaran: true, _count: { select: { enrollments: true } } },
      })
      return toDTO(created)
    } catch (err) {
      if (isUniqueError(err))
        throw new ConflictError('Kode atau nomor rombel sudah ada untuk tahun ajaran ini.')
      throw err
    }
  },

  async update(id: string, input: RombelUpdateInput): Promise<RombelDTO> {
    const exists = await rombelRepo.findById(id)
    if (!exists) throw new NotFoundError('Rombel tidak ditemukan.')
    try {
      const data: Prisma.RombelUpdateInput = {}
      if (input.tahunAjaranId !== undefined) {
        const ta = await prisma.tahunAjaran.findUnique({ where: { id: input.tahunAjaranId } })
        if (!ta) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
        data.tahunAjaran = { connect: { id: input.tahunAjaranId } }
      }
      if (input.grade !== undefined) data.grade = input.grade
      if (input.nomor !== undefined) data.nomor = input.nomor
      if (input.kode !== undefined) data.kode = input.kode
      if (input.waliKelas !== undefined) data.waliKelas = input.waliKelas ?? null

      const updated = await prisma.rombel.update({
        where: { id },
        data,
        include: { tahunAjaran: true, _count: { select: { enrollments: true } } },
      })
      return toDTO(updated)
    } catch (err) {
      if (isUniqueError(err))
        throw new ConflictError('Kode atau nomor rombel sudah ada untuk tahun ajaran ini.')
      throw err
    }
  },

  async remove(id: string): Promise<void> {
    const exists = await prisma.rombel.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    })
    if (!exists) throw new NotFoundError('Rombel tidak ditemukan.')
    if (exists._count.enrollments > 0) {
      throw new ConflictError('Rombel tidak bisa dihapus karena masih memiliki siswa terdaftar.')
    }
    await rombelRepo.delete(id)
  },

  toDTO,
}
