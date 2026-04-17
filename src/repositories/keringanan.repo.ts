import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const keringananRepo = {
  async findById(id: string) {
    return prisma.keringanan.findUnique({ where: { id } })
  },
  async findByPeriod(siswaId: string, periodYear: number, periodMonth: number) {
    return prisma.keringanan.findUnique({
      where: { siswaId_periodYear_periodMonth: { siswaId, periodYear, periodMonth } },
    })
  },
  async findMany(args?: Prisma.KeringananFindManyArgs) {
    return prisma.keringanan.findMany(args)
  },
  async listBySiswa(siswaId: string) {
    return prisma.keringanan.findMany({
      where: { siswaId },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    })
  },
  async create(data: Prisma.KeringananCreateInput) {
    return prisma.keringanan.create({ data })
  },
  async createMany(data: Prisma.KeringananCreateManyInput[]) {
    return prisma.keringanan.createMany({ data, skipDuplicates: true })
  },
  async update(id: string, data: Prisma.KeringananUpdateInput) {
    return prisma.keringanan.update({ where: { id }, data })
  },
  async delete(id: string) {
    return prisma.keringanan.delete({ where: { id } })
  },
  async count(where?: Prisma.KeringananWhereInput) {
    return prisma.keringanan.count({ where })
  },
}
