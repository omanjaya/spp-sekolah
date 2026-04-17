import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const userRepo = {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  },
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } })
  },
  async findMany(args?: Prisma.UserFindManyArgs) {
    return prisma.user.findMany(args)
  },
  async list() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    })
  },
  async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data })
  },
  async update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data })
  },
  async touchLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    })
  },
  async setActive(id: string, isActive: boolean) {
    return prisma.user.update({ where: { id }, data: { isActive } })
  },
  async delete(id: string) {
    return prisma.user.delete({ where: { id } })
  },
}
