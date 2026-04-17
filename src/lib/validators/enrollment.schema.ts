import { z } from 'zod'
import { paginationSchema } from './common.schema'

export const enrollmentAssignItemSchema = z.object({
  siswaId: z.string().trim().min(1, 'Siswa wajib dipilih.'),
  noAbsen: z.coerce.number().int().min(1).max(200).optional().nullable(),
})

export const enrollmentBulkAssignSchema = z.object({
  tahunAjaranId: z.string().trim().min(1, 'Tahun ajaran wajib dipilih.'),
  rombelId: z.string().trim().min(1, 'Rombel wajib dipilih.'),
  items: z
    .array(enrollmentAssignItemSchema)
    .min(1, 'Minimal 1 siswa.')
    .max(100, 'Maksimal 100 siswa per batch.'),
  /**
   * Kalau true, siswa yang sudah terdaftar di rombel lain pada tahun ajaran
   * yang sama akan "dipindah" (update enrollment). Default false = skip.
   */
  movePindahKelas: z.boolean().default(false),
})

export type EnrollmentBulkAssignInput = z.infer<typeof enrollmentBulkAssignSchema>

export const enrollmentFilterSchema = z
  .object({
    tahunAjaranId: z.string().trim().min(1).optional(),
    rombelId: z.string().trim().min(1).optional(),
    siswaId: z.string().trim().min(1).optional(),
  })
  .merge(paginationSchema)

export type EnrollmentFilterInput = z.infer<typeof enrollmentFilterSchema>
