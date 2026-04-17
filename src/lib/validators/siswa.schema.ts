import { z } from 'zod'
import { paginationSchema } from './common.schema'

/**
 * Schemas untuk Siswa. Dipakai oleh API routes & client forms.
 * `infer` ke TS type agar shared client + server.
 */

const NIS_REGEX = /^[0-9A-Za-z.-]+$/

export const genderEnum = z.enum(['L', 'P'])
export const statusSiswaEnum = z.enum(['AKTIF', 'PINDAH', 'LULUS', 'DO', 'CUTI'])

export const siswaCreateSchema = z.object({
  nis: z
    .string({ required_error: 'NIS wajib diisi.' })
    .trim()
    .min(1, 'NIS wajib diisi.')
    .max(32, 'NIS terlalu panjang.')
    .regex(NIS_REGEX, 'Format NIS tidak valid.'),
  nama: z
    .string({ required_error: 'Nama wajib diisi.' })
    .trim()
    .min(2, 'Nama minimal 2 karakter.')
    .max(120, 'Nama terlalu panjang.'),
  angkatan: z.coerce
    .number({ invalid_type_error: 'Angkatan harus angka.' })
    .int('Angkatan harus bilangan bulat.')
    .min(1990, 'Angkatan tidak valid.')
    .max(2100, 'Angkatan tidak valid.'),
  jenisKelamin: genderEnum.optional().nullable(),
  statusSiswa: statusSiswaEnum.optional(),
  alamat: z.string().trim().max(500, 'Alamat terlalu panjang.').optional().nullable(),
  kontakOrtu: z
    .string()
    .trim()
    .max(64, 'Kontak orang tua terlalu panjang.')
    .optional()
    .nullable(),
  catatan: z.string().trim().max(1000, 'Catatan terlalu panjang.').optional().nullable(),
})

export type SiswaCreateInput = z.infer<typeof siswaCreateSchema>

export const siswaUpdateSchema = siswaCreateSchema.partial()
export type SiswaUpdateInput = z.infer<typeof siswaUpdateSchema>

/**
 * Bulk import siswa (paste spreadsheet / array). Upsert via NIS.
 * Tidak boleh terlalu ketat — kolom opsional biarkan kosong.
 */
export const siswaBulkImportItemSchema = z.object({
  nis: z.string().trim().min(1).max(32).regex(NIS_REGEX),
  nama: z.string().trim().min(2).max(120),
  angkatan: z.coerce.number().int().min(1990).max(2100),
  jenisKelamin: genderEnum.optional().nullable(),
  alamat: z.string().trim().max(500).optional().nullable(),
  kontakOrtu: z.string().trim().max(64).optional().nullable(),
})

export type SiswaBulkImportItem = z.infer<typeof siswaBulkImportItemSchema>

export const siswaBulkImportSchema = z.object({
  items: z
    .array(siswaBulkImportItemSchema)
    .min(1, 'Minimal 1 baris data.')
    .max(5000, 'Maksimal 5000 baris per batch.'),
})

export type SiswaBulkImportInput = z.infer<typeof siswaBulkImportSchema>

export const siswaFilterSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    angkatan: z.coerce.number().int().min(1990).max(2100).optional(),
    status: statusSiswaEnum.optional(),
  })
  .merge(paginationSchema)

export type SiswaFilterInput = z.infer<typeof siswaFilterSchema>
