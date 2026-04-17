import { z } from 'zod'

import { PAGINATION } from '@/core/constants'
import { idSchema } from '@/lib/validators/common.schema'

/**
 * Keringanan (waiver) validators.
 *
 * - `create`: one waiver entry for a single (siswa, year, month) tuple.
 * - `bulkAssign`: expand (siswaIds × periods) server-side; createMany with
 *   skipDuplicates so it's idempotent.
 * - `update`: only mutable fields. Periode / siswa tidak boleh dipindah —
 *   hapus + buat baru kalau perlu.
 * - `filter`: query params untuk list endpoint.
 */

export const JENIS_KERINGANAN = [
  'JUARA',
  'OSN',
  'JUARA_UMUM',
  'BEASISWA',
  'KELUARGA_TIDAK_MAMPU',
  'LAINNYA',
] as const

export type JenisKeringanan = (typeof JENIS_KERINGANAN)[number]

const yearSchema = z
  .number({ invalid_type_error: 'Tahun harus berupa angka.' })
  .int('Tahun harus bilangan bulat.')
  .min(2000, 'Tahun terlalu kecil.')
  .max(2100, 'Tahun terlalu besar.')

const monthSchema = z
  .number({ invalid_type_error: 'Bulan harus berupa angka.' })
  .int('Bulan harus bilangan bulat.')
  .min(1, 'Bulan minimal 1.')
  .max(12, 'Bulan maksimal 12.')

const persentaseSchema = z
  .number({ invalid_type_error: 'Persentase harus berupa angka.' })
  .int('Persentase harus bilangan bulat.')
  .min(0, 'Persentase minimal 0.')
  .max(100, 'Persentase maksimal 100.')

const alasanSchema = z.string().trim().max(500, 'Alasan terlalu panjang.').optional()

const periodTupleSchema = z.object({
  year: yearSchema,
  month: monthSchema,
})

export type PeriodTuple = z.infer<typeof periodTupleSchema>

/**
 * Create single keringanan.
 */
export const keringananCreateSchema = z.object({
  siswaId: idSchema,
  periodYear: yearSchema,
  periodMonth: monthSchema,
  jenis: z.enum(JENIS_KERINGANAN, {
    errorMap: () => ({ message: 'Jenis keringanan tidak valid.' }),
  }),
  persentase: persentaseSchema.default(100),
  alasan: alasanSchema,
  buktiUrl: z.string().trim().url('URL bukti tidak valid.').max(500).optional(),
})

export type KeringananCreateInput = z.infer<typeof keringananCreateSchema>

/**
 * Bulk assign — expand cross product (siswaIds × periods) server-side.
 */
export const keringananBulkAssignSchema = z.object({
  siswaIds: z
    .array(idSchema)
    .min(1, 'Pilih minimal satu siswa.')
    .max(500, 'Maksimal 500 siswa per batch.'),
  periods: z
    .array(periodTupleSchema)
    .min(1, 'Pilih minimal satu bulan.')
    .max(60, 'Maksimal 60 bulan per batch.'),
  jenis: z.enum(JENIS_KERINGANAN, {
    errorMap: () => ({ message: 'Jenis keringanan tidak valid.' }),
  }),
  persentase: persentaseSchema.default(100),
  alasan: alasanSchema,
  buktiUrl: z.string().trim().url('URL bukti tidak valid.').max(500).optional(),
})

export type KeringananBulkAssignInput = z.infer<typeof keringananBulkAssignSchema>

/**
 * Update — mutable fields only.
 */
export const keringananUpdateSchema = z
  .object({
    jenis: z
      .enum(JENIS_KERINGANAN, {
        errorMap: () => ({ message: 'Jenis keringanan tidak valid.' }),
      })
      .optional(),
    persentase: persentaseSchema.optional(),
    alasan: alasanSchema,
    buktiUrl: z
      .string()
      .trim()
      .url('URL bukti tidak valid.')
      .max(500)
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Tidak ada perubahan.',
  })

export type KeringananUpdateInput = z.infer<typeof keringananUpdateSchema>

/**
 * Filter for list endpoint. Query params.
 */
export const keringananFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
  siswaId: idSchema.optional(),
  jenis: z.enum(JENIS_KERINGANAN).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  angkatan: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type KeringananFilterInput = z.infer<typeof keringananFilterSchema>
