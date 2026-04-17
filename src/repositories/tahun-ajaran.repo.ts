import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const tahunAjaranRepo = {
  async findById(id: string) {
    return prisma.tahunAjaran.findUnique({ where: { id } })
  },
  async findByKode(kode: string) {
    return prisma.tahunAjaran.findUnique({ where: { kode } })
  },
  async findActive() {
    return prisma.tahunAjaran.findFirst({ where: { isActive: true } })
  },
  async findMany(args?: Prisma.TahunAjaranFindManyArgs) {
    return prisma.tahunAjaran.findMany(args)
  },
  async list() {
    return prisma.tahunAjaran.findMany({
      orderBy: [{ tahunMulai: 'desc' }],
    })
  },
  async create(data: Prisma.TahunAjaranCreateInput) {
    return prisma.tahunAjaran.create({ data })
  },
  async update(id: string, data: Prisma.TahunAjaranUpdateInput) {
    return prisma.tahunAjaran.update({ where: { id }, data })
  },
  async setActive(id: string) {
    // Only one active tahun ajaran at a time.
    return prisma.$transaction([
      prisma.tahunAjaran.updateMany({
        where: { isActive: true, NOT: { id } },
        data: { isActive: false },
      }),
      prisma.tahunAjaran.update({ where: { id }, data: { isActive: true } }),
    ])
  },
  async delete(id: string) {
    return prisma.tahunAjaran.delete({ where: { id } })
  },
}
