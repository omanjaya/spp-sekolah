import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { importService } from '@/services/import.service'

export const GET = apiHandler(async () => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  return importService.listBatches(50)
})
