import { z } from 'zod'

/**
 * Row-level action the user picks in the import preview UI.
 */
export const importActionSchema = z.enum([
  'import', // commit this row as a new pembayaran
  'skip', // ignore this row
  'replace', // replace the existing (siswaId, year, month) row
  'roll_forward', // move duplicate payment to siswa's next unpaid periode
  'create_siswa', // create a minimal Siswa master record then import
])
export type ImportAction = z.infer<typeof importActionSchema>

export const importSelectionSchema = z.object({
  rowIndex: z.number().int().min(0),
  action: importActionSchema,
})
export type ImportSelection = z.infer<typeof importSelectionSchema>

export const importConfirmSchema = z.object({
  batchId: z
    .string()
    .trim()
    .min(1, 'batchId wajib diisi.')
    .max(64, 'batchId tidak valid.'),
  selections: z
    .array(importSelectionSchema)
    .min(1, 'Minimal satu baris harus dipilih.')
    .max(20_000, 'Jumlah baris melebihi batas maksimum.'),
})
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>
