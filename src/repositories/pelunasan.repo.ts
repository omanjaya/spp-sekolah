import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const pelunasanRepo = {
  async findById(id: string) {
    return prisma.pelunasan.findUnique({ where: { id } })
  },
  async findByNoBukti(noBukti: string) {
    return prisma.pelunasan.findUnique({ where: { noBukti } })
  },
  async findMany(args?: Prisma.PelunasanFindManyArgs) {
    return prisma.pelunasan.findMany(args)
  },
  async listBySiswa(siswaId: string) {
    return prisma.pelunasan.findMany({
      where: { siswaId },
      orderBy: { tanggalLunas: 'desc' },
    })
  },
  async create(data: Prisma.PelunasanCreateInput) {
    return prisma.pelunasan.create({ data })
  },
  async update(id: string, data: Prisma.PelunasanUpdateInput) {
    return prisma.pelunasan.update({ where: { id }, data })
  },
  async delete(id: string) {
    return prisma.pelunasan.delete({ where: { id } })
  },
  async count(where?: Prisma.PelunasanWhereInput) {
    return prisma.pelunasan.count({ where })
  },
}
