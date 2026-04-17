import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const importBatchRepo = {
  async findById(id: string) {
    return prisma.importBatch.findUnique({ where: { id } })
  },
  async findByFileHash(fileHash: string) {
    return prisma.importBatch.findFirst({
      where: { fileHash },
      orderBy: { uploadedAt: 'desc' },
    })
  },
  async findMany(args?: Prisma.ImportBatchFindManyArgs) {
    return prisma.importBatch.findMany(args)
  },
  async list(take = 50) {
    return prisma.importBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      take,
    })
  },
  async create(data: Prisma.ImportBatchCreateInput) {
    return prisma.importBatch.create({ data })
  },
  async update(id: string, data: Prisma.ImportBatchUpdateInput) {
    return prisma.importBatch.update({ where: { id }, data })
  },
  async setStatus(
    id: string,
    status: Prisma.ImportBatchUpdateInput['status'],
    counts?: {
      successCount?: number
      duplicateCount?: number
      errorCount?: number
      errorDetails?: Prisma.InputJsonValue
    },
  ) {
    return prisma.importBatch.update({
      where: { id },
      data: { status, ...counts },
    })
  },
}
