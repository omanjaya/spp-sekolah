import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { idSchema } from '@/lib/validators/common.schema'
import { userUpdateSchema } from '@/lib/validators/user.schema'
import { userService } from '@/services/user.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function pickId(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return idSchema.parse(v)
}

export async function GET(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    return userService.getById(pickId(id))
  })(req)
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    const body = userUpdateSchema.parse(await req.json())
    return userService.update(pickId(id), body)
  })(req)
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    const resolved = pickId(id)
    await userService.remove(resolved)
    return { id: resolved }
  })(req)
}
