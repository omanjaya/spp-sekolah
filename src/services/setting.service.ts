import type { Setting } from '@prisma/client'

import { prisma } from '@/lib/db'
import type { SettingBulkInput, SettingKey, SettingUpsertInput } from '@/lib/validators/setting.schema'
import type { SettingDTO } from '@/types/domain'

function toDTO(s: Setting): SettingDTO {
  return {
    key: s.key,
    value: s.value,
    description: s.description,
    updatedAt: s.updatedAt.toISOString(),
  }
}

export const settingService = {
  async getAll(): Promise<SettingDTO[]> {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } })
    return rows.map(toDTO)
  },

  async getByKey(key: SettingKey | string): Promise<SettingDTO | null> {
    const row = await prisma.setting.findUnique({ where: { key } })
    return row ? toDTO(row) : null
  },

  async upsert(input: SettingUpsertInput): Promise<SettingDTO> {
    const row = await prisma.setting.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        value: input.value as never,
        description: input.description ?? null,
      },
      update: {
        value: input.value as never,
        description: input.description ?? undefined,
      },
    })
    return toDTO(row)
  },

  async bulkUpsert(input: SettingBulkInput): Promise<SettingDTO[]> {
    const results = await prisma.$transaction(
      input.items.map((item) =>
        prisma.setting.upsert({
          where: { key: item.key },
          create: {
            key: item.key,
            value: item.value as never,
            description: item.description ?? null,
          },
          update: {
            value: item.value as never,
            description: item.description ?? undefined,
          },
        }),
      ),
    )
    return results.map(toDTO)
  },

  toDTO,
}
