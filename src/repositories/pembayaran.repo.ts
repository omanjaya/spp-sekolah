import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const pembayaranRepo = {
  async findById(id: string) {
    return prisma.pembayaran.findUnique({ where: { id } })
  },
  async findByNoBukti(noBukti: string) {
    return prisma.pembayaran.findUnique({ where: { noBukti } })
  },
  async findByPeriod(siswaId: string, periodYear: number, periodMonth: number) {
    return prisma.pembayaran.findUnique({
      where: { siswaId_periodYear_periodMonth: { siswaId, periodYear, periodMonth } },
    })
  },
  async findMany(args?: Prisma.PembayaranFindManyArgs) {
    return prisma.pembayaran.findMany(args)
  },
  async listBySiswa(siswaId: string) {
    return prisma.pembayaran.findMany({
      where: { siswaId },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    })
  },
  async create(data: Prisma.PembayaranCreateInput) {
    return prisma.pembayaran.create({ data })
  },
  async createMany(data: Prisma.PembayaranCreateManyInput[]) {
    return prisma.pembayaran.createMany({ data, skipDuplicates: true })
  },
  async update(id: string, data: Prisma.PembayaranUpdateInput) {
    return prisma.pembayaran.update({ where: { id }, data })
  },
  async cancel(id: string, catatan?: string) {
    return prisma.pembayaran.update({
      where: { id },
      data: { statusBayar: 'DIBATALKAN', catatan },
    })
  },
  async count(where?: Prisma.PembayaranWhereInput) {
    return prisma.pembayaran.count({ where })
  },
}
