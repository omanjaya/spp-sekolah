import { Prisma, type TahunAjaran } from '@prisma/client'

import { prisma } from '@/lib/db'
import { tahunAjaranRepo } from '@/repositories/tahun-ajaran.repo'
import { ConflictError, NotFoundError } from '@/core/errors'
import type {
  TahunAjaranCreateInput,
  TahunAjaranUpdateInput,
} from '@/lib/validators/tahun-ajaran.schema'
import type { TahunAjaranDTO } from '@/types/domain'

function toDTO(t: TahunAjaran): TahunAjaranDTO {
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

function isUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}

export const tahunAjaranService = {
  async list(): Promise<TahunAjaranDTO[]> {
    const rows = await tahunAjaranRepo.list()
    return rows.map(toDTO)
  },

  async getById(id: string): Promise<TahunAjaranDTO> {
    const row = await tahunAjaranRepo.findById(id)
    if (!row) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
    return toDTO(row)
  },

  async getActive(): Promise<TahunAjaranDTO | null> {
    const row = await tahunAjaranRepo.findActive()
    return row ? toDTO(row) : null
  },

  async create(input: TahunAjaranCreateInput): Promise<TahunAjaranDTO> {
    try {
      const created = await tahunAjaranRepo.create({
        kode: input.kode,
        tahunMulai: input.tahunMulai,
        tahunAkhir: input.tahunAkhir,
        tanggalMulai: new Date(input.tanggalMulai),
        tanggalAkhir: new Date(input.tanggalAkhir),
        nominalSppDefault: new Prisma.Decimal(input.nominalSppDefault),
        isActive: input.isActive ?? false,
      })
      if (input.isActive) {
        await tahunAjaranRepo.setActive(created.id)
      }
      return toDTO(created)
    } catch (err) {
      if (isUniqueError(err)) throw new ConflictError('Kode tahun ajaran sudah ada.')
      throw err
    }
  },

  async update(id: string, input: TahunAjaranUpdateInput): Promise<TahunAjaranDTO> {
    const exists = await tahunAjaranRepo.findById(id)
    if (!exists) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
    try {
      const data: Prisma.TahunAjaranUpdateInput = {}
      if (input.kode !== undefined) data.kode = input.kode
      if (input.tahunMulai !== undefined) data.tahunMulai = input.tahunMulai
      if (input.tahunAkhir !== undefined) data.tahunAkhir = input.tahunAkhir
      if (input.tanggalMulai !== undefined) data.tanggalMulai = new Date(input.tanggalMulai)
      if (input.tanggalAkhir !== undefined) data.tanggalAkhir = new Date(input.tanggalAkhir)
      if (input.nominalSppDefault !== undefined)
        data.nominalSppDefault = new Prisma.Decimal(input.nominalSppDefault)
      if (input.isActive !== undefined) data.isActive = input.isActive

      const updated = await tahunAjaranRepo.update(id, data)
      if (input.isActive === true) {
        await tahunAjaranRepo.setActive(id)
      }
      return toDTO(updated)
    } catch (err) {
      if (isUniqueError(err)) throw new ConflictError('Kode tahun ajaran sudah ada.')
      throw err
    }
  },

  async setActive(id: string): Promise<TahunAjaranDTO> {
    const exists = await tahunAjaranRepo.findById(id)
    if (!exists) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
    await tahunAjaranRepo.setActive(id)
    const fresh = await tahunAjaranRepo.findById(id)
    if (!fresh) throw new NotFoundError('Tahun ajaran tidak ditemukan setelah aktivasi.')
    return toDTO(fresh)
  },

  async remove(id: string): Promise<void> {
    const exists = await prisma.tahunAjaran.findUnique({
      where: { id },
      include: { _count: { select: { rombels: true, enrollments: true } } },
    })
    if (!exists) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
    if (exists._count.rombels > 0 || exists._count.enrollments > 0) {
      throw new ConflictError(
        'Tahun ajaran tidak bisa dihapus karena masih memiliki rombel atau enrollment.',
      )
    }
    await tahunAjaranRepo.delete(id)
  },

  toDTO,
}
