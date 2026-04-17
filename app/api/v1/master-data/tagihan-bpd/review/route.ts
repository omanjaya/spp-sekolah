import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { getTagihanReview } from '@/services/tagihan-bpd.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  return getTagihanReview()
})
