import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const siswaRepo = {
  async findById(id: string) {
    return prisma.siswa.findUnique({ where: { id } })
  },
  async findByNis(nis: string) {
    return prisma.siswa.findUnique({ where: { nis } })
  },
  async findMany(args?: Prisma.SiswaFindManyArgs) {
    return prisma.siswa.findMany(args)
  },
  async create(data: Prisma.SiswaCreateInput) {
    return prisma.siswa.create({ data })
  },
  async createMany(data: Prisma.SiswaCreateManyInput[]) {
    return prisma.siswa.createMany({ data, skipDuplicates: true })
  },
  async update(id: string, data: Prisma.SiswaUpdateInput) {
    return prisma.siswa.update({ where: { id }, data })
  },
  async delete(id: string) {
    return prisma.siswa.delete({ where: { id } })
  },
  async count(where?: Prisma.SiswaWhereInput) {
    return prisma.siswa.count({ where })
  },
  async search(q: string, take = 20) {
    return prisma.siswa.findMany({
      where: {
        OR: [
          { nis: { contains: q, mode: 'insensitive' } },
          { nama: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { nama: 'asc' },
    })
  },
}
