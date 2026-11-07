import { z } from 'zod'
import { idSchema, paginationSchema } from './common.schema'

const monthSchema = z.coerce.number().int().min(1).max(12)
const yearSchema = z.coerce.number().int().min(2000).max(2100)
const amountSchema = z.coerce
  .number({ invalid_type_error: 'Nominal harus berupa angka.' })
  .min(0, 'Nominal tidak boleh negatif.')
  .max(1_000_000_000, 'Nominal tidak wajar.')

export const kwitansiKategoriSchema = z.enum(['REGULER', 'KERINGANAN'])
export type KwitansiKategori = z.infer<typeof kwitansiKategoriSchema>

export const jenisKeringananSchema = z.enum([
  'JUARA',
  'OSN',
  'JUARA_UMUM',
  'BEASISWA',
  'KELUARGA_TIDAK_MAMPU',
  'PINDAHAN',
  'IJAZAH',
  'LAINNYA',
])
export type JenisKeringanan = z.infer<typeof jenisKeringananSchema>

/** Satu baris bulan dalam kwitansi. */
export const kwitansiItemSchema = z
  .object({
    periodYear:      yearSchema,
    periodMonth:     monthSchema,
    amount:          amountSchema,
    keterangan:      z.string().trim().max(200).optional(),
    pembayaranId:    idSchema.optional(),
    kategori:        kwitansiKategoriSchema.default('REGULER'),
    jenisKeringanan: jenisKeringananSchema.optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.kategori === 'KERINGANAN' && !val.jenisKeringanan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jenisKeringanan'],
        message: 'Wajib pilih jenis keringanan.',
      })
    }
  })
export type KwitansiItemInput = z.infer<typeof kwitansiItemSchema>

/** Body untuk buat kwitansi baru. */
export const kwitansiCreateSchema = z.object({
  siswaId:      idSchema,
  tanggal:      z.coerce.date().optional(),
  namaOrangTua: z.string().trim().max(100).optional(),
  catatan:      z.string().trim().max(500).optional(),
  biayaAdm:     amountSchema.default(0),
  items:        z
    .array(kwitansiItemSchema)
    .min(1, 'Minimal 1 bulan pembayaran harus dipilih.')
    .max(36, 'Maksimal 36 bulan per kwitansi.'),
})
export type KwitansiCreateInput = z.infer<typeof kwitansiCreateSchema>

/** Body untuk update kwitansi. siswaId & nomor tidak bisa diubah. */
export const kwitansiUpdateSchema = z.object({
  tanggal:      z.coerce.date().optional(),
  namaOrangTua: z.string().trim().max(100).optional().nullable(),
  catatan:      z.string().trim().max(500).optional().nullable(),
  biayaAdm:     amountSchema.default(0),
  items:        z
    .array(kwitansiItemSchema)
    .min(1, 'Minimal 1 bulan pembayaran harus dipilih.')
    .max(36, 'Maksimal 36 bulan per kwitansi.'),
})
export type KwitansiUpdateInput = z.infer<typeof kwitansiUpdateSchema>

/** Filter list kwitansi. */
export const kwitansiFilterSchema = paginationSchema.extend({
  siswaId:      idSchema.optional(),
  q:            z.string().trim().max(200).optional(),   // cari nomor / nama siswa
  dateFrom:     z.coerce.date().optional(),
  dateTo:       z.coerce.date().optional(),
  createdById:  idSchema.optional(),
})
export type KwitansiFilterInput = z.infer<typeof kwitansiFilterSchema>
