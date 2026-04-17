import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const gradeEnum = z.enum(['X', 'XI', 'XII'])

export const rombelCreateSchema = z.object({
  tahunAjaranId: z
    .string({ required_error: 'Tahun ajaran wajib dipilih.' })
    .trim()
    .min(1, 'Tahun ajaran wajib dipilih.'),
  grade: gradeEnum,
  nomor: z.coerce
    .number({ invalid_type_error: 'Nomor rombel harus angka.' })
    .int('Nomor rombel harus bilangan bulat.')
    .min(1, 'Nomor rombel minimal 1.')
    .max(30, 'Nomor rombel maksimal 30.'),
  kode: z
    .string({ required_error: 'Kode rombel wajib diisi.' })
    .trim()
    .min(1, 'Kode rombel wajib diisi.')
    .max(16, 'Kode rombel terlalu panjang.'),
  waliKelas: z.string().trim().max(120).optional().nullable(),
})

export type RombelCreateInput = z.infer<typeof rombelCreateSchema>

export const rombelUpdateSchema = rombelCreateSchema.partial()
export type RombelUpdateInput = z.infer<typeof rombelUpdateSchema>

export const rombelFilterSchema = z
  .object({
    tahunAjaranId: z.string().trim().min(1).optional(),
    grade: gradeEnum.optional(),
    search: z.string().trim().max(200).optional(),
  })
  .merge(paginationSchema)

export type RombelFilterInput = z.infer<typeof rombelFilterSchema>
