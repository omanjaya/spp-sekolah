import { z } from 'zod'

const KODE_REGEX = /^\d{4}\/\d{4}$/

export const tahunAjaranCreateSchema = z
  .object({
    kode: z
      .string({ required_error: 'Kode wajib diisi.' })
      .trim()
      .regex(KODE_REGEX, 'Format kode harus YYYY/YYYY (contoh 2023/2024).'),
    tahunMulai: z.coerce
      .number({ invalid_type_error: 'Tahun mulai harus angka.' })
      .int()
      .min(1990)
      .max(2100),
    tahunAkhir: z.coerce
      .number({ invalid_type_error: 'Tahun akhir harus angka.' })
      .int()
      .min(1990)
      .max(2100),
    tanggalMulai: z
      .string({ required_error: 'Tanggal mulai wajib diisi.' })
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal mulai tidak valid.'),
    tanggalAkhir: z
      .string({ required_error: 'Tanggal akhir wajib diisi.' })
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal akhir tidak valid.'),
    nominalSppDefault: z.coerce
      .number({ invalid_type_error: 'Nominal harus angka.' })
      .min(0, 'Nominal tidak boleh negatif.')
      .max(100_000_000, 'Nominal terlalu besar.')
      .default(350_000),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.tahunAkhir === v.tahunMulai + 1, {
    message: 'Tahun akhir harus tahun mulai + 1.',
    path: ['tahunAkhir'],
  })
  .refine((v) => Date.parse(v.tanggalAkhir) >= Date.parse(v.tanggalMulai), {
    message: 'Tanggal akhir harus setelah tanggal mulai.',
    path: ['tanggalAkhir'],
  })

export type TahunAjaranCreateInput = z.infer<typeof tahunAjaranCreateSchema>

/**
 * Update is looser — server akan re-validate overall constraint jika perlu.
 */
export const tahunAjaranUpdateSchema = z
  .object({
    kode: z
      .string()
      .trim()
      .regex(KODE_REGEX, 'Format kode harus YYYY/YYYY.')
      .optional(),
    tahunMulai: z.coerce.number().int().min(1990).max(2100).optional(),
    tahunAkhir: z.coerce.number().int().min(1990).max(2100).optional(),
    tanggalMulai: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal mulai tidak valid.')
      .optional(),
    tanggalAkhir: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Tanggal akhir tidak valid.')
      .optional(),
    nominalSppDefault: z.coerce.number().min(0).max(100_000_000).optional(),
    isActive: z.boolean().optional(),
  })

export type TahunAjaranUpdateInput = z.infer<typeof tahunAjaranUpdateSchema>
