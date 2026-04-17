import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { userCreateSchema } from '@/lib/validators/user.schema'
import { userService } from '@/services/user.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    return userService.list()
  })(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const body = userCreateSchema.parse(await req.json())
    return userService.create(body)
  })(req)
}
