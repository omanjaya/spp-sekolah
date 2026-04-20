import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { ValidationError } from '@/core/errors'
import { periodeLockService } from '@/services/periode-lock.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Param format: `2026-07` (YYYY-MM)
 */
function parseYearMonth(raw: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!match) {
    throw new ValidationError('Format periode tidak valid. Gunakan YYYY-MM (contoh: 2026-07).', {})
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) {
    throw new ValidationError('Bulan harus antara 01 dan 12.', {})
  }
  return { year, month }
}

export const DELETE = apiHandler<unknown, { yearMonth: string }>(async (_req, ctx) => {
  await requireRole([ROLES.SUPER_ADMIN])
  const { yearMonth } = await ctx.params
  const { year, month } = parseYearMonth(yearMonth)
  await periodeLockService.unlock(year, month)
  return { message: `Periode ${yearMonth} berhasil dibuka.` }
})
