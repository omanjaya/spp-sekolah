import { z } from 'zod'

import { PAGINATION } from '@/core/constants'
import { idSchema } from '@/lib/validators/common.schema'

/**
 * Pelunasan (lunas sekaligus) validators.
 *
 * Periode disimpan sebagai string "YYYY-MM" (schema.prisma) — bukan tuple.
 * Validasi: periodeAkhir harus >= periodeMulai.
 *
 * - `create`: form input dari UI.
 * - `update`: hanya `catatan` yang mutable (sisanya historical).
 * - `filter`: list query params.
 */

const periodeMonthRegex = /^(\d{4})-(0[1-9]|1[0-2])$/

const periodeString = z
  .string({ required_error: 'Periode wajib diisi.' })
  .trim()
  .regex(periodeMonthRegex, 'Format periode harus YYYY-MM (misal 2024-07).')

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

export const pelunasanCreateSchema = z
  .object({
    siswaId: idSchema,
    periodeMulai: periodeString,
    periodeAkhir: periodeString,
    tanggalLunas: z
      .string({ required_error: 'Tanggal lunas wajib diisi.' })
      .trim()
      .regex(isoDateRegex, 'Format tanggal harus YYYY-MM-DD.')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal tidak valid.'),
    nominalTotal: z
      .number({ invalid_type_error: 'Nominal harus berupa angka.' })
      .positive('Nominal harus lebih besar dari 0.')
      .max(1_000_000_000, 'Nominal terlalu besar.'),
    noBukti: z
      .string()
      .trim()
      .max(64, 'No. bukti terlalu panjang.')
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    metodeLabel: z
      .string()
      .trim()
      .max(64, 'Metode terlalu panjang.')
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    catatan: z
      .string()
      .trim()
      .max(500, 'Catatan terlalu panjang.')
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine(
    (v) => {
      // compare "YYYY-MM" lexicographically — equivalent to numeric ordering
      return v.periodeAkhir >= v.periodeMulai
    },
    {
      message: 'Periode akhir harus setelah atau sama dengan periode mulai.',
      path: ['periodeAkhir'],
    },
  )

export type PelunasanCreateInput = z.infer<typeof pelunasanCreateSchema>

export const pelunasanUpdateSchema = z
  .object({
    catatan: z
      .string()
      .trim()
      .max(500, 'Catatan terlalu panjang.')
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Tidak ada perubahan.',
  })

export type PelunasanUpdateInput = z.infer<typeof pelunasanUpdateSchema>

export const pelunasanFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
  siswaId: idSchema.optional(),
  angkatan: z.coerce.number().int().min(2000).max(2100).optional(),
  tahun: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type PelunasanFilterInput = z.infer<typeof pelunasanFilterSchema>
