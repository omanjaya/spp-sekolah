import { integrationHandler } from '@/lib/integration/bendahara-auth'
import { integrasiBendaharaService } from '@/services/integrasi-bendahara.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = integrationHandler(async (_req, client) => integrasiBendaharaService.info(client))
