import { prisma } from '@/lib/db'
import { ConflictError, NotFoundError } from '@/core/errors'

export interface PeriodeLockDto {
  id: string
  periodYear: number
  periodMonth: number
  lockedAt: string
  lockedById: string
  lockedByNama: string | null
  catatan: string | null
}

function toDto(
  p: {
    id: string
    periodYear: number
    periodMonth: number
    lockedAt: Date
    lockedById: string
    catatan: string | null
    lockedBy: { nama: string }
  },
): PeriodeLockDto {
  return {
    id: p.id,
    periodYear: p.periodYear,
    periodMonth: p.periodMonth,
    lockedAt: p.lockedAt.toISOString(),
    lockedById: p.lockedById,
    lockedByNama: p.lockedBy.nama,
    catatan: p.catatan,
  }
}

const includeLockedBy = {
  lockedBy: { select: { nama: true } },
} as const

export const periodeLockService = {
  /** List semua periode yang dikunci, urut terbaru dulu. */
  async list(): Promise<PeriodeLockDto[]> {
    const rows = await prisma.periodeLock.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: includeLockedBy,
    })
    return rows.map(toDto)
  },

  /** Cek apakah satu periode terkunci. */
  async isLocked(year: number, month: number): Promise<boolean> {
    const row = await prisma.periodeLock.findUnique({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      select: { id: true },
    })
    return row !== null
  },

  /** Kunci satu periode. Lempar ConflictError jika sudah terkunci. */
  async lock(
    year: number,
    month: number,
    userId: string,
    catatan?: string,
  ): Promise<PeriodeLockDto> {
    const existing = await prisma.periodeLock.findUnique({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictError(`Periode ${year}/${String(month).padStart(2, '0')} sudah dikunci.`)
    }

    const created = await prisma.periodeLock.create({
      data: {
        periodYear: year,
        periodMonth: month,
        lockedById: userId,
        catatan: catatan ?? null,
      },
      include: includeLockedBy,
    })
    return toDto(created)
  },

  /** Buka kunci satu periode. Lempar NotFoundError jika tidak ada. */
  async unlock(year: number, month: number): Promise<void> {
    const existing = await prisma.periodeLock.findUnique({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundError(
        `Periode ${year}/${String(month).padStart(2, '0')} tidak terkunci.`,
      )
    }
    await prisma.periodeLock.delete({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
    })
  },
}
