import { z } from 'zod'

import { idSchema, paginationSchema } from './common.schema'

/** 12 months January..December. */
const monthSchema = z.coerce.number().int().min(1).max(12)

/** Year range broad enough for historical and future periods. */
const yearSchema = z.coerce.number().int().min(2000).max(2100)

const amountSchema = z.coerce
  .number({ invalid_type_error: 'Nominal harus berupa angka.' })
  .min(0, 'Nominal tidak boleh negatif.')
  .max(1_000_000_000, 'Nominal tidak wajar.')

/**
 * Create a single pembayaran manually (Source = MANUAL).
 */
export const pembayaranManualCreateSchema = z.object({
  siswaId: idSchema,
  periodYear: yearSchema,
  periodMonth: monthSchema,
  amount: amountSchema,
  biayaAdm: amountSchema.default(0),
  tanggalTransaksi: z.coerce.date(),
  kodeCabang: z.string().trim().max(32).optional(),
  catatan: z.string().trim().max(500).optional(),
})
export type PembayaranManualCreateInput = z.infer<typeof pembayaranManualCreateSchema>

/**
 * Update is limited to safe fields only (notes + optional cabang).
 */
export const pembayaranUpdateSchema = z.object({
  catatan: z.string().trim().max(500).nullish(),
  kodeCabang: z.string().trim().max(32).nullish(),
})
export type PembayaranUpdateInput = z.infer<typeof pembayaranUpdateSchema>

/**
 * Filter list of pembayaran.
 */
export const pembayaranFilterSchema = paginationSchema.extend({
  siswaId: idSchema.optional(),
  angkatan: z.coerce.number().int().min(2000).max(2100).optional(),
  rombelId: idSchema.optional(),
  tahunAjaranId: idSchema.optional(),
  year: yearSchema.optional(),
  yearFrom: yearSchema.optional(),
  yearTo: yearSchema.optional(),
  month: monthSchema.optional(),
  monthFrom: monthSchema.optional(),
  monthTo: monthSchema.optional(),
  kodeCabang: z.string().trim().max(32).optional(),
  tellerUser: z.string().trim().max(64).optional(),
  status: z.enum(['TERBAYAR', 'DIBATALKAN']).optional(),
  source: z.enum(['IMPORT_EXCEL', 'PASTE_SPREADSHEET', 'MANUAL']).optional(),
  duplikat: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(200).optional(),
})
export type PembayaranFilterInput = z.infer<typeof pembayaranFilterSchema>

/**
 * Cancel (soft-delete) request body.
 */
export const pembayaranCancelSchema = z.object({
  catatan: z.string().trim().min(1, 'Alasan pembatalan wajib diisi.').max(500),
})
export type PembayaranCancelInput = z.infer<typeof pembayaranCancelSchema>

/**
 * Paste TSV body: raw text from spreadsheet clipboard.
 */
export const pembayaranPasteSchema = z.object({
  text: z
    .string()
    .min(1, 'Teks paste wajib diisi.')
    .max(500_000, 'Teks terlalu besar. Potong dulu lalu paste bertahap.'),
})
export type PembayaranPasteInput = z.infer<typeof pembayaranPasteSchema>
