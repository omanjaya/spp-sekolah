import { z } from 'zod'

/**
 * Action yang bisa dipilih user per-baris di UI preview Naik Kelas.
 *
 *   assign      — buat Enrollment siswa ke rombel target (nama DB dipakai)
 *   skip        — lewati baris ini
 *   pakai_db    — sama seperti assign, tapi sinyal eksplisit dari UI bahwa
 *                  user memilih nama dari DB meskipun berbeda dengan Excel
 *   pakai_excel — update siswa.nama ke namaExcel, lalu buat Enrollment
 *   buat_baru   — buat Siswa baru (NIS + nama dari Excel), lalu buat Enrollment
 */
export const naikKelasActionSchema = z.enum([
  'assign',
  'skip',
  'pakai_db',
  'pakai_excel',
  'buat_baru',
])
export type NaikKelasAction = z.infer<typeof naikKelasActionSchema>

export const naikKelasSelectionSchema = z.object({
  rowIndex: z.number().int().min(0),
  action: naikKelasActionSchema,
})
export type NaikKelasSelection = z.infer<typeof naikKelasSelectionSchema>

export const naikKelasConfirmSchema = z.object({
  batchId: z
    .string()
    .trim()
    .min(1, 'batchId wajib diisi.')
    .max(64, 'batchId tidak valid.'),
  tahunAjaranId: z
    .string()
    .trim()
    .min(1, 'tahunAjaranId wajib diisi.'),
  selections: z
    .array(naikKelasSelectionSchema)
    .min(1, 'Minimal satu baris harus dipilih.')
    .max(10_000, 'Jumlah baris melebihi batas maksimum.'),
})
export type NaikKelasConfirmInput = z.infer<typeof naikKelasConfirmSchema>
