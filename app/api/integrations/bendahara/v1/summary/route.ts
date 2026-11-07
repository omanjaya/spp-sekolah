import { integrationHandler } from '@/lib/integration/bendahara-auth'
import { integrasiBendaharaService } from '@/services/integrasi-bendahara.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = integrationHandler(async (req, client) => integrasiBendaharaService.summary(client, req.nextUrl.searchParams))
