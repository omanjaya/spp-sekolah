/**
 * Audit logging helper for export actions.
 * Best-effort: failures here must not break the export stream itself.
 */

import { auditLogRepo } from '@/repositories/audit-log.repo'
import logger from '@/lib/logger'

export type ExportAction = 'EXPORT_PDF' | 'EXPORT_EXCEL' | 'EXPORT_BATCH' | 'EXPORT_PREVIEW_PDF'

export interface ExportAuditInput {
  userId: string
  action: ExportAction
  rombelId?: string
  angkatan?: number
  format?: 'pdf' | 'excel' | 'both' | 'zip'
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

export async function logExport(input: ExportAuditInput): Promise<void> {
  try {
    await auditLogRepo.create({
      user: { connect: { id: input.userId } },
      action: input.action,
      entity: input.rombelId ? 'Rombel' : 'Angkatan',
      entityId: input.rombelId,
      metadata: {
        ...(input.angkatan !== undefined ? { angkatan: input.angkatan } : {}),
        ...(input.format ? { format: input.format } : {}),
        ...(input.metadata ?? {}),
      },
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
  } catch (err) {
    logger.warn({ err }, 'logExport: failed to persist audit log')
  }
}
