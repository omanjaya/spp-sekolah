import { z } from 'zod'
import { PAGINATION } from '@/core/constants'

/**
 * Prisma `cuid()` ids are 25 char base36. We allow cuid2 (24+) too by not
 * hard-fixing the length. Also allows underscores and hyphens for IDs
 * yang di-generate manual saat bulk seed / backfill (mis. `siswa_2027_26510`).
 */
export const idSchema = z
  .string({ required_error: 'ID wajib diisi.' })
  .trim()
  .min(1, 'ID tidak boleh kosong.')
  .max(64, 'ID tidak valid.')
  .regex(/^[a-z0-9_-]+$/i, 'Format ID tidak valid.')

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type Pagination = z.infer<typeof paginationSchema>

export const searchSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
  })
  .merge(paginationSchema)

export type SearchInput = z.infer<typeof searchSchema>
