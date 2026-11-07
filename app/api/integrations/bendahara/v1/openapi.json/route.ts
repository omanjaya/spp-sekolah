import { NextResponse } from 'next/server'

import { bendaharaOpenApi } from '@/lib/integration/bendahara-openapi'

export const dynamic = 'force-static'

/** Spesifikasi OpenAPI publik (tanpa data) untuk tim aplikasi bendahara. */
export function GET(): Response {
  return NextResponse.json(bendaharaOpenApi)
}
