import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { pembayaranPasteSchema } from '@/lib/validators/pembayaran.schema'
import { importService } from '@/services/import.service'

/**
 * Paste preview. Mirrors /import/preview but accepts TSV text instead of file.
 * Returns the same PreviewResult — the UI reuses the preview component.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = pembayaranPasteSchema.parse(await req.json())
  return importService.previewPaste(body.text, actor)
})
