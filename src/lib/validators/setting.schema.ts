import { z } from 'zod'

/**
 * Known setting keys. `value` disimpan sebagai JSON, bisa string/number/bool/object.
 * Kami whitelist key untuk menjaga konsistensi — prevent typo / shadow keys.
 */
export const SETTING_KEYS = [
  'school.name',
  'school.address',
  'school.npsn',
  'school.headmaster',
  'pdf.header_title',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

const settingValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.unknown()),
  z.array(z.unknown()),
])

export const settingUpsertSchema = z.object({
  key: z.enum(SETTING_KEYS),
  value: settingValueSchema,
  description: z.string().trim().max(500).optional().nullable(),
})

export type SettingUpsertInput = z.infer<typeof settingUpsertSchema>

export const settingBulkSchema = z.object({
  items: z
    .array(settingUpsertSchema)
    .min(1, 'Minimal 1 pengaturan.')
    .max(50, 'Maksimal 50 pengaturan per batch.'),
})

export type SettingBulkInput = z.infer<typeof settingBulkSchema>
