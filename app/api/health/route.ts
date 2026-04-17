import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      uptimeMs: process.uptime() * 1000,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
