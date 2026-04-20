import { z } from 'zod'

import { PAGINATION } from '@/core/constants'
import { idSchema } from '@/lib/validators/common.schema'

export const refundCreateSchema = z.object({
  siswaId:      idSchema,
  pembayaranId: idSchema.optional(),
  amount:       z.number({ invalid_type_error: 'Jumlah harus berupa angka.' }).positive('Jumlah harus lebih dari 0.').max(1_000_000_000, 'Jumlah terlalu besar.'),
  alasan:       z.string({ required_error: 'Alasan wajib diisi.' }).trim().min(5, 'Alasan minimal 5 karakter.').max(500, 'Alasan maksimal 500 karakter.'),
  tanggal:      z.coerce.date({ required_error: 'Tanggal wajib diisi.' }),
  noBukti:      z.string().trim().max(64, 'No. bukti terlalu panjang.').optional().transform((v) => (v === '' ? undefined : v)),
})

export type RefundCreateInput = z.infer<typeof refundCreateSchema>

export const refundFilterSchema = z.object({
  siswaId:  idSchema.optional(),
  page:     z.coerce.number().int().positive().default(PAGINATION.DEFAULT_PAGE),
  limit:    z.coerce.number().int().positive().max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  dateFrom: z.coerce.date().optional(),
  dateTo:   z.coerce.date().optional(),
})

export type RefundFilterInput = z.infer<typeof refundFilterSchema>
