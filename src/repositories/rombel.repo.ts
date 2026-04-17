import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const rombelRepo = {
  async findById(id: string) {
    return prisma.rombel.findUnique({ where: { id } })
  },
  async findByKode(tahunAjaranId: string, kode: string) {
    return prisma.rombel.findUnique({
      where: { tahunAjaranId_kode: { tahunAjaranId, kode } },
    })
  },
  async findMany(args?: Prisma.RombelFindManyArgs) {
    return prisma.rombel.findMany(args)
  },
  async listByTahunAjaran(tahunAjaranId: string) {
    return prisma.rombel.findMany({
      where: { tahunAjaranId },
      orderBy: [{ grade: 'asc' }, { nomor: 'asc' }],
    })
  },
  async create(data: Prisma.RombelCreateInput) {
    return prisma.rombel.create({ data })
  },
  async update(id: string, data: Prisma.RombelUpdateInput) {
    return prisma.rombel.update({ where: { id }, data })
  },
  async delete(id: string) {
    return prisma.rombel.delete({ where: { id } })
  },
  async count(where?: Prisma.RombelWhereInput) {
    return prisma.rombel.count({ where })
  },
}
